import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripeIsLiveKey } from '@/lib/stripe'
import { SITE_META } from '@/lib/siteMeta'
import {
  sendCheckinReminderAfterBooking,
  sendCheckinReminderWeekBefore,
  sendCheckinReminderTwoDays,
  sendCheckinReminderFinal,
  type CheckinReminderMailData,
} from '@/lib/email'
import { flagUnpaidBookingsAll } from '@/lib/unpaidWatch'

export const runtime = 'nodejs'
export const maxDuration = 60

// Stufenreihenfolge (chronologisch, dringlichste zuletzt):
//   after_booking — Buchung ≥ 1 Tag alt, keine andere Stufe faellig; freundlicher Hinweis
//   week_before   — daysUntil 5–7
//   two_days      — daysUntil == 2 (genau 2 Tage)
//   final         — daysUntil == 1 (letzter Hinweis vor Buchungsschluss 18:00 Azoren)
// Am Tauchtag (0) und danach (<0): gar nichts — Gast steht am Steg.
//
// Verpasste datumsbas. Stufen werden NICHT nachgeholt. Pro Lauf und Slot
// hoechstens eine Stufe — die dringlichste anwendbare. Da die Fenster sich
// nicht ueberschneiden, trifft an einem beliebigen Tag hoechstens eines zu.
type Stage = 'after_booking' | 'week_before' | 'two_days' | 'final'

