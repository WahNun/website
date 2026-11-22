import { createClient } from '@supabase/supabase-js'
import { SITE_META } from '@/lib/siteMeta'
import { resolveBoatForBooking } from '@/lib/boats'
import { sendPostDive } from '@/lib/email'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function azoresDateStr(d?: Date): string {
  const date = d ?? new Date()
  return date.toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Azores' })
}

export type PostDiveResult = {
  date: string
  bookings: number
  mailed: number
  wishGranted: number
  skipped: number
  errors: Array<{ bookingId: string; error: string }>
}

export async function runPostDive({ date, isTest }: { date?: string; isTest: boolean }): Promise<PostDiveResult> {
  const supabase = serviceClient()
  const diveDate = date ?? azoresDateStr()

  const errors: Array<{ bookingId: string; error: string }> = []
  let mailed = 0
  let wishGranted = 0
  let skipped = 0

  // 1. All booking_sessions for this date, status in ('booked','completed')
  const { data: sessionRows, error: sessionErr } = await supabase
    .from('booking_sessions')
    .select('id, booking_id, session, boat_id, is_test')
    .eq('session_date', diveDate)
    .in('status', ['booked', 'completed'])
    .neq('session', 'night') // Night Dive läuft um 18:00 noch — keine Danke-Mail vor dem Tauchgang (Backlog: eigener Lauf am Folgetag)

  if (sessionErr) throw new Error(`booking_sessions query failed: ${sessionErr.message}`)
  if (!sessionRows?.length) return { date: diveDate, bookings: 0, mailed: 0, wishGranted: 0, skipped: 0, errors: [] }

  const bookingIds = [...new Set(sessionRows.map((r: Row) => r.booking_id as string))]

  // 2. Bookings — exclude cancelled/refunded
  const { data: bookingRows, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, boat_id, customer_email, customer_name, product_name, group_size, favourite_spot, is_test, status, checkin_completed_at')
    .in('id', bookingIds)
    // Audit O-9: unbezahlte (pending) und No-Shows bekommen keine Danke-Mail
    .not('status', 'in', '("cancelled","refunded","pending","no_show")')

  if (bookingErr) throw new Error(`bookings query failed: ${bookingErr.message}`)
  if (!bookingRows?.length) return { date: diveDate, bookings: 0, mailed: 0, wishGranted: 0, skipped: 0, errors: [] }

  // Anwesenheit: Wer heute NICHT eingecheckt hat, bekommt keine Danke-Mail und wird nicht abgeschlossen —
  // stattdessen entsteht ein Ticket „Was the guest there?“ mit zwei Knöpfen (Was there / No-show), siehe /api/attendance.
  // Das System rät nie selbst: ein vergessener Tablet-Check-in darf keinen No-show erzeugen.
  const notCheckedIn = (bookingRows as Row[]).filter(b => !b.checkin_completed_at && (b.is_test ?? false) === isTest)
  for (const b of notCheckedIn) {
    const note = `attendance:${b.id as string}:${diveDate}`
    const { data: existing } = await supabase.from('support_tickets').select('id').eq('note', note).maybeSingle()
    if (existing) continue
    const { error: tErr } = await supabase.from('support_tickets').insert({
      name: (b.customer_name as string | null) || 'Guest',
      email: (b.customer_email as string | null) || null,
      preferred_channel: 'internal',
      message: `Attendance check — ${(b.product_name as string | null) ?? 'booking'}, ${(b.customer_name as string | null) || 'guest'}, ${(b.group_size as number | null) ?? 1} guest(s), ${diveDate}.\nNo check-in was recorded for this booking today. Was the guest on the boat?\n→ "Was there" marks the booking completed (thank-you mail goes out). "No-show" marks it no_show (seats released, no refund).`,
      status: 'open',
      note,
    })
    if (tErr) {
      errors.push({ bookingId: b.id as string, error: `attendance ticket: ${tErr.message}` })
    } else {
      await supabase.from('booking_changelog').insert({ booking_id: b.id as string, action: 'attendance_ticket', description: `🎫 No check-in recorded on ${diveDate} — attendance ticket opened (Was there / No-show)` })
    }
  }
  const notCheckedInIds = new Set(notCheckedIn.map(b => b.id as string))

  // 3. Active boats (for resolveBoatForBooking fallback)
  const { data: boatRows } = await supabase
    .from('boats')
    .select('id')
    .eq('active', true)
    .order('sort_order')

  const boats = (boatRows ?? []) as { id: string }[]

  // 4. boat_status for this date — to filter out cancelled trips and get dive sites
  const { data: boatStatusRows } = await supabase
    .from('boat_status')
    .select('boat_id, session, status, dive_site, is_test')
    .eq('status_date', diveDate)

  const boatStatusMap = new Map<string, Row>()
  for (const bs of boatStatusRows ?? []) {
    boatStatusMap.set(`${bs.boat_id as string}:${bs.session as string}`, bs)
  }

  const bookingMap = new Map<string, Row>((bookingRows ?? []).map((b: Row) => [b.id as string, b]))

  // 5. Group sessions by booking_id
  const sessionsByBooking = new Map<string, Row[]>()
  for (const sess of sessionRows) {
    if (!bookingMap.has(sess.booking_id as string)) continue
    const arr = sessionsByBooking.get(sess.booking_id as string) ?? []
    arr.push(sess)
    sessionsByBooking.set(sess.booking_id as string, arr)
  }

  const totalBookings = sessionsByBooking.size

  for (const [bookingId, sessions] of sessionsByBooking) {
    const booking = bookingMap.get(bookingId)!
    const bookingIsTest = !!(booking.is_test || sessions.some((s: Row) => s.is_test))

    // Skip is_test mismatch — only process what matches the caller's isTest
    if (bookingIsTest !== isTest) { skipped++; continue }

    if (!booking.customer_email) { skipped++; continue }
    if (notCheckedInIds.has(bookingId)) { skipped++; continue } // Ticket entscheidet — keine Danke-Mail ohne Check-in

    // Collect spots from boat_status — one per session the booking was on
    const spots: string[] = []
    let hasActiveDive = false

    for (const sess of sessions) {
      const resolvedBoatId = resolveBoatForBooking(
        { boat_id: booking.boat_id },
        { boat_id: sess.boat_id },
        boats
      )
      if (!resolvedBoatId) continue

      const boatStatus = boatStatusMap.get(`${resolvedBoatId}:${sess.session as string}`)
      // If boat_status is explicitly cancelled, skip this session
      if (boatStatus?.status === 'cancelled') continue

      hasActiveDive = true
      const rawSite = boatStatus?.dive_site as string | null | undefined
      if (rawSite) {
        // Slug → name via SITE_META; freetext passes through unchanged
        const siteName = SITE_META[rawSite]?.name ?? rawSite
        if (!spots.includes(siteName)) spots.push(siteName)
      }
    }

    if (!hasActiveDive) { skipped++; continue }

    // 6. wish_granted: favourite_spot ∈ spot slugs of today
    const favSlug = booking.favourite_spot as string | null
    let thisWishGranted = false
    if (favSlug) {
      const favName = SITE_META[favSlug]?.name ?? favSlug
      thisWishGranted = spots.includes(favName)
    }

    // 7. Insert wish_grants rows when wish_granted (idempotent)
    if (thisWishGranted && favSlug) {
      for (const sess of sessions) {
        const resolvedBoatId = resolveBoatForBooking(
          { boat_id: booking.boat_id },
          { boat_id: sess.boat_id },
          boats
        )
        const boatStatus = resolvedBoatId
          ? boatStatusMap.get(`${resolvedBoatId}:${sess.session as string}`)
          : null
        if (boatStatus?.status === 'cancelled') continue
        if (boatStatus?.dive_site !== favSlug) continue

        await supabase.from('wish_grants').insert({
          booking_id: bookingId,
          booking_session_id: sess.id,
          spot_slug: favSlug,
          granted_on: diveDate,
          session: sess.session,
          is_test: bookingIsTest,
        }).then(({ error: e }) => {
          if (e && e.code !== '23505') {
            console.error('[postDive] wish_grants insert error:', e.message)
          }
        })
      }
    }

    // 8. Insert post_dive_mails — idempotent; only send if row is new
    const { data: inserted, error: insertErr } = await supabase
      .from('post_dive_mails')
      .insert({
        booking_id: bookingId,
        dive_date: diveDate,
        spots,
        wish_granted: thisWishGranted,
        is_test: bookingIsTest,
      })
      .select('id')
      .single()

    if (insertErr) {
      // 23505 = unique violation — already sent on a previous run
      if (insertErr.code === '23505') { skipped++; continue }
      errors.push({ bookingId, error: insertErr.message })
      continue
    }

    // 9. Send mail
    const firstName = (booking.customer_name as string | null)?.split(' ')[0] ?? null
    const mailResult = await sendPostDive({
      to: booking.customer_email as string,
      firstName,
      spots,
      wishGranted: thisWishGranted,
      wishSpotName: thisWishGranted && favSlug ? (SITE_META[favSlug]?.name ?? favSlug) : null,
      bookingId,
      isTest: bookingIsTest,
    })

    if (mailResult.ok) {
      mailed++
      if (thisWishGranted) wishGranted++
      await supabase
        .from('post_dive_mails')
        .update({ mail_sent_at: new Date().toISOString() })
        .eq('id', inserted.id)
    } else {
      await supabase
        .from('post_dive_mails')
        .update({ error: mailResult.error ?? 'unknown' })
        .eq('id', inserted.id)
      errors.push({ bookingId, error: mailResult.error ?? 'unknown' })
    }
  }

  // ── Audit O-2 / O-4: Tag abschließen ──
  // Sessions des Tages auf 'completed' (nur 'booked', nur bei nicht stornierten Buchungen), und für jeden
  // Gast mit Profil customers.last_dive_date = Tauchdatum — sonst rechnet die 12-Monats-SSU-Regel beim
  // nächsten Besuch mit dem Datum aus dem Check-in statt mit dem echten letzten Tauchgang.
  try {
    const activeIds = (bookingRows as Row[]).map(b => b.id as string).filter(id => !notCheckedInIds.has(id))
    if (activeIds.length) {
      // Night Dives laufen um 18:00 noch — die schließt der Lauf des Folgetags (session_date < heute)
      await supabase.from('booking_sessions').update({ status: 'completed' })
        .eq('session_date', diveDate).eq('status', 'booked').neq('session', 'night').in('booking_id', activeIds)
      await supabase.from('booking_sessions').update({ status: 'completed' })
        .lt('session_date', diveDate).eq('status', 'booked').eq('session', 'night').eq('is_test', isTest)
      // Buchung abschließen, wenn kein künftiger Tauchtag mehr offen ist
      const { data: futureRows } = await supabase.from('booking_sessions').select('booking_id').in('booking_id', activeIds).eq('status', 'booked').gt('session_date', diveDate)
      const stillOpen = new Set((futureRows ?? []).map((r: Row) => r.booking_id as string))
      const doneIds = activeIds.filter(id => !stillOpen.has(id))
      if (doneIds.length) {
        await supabase.from('bookings').update({ status: 'completed', updated_at: new Date().toISOString() }).in('id', doneIds).eq('status', 'confirmed')
      }
      const { data: slotRows } = await supabase.from('booking_customers').select('customer_id').in('booking_id', activeIds).not('customer_id', 'is', null)
      const customerIds = [...new Set((slotRows ?? []).map((r: Row) => r.customer_id as string))]
      if (customerIds.length) {
        // nur nach vorne: ein älteres Datum nie über ein neueres schreiben
        await supabase.from('customers').update({ last_dive_date: diveDate, updated_at: new Date().toISOString() })
          .in('id', customerIds).or(`last_dive_date.is.null,last_dive_date.lt.${diveDate}`)
      }
    }
  } catch (e) {
    errors.push({ bookingId: '-', error: `day close failed: ${e instanceof Error ? e.message : String(e)}` })
  }

  return { date: diveDate, bookings: totalBookings, mailed, wishGranted, skipped, errors }
}