function applicableStage(daysUntil: number, bookingAgeDays: number): Stage | null {
  // Datumsbas. Stufen haben Vorrang vor after_booking
  if (daysUntil === 1) return 'final'
  if (daysUntil === 2) return 'two_days'
  if (daysUntil >= 5 && daysUntil <= 7) return 'week_before'

  // after_booking: Tauchtag noch in der Zukunft, kein Datumsfenster aktiv,
  // Buchung war gestern oder frueher (bookingAgeDays >= 1)
  if (daysUntil > 0 && bookingAgeDays >= 1) return 'after_booking'

  return null
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export async function GET(req: NextRequest) {
  // ── 1. Secret check ────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = serviceClient()
  // is_test spiegelt den aktiven Stripe-Modus: Live-Key → echte Buchungen
  const isTest = !stripeIsLiveKey()

  // ── 2. Heute UTC-Mitternacht (Cron laeuft um 10:00 UTC) ───────────────────
  const now = new Date()
  // Audit O-7: Tagesgrenze in Azoren-Zeit (UTC−1 im Winter), nicht UTC — sonst kippt „morgen" um Mitternacht UTC
  const azParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Azores', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]))
  const todayUtc = new Date(Date.UTC(parseInt(azParts.year as string, 10), parseInt(azParts.month as string, 10) - 1, parseInt(azParts.day as string, 10)))

  // ── 3. Unvollstaendige Slots abrufen ─────────────────────────────────────
  const { data: slotRows, error: slotErr } = await supabase
    .from('booking_customers')
    .select(`
      id,
      booking_id,
      slot_index,
      invite_email,
      invite_token,
      is_test,
      customers!booking_customers_customer_id_fkey(name)
    `)
    .is('checkin_completed_at', null)
    .eq('is_test', isTest)

  if (slotErr) {
    console.error('[checkin-reminders] slot query error:', slotErr)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!slotRows?.length) {
    // Unbezahlt-Wache laeuft auch ohne Check-in-Erinnerungen (30.10.: frueher Return hat sie uebersprungen)
    const unpaid = await flagUnpaidBookingsAll(supabase)
    return NextResponse.json({ sent: 0, failed: 0, message: 'No incomplete slots', unpaid })
  }

  // ── 4. Buchungen dazu ─────────────────────────────────────────────────────
  const bookingIds = [...new Set(slotRows.map((s: Row) => s.booking_id as string))]

  const { data: bookingRows, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, customer_email, checkin_token, product_name, status, is_test, paid_at, created_at, favourite_spot')
    .in('id', bookingIds)
    .eq('is_test', isTest)

  if (bookingErr) {
    console.error('[checkin-reminders] booking query error:', bookingErr)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const bookingMap = new Map<string, Row>((bookingRows ?? []).map((b: Row) => [b.id, b]))

  // Nur aktive (nicht stornierte) Buchungen behalten
  const activeSlots = slotRows.filter((s: Row) => {
    const b = bookingMap.get(s.booking_id)
    // Audit AZD-015: unbezahlte (pending) Buchungen bekommen keine Check-in-Erinnerung — erst ab confirmed
    return b && (b.status === 'confirmed' || b.status === 'completed')
  })

  if (!activeSlots.length) {
    const unpaid = await flagUnpaidBookingsAll(supabase)
    return NextResponse.json({ sent: 0, failed: 0, message: 'No active incomplete slots', unpaid })
  }

  // ── 5. Ersten Session-Termin je Buchung bestimmen ─────────────────────────
  // Anker ist min(session_date) aus booking_sessions, nicht bookings.booking_date.
  const { data: sessionRows, error: sessionErr } = await supabase
    .from('booking_sessions')
    .select('booking_id, session_date')
    .in('booking_id', bookingIds)
    .eq('status', 'booked')
    .eq('is_test', isTest)

  if (sessionErr) {
    console.error('[checkin-reminders] session query error:', sessionErr)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const firstSessionMap = new Map<string, Date>()
  for (const sess of sessionRows ?? []) {
    const d = new Date(sess.session_date + 'T00:00:00Z')
    const existing = firstSessionMap.get(sess.booking_id)
    if (!existing || d < existing) firstSessionMap.set(sess.booking_id, d)
  }

  // ── 6. Bereits gesendete Stufen ───────────────────────────────────────────
  const slotIds = activeSlots.map((s: Row) => s.id as string)

  const { data: sentRows, error: sentErr } = await supabase
    .from('checkin_reminders')
    .select('booking_customer_id, stage')
    .in('booking_customer_id', slotIds)

  if (sentErr) {
    console.error('[checkin-reminders] sent-reminders query error:', sentErr)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const sentSet = new Set<string>((sentRows ?? []).map((r: Row) => `${r.booking_customer_id}:${r.stage}`))

  // ── 7. Anstehende Slots berechnen ─────────────────────────────────────────
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://azoresdiving.com').replace(/\/$/, '')
  const msPerDay = 1000 * 60 * 60 * 24

  interface PendingSlot {
    id: string
    bookingId: string
    targetEmail: string
    diverName: string | null
    slotIndex: number
    checkinUrl: string
    stage: Stage
    productName: string
    firstDiveDate: string
  }

  const pendingSlots: PendingSlot[] = []

  for (const slot of activeSlots) {
    const booking = bookingMap.get(slot.booking_id)!
    const firstSession = firstSessionMap.get(slot.booking_id)
    if (!firstSession) continue

    const daysUntil = Math.round((firstSession.getTime() - todayUtc.getTime()) / msPerDay)

    // Buchungsalter: Anzahl vergangener UTC-Tage seit Bezahlung (paid_at) oder
    // Erstellung (created_at). Noetig fuer after_booking-Bedingung.
    const bookingTs = booking.paid_at || booking.created_at
    const bookingDayUtc = bookingTs
      ? (() => {
          const d = new Date(bookingTs)
          return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        })()
      : null
    const bookingAgeDays = bookingDayUtc
      ? Math.round((todayUtc.getTime() - bookingDayUtc.getTime()) / msPerDay)
      : 0

    const stage = applicableStage(daysUntil, bookingAgeDays)
    if (!stage) continue
    if (sentSet.has(`${slot.id}:${stage}`)) continue

    const targetEmail = (slot.invite_email as string | null)?.trim() || (booking.customer_email as string | null)
    if (!targetEmail) continue

    const token = (slot.invite_token as string | null) || (booking.checkin_token as string | null)
    if (!token) continue

    pendingSlots.push({
      id: slot.id,
      bookingId: slot.booking_id,
      targetEmail,
      diverName: (slot.customers as { name?: string } | null)?.name ?? null,
      slotIndex: slot.slot_index as number,
      checkinUrl: `${siteOrigin}/checkin?token=${token}`,
      stage,
      productName: (booking.product_name as string | null) ?? 'your dive',
      firstDiveDate: firstSession.toISOString().slice(0, 10),
    })
  }

  if (!pendingSlots.length) {
    const unpaid = await flagUnpaidBookingsAll(supabase)
    return NextResponse.json({ sent: 0, failed: 0, message: 'Nothing to send', unpaid })
  }

  // ── 8. Gruppieren: (bookingId, targetEmail, stage) → eine Mail ────────────
  // Mehrere offene Slots auf derselben Zieladresse, Buchung und Stufe
  // erhalten EINE Mail mit allen Tauchern und je einem Link.
  interface Group {
    bookingId: string
    targetEmail: string
    stage: Stage
    slots: PendingSlot[]
    productName: string
    firstDiveDate: string
    favouriteSpot?: { slug: string; name: string }
  }

  const groups = new Map<string, Group>()
  for (const slot of pendingSlots) {
    const key = `${slot.bookingId}:${slot.targetEmail}:${slot.stage}`
    if (!groups.has(key)) {
      const booking = bookingMap.get(slot.bookingId)
      const spotSlug = (booking?.favourite_spot as string | null) ?? null
      groups.set(key, {
        bookingId: slot.bookingId,
        targetEmail: slot.targetEmail,
        stage: slot.stage,
        slots: [],
        productName: slot.productName,
        firstDiveDate: slot.firstDiveDate,
        ...(spotSlug && SITE_META[spotSlug] ? { favouriteSpot: { slug: spotSlug, name: SITE_META[spotSlug].name } } : {}),
      })
    }
    groups.get(key)!.slots.push(slot)
  }

  // ── 9. Senden und protokollieren ──────────────────────────────────────────
  // Scheitert ein Versand → keine Zeile in checkin_reminders, naechster Lauf
  // versucht es erneut. Versendete und fehlgeschlagene Mails landen via
  // sendMail immer in system_logs.
  let sent = 0
  let failed = 0
  const sentAt = new Date().toISOString()

  for (const group of groups.values()) {
    const data: CheckinReminderMailData = {
      to: group.targetEmail,
      divers: group.slots.map(s => ({
        name: s.diverName,
        slotIndex: s.slotIndex,
        checkinUrl: s.checkinUrl,
      })),
      firstDiveDate: group.firstDiveDate,
      productName: group.productName,
      isTest,
      bookingId: group.bookingId,
      ...(group.favouriteSpot ? { favouriteSpot: group.favouriteSpot } : {}),
    }

    let result: { ok: boolean; error?: string }
    switch (group.stage) {
      case 'after_booking': result = await sendCheckinReminderAfterBooking(data); break
      case 'week_before':   result = await sendCheckinReminderWeekBefore(data);   break
      case 'two_days':      result = await sendCheckinReminderTwoDays(data);      break
      case 'final':         result = await sendCheckinReminderFinal(data);        break
    }

    if (result.ok) {
      // Unique-Constraint (booking_customer_id, stage) sichert Idempotenz auch
      // bei gleichzeitigen Laeufen. ignoreDuplicates verhindert einen Fehler
      // bei Race-Bedingungen nach dem sentSet-Check oben.
      const { error: insertErr } = await supabase
        .from('checkin_reminders')
        .upsert(
          group.slots.map(s => ({
            booking_customer_id: s.id,
            stage: group.stage,
            sent_at: sentAt,
            is_test: isTest,
          })),
          { onConflict: 'booking_customer_id,stage', ignoreDuplicates: true }
        )

      if (insertErr) {
        console.error('[checkin-reminders] failed to record sent reminder:', insertErr)
      }
      sent++
    } else {
      failed++
    }
  }

  console.log(`[checkin-reminders] done: sent=${sent} failed=${failed} is_test=${isTest}`)
  // Audit K2: täglich unbezahlte Buchungen > 3 Tage melden (Admin-Mail + Changelog)
  const unpaid = await flagUnpaidBookingsAll(supabase)
  return NextResponse.json({ sent, failed, is_test: isTest, unpaid })
}
