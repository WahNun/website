import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { sendSessionTimesEmail } from '@/lib/email'
import { sessionRank, getAvailability } from '@/lib/availability'
import { auditStaff } from '@/lib/auditServer'

/**
 * GET  /api/bookings/assign-slots?booking_id=…  → offene (tbd) Sessions der Buchung + Kopfdaten (fürs Ticket).
 * POST /api/bookings/assign-slots { booking_id, slots: [{ session_id, session?: 'am'|'pm'|'full', start_time?, new_date? }], ticket_id? }
 *   session: Schicht setzen oder ändern; 'full' = AM + zusätzliche PM-Session am selben Tag.
 *   start_time ('HH:MM' | '' zum Löschen): konkrete Startzeit → booking_sessions.start_time + Gast-Mail.
 *   new_date: Tag verschieben (nicht in die Vergangenheit; Unique booking_id+date+session). is_boat_day: Boot ↔ Pool pro Session.
 *   Jede Änderung: Changelog + Mail an den Schüler mit dem kompletten Plan (offene Tage „to be confirmed“) — Lucas 24.10.:
 *   der Instructor plant oft erst einen Tag, der Schüler soll jedes Update sehen. Ticket resolved, sobald kein 'tbd' mehr offen ist.
 */
function db() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) }

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  const bookingId = req.nextUrl.searchParams.get('booking_id') ?? ''
  if (!bookingId) return NextResponse.json({ ok: false, error: 'booking_id required' }, { status: 400 })
  const supabase = db()
  const [{ data: b }, { data: sess }] = await Promise.all([
    supabase.from('bookings').select('id, product_name, customer_name, customer_email, group_size, status').eq('id', bookingId).maybeSingle(),
    supabase.from('booking_sessions').select('id, session_date, session, notes, is_boat_day, start_time').eq('booking_id', bookingId).eq('status', 'booked').order('session_date'),
  ])
  if (!b) return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })
  return NextResponse.json({ ok: true, booking: b, sessions: (sess ?? []).sort((x, y) => x.session_date.localeCompare(y.session_date) || sessionRank(x.session) - sessionRank(y.session)) })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  let body: { booking_id?: string; slots?: { session_id: string; session?: string | null; start_time?: string | null; new_date?: string | null; is_boat_day?: boolean | null }[]; ticket_id?: string; force?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const bookingId = body.booking_id ?? ''
  const slots = (body.slots ?? []).filter(s => s && typeof s.session_id === 'string')
  if (!bookingId || slots.length === 0) return NextResponse.json({ ok: false, error: 'booking_id and at least one slot required' }, { status: 400 })

  const supabase = db()
  const { data: b } = await supabase.from('bookings').select('id, status, booking_date, session, customer_name, customer_email, product_name, is_test').eq('id', bookingId).maybeSingle()
  if (!b) return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })
  if (b.status === 'cancelled') return NextResponse.json({ ok: false, error: 'Booking is cancelled' }, { status: 409 })

  const todayAz = new Date(new Date().toLocaleString('en-US', { timeZone: 'Atlantic/Azores' })).toISOString().slice(0, 10)
  const { data: before } = await supabase.from('booking_sessions').select('id, session_date, session, seats, is_boat_day, notes, is_test, boat_id, start_time').eq('booking_id', bookingId).eq('status', 'booked')
  const byId = new Map((before ?? []).map(s => [s.id as string, s]))
  const changed: string[] = []
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
  for (const s of slots) {
    const row = byId.get(s.session_id)
    if (!row) continue
    const upd: Record<string, unknown> = {}
    const parts: string[] = []
    // 1) Tag verschieben (Lucas 24.10.: Instructor plant oft erst einen Tag und schiebt die anderen)
    const nd = typeof s.new_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.new_date) ? s.new_date : null
    if (typeof s.new_date === 'string' && s.new_date.trim() && !nd) return NextResponse.json({ ok: false, error: `Invalid date for ${row.session_date}` }, { status: 400 })
    if (nd && nd !== row.session_date) {
      if (nd < todayAz) return NextResponse.json({ ok: false, error: `${fmt(nd)} is in the past` }, { status: 400 })
      upd.session_date = nd; parts.push(`moved ${fmt(row.session_date)} → ${fmt(nd)}`)
    }
    // 2) Schicht setzen/ändern
    const want = s.session === 'am' || s.session === 'pm' || s.session === 'full' ? s.session : null
    const first = want === 'full' ? 'am' : want
    if (first && first !== row.session) { upd.session = first; parts.push(want === 'full' ? 'FULL DAY (AM+PM)' : first.toUpperCase()) }
    else if (want === 'full' && row.session === 'am') parts.push('FULL DAY (AM+PM)')
    // 2b) Boot ↔ Pool (Lucas 24.10.: Instructor legt das pro Session im Ticket fest)
    if (typeof s.is_boat_day === 'boolean' && s.is_boat_day !== Boolean(row.is_boat_day)) { upd.is_boat_day = s.is_boat_day; parts.push(s.is_boat_day ? '🚤 boat' : '🏊 pool') }
    // 3) Startzeit
    if (s.start_time !== undefined) {
      const raw = typeof s.start_time === 'string' ? s.start_time.trim() : ''
      const st = raw && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null
      if (raw && !st) return NextResponse.json({ ok: false, error: `Start time for ${fmt(row.session_date)} must be HH:MM (e.g. 09:30)` }, { status: 400 })
      const cur = row.start_time ? String(row.start_time).slice(0, 5) : null
      if ((st ?? null) !== cur && (st || cur)) { upd.start_time = st; parts.push(st ? `start ${st}` : 'start time cleared') }
    }
    // Bootskapazität für Bootstage prüfen (Lucas 24.10.): Ziel-Slot(s) müssen die Plätze dieser Buchung noch hergeben.
    // Eigene Plätze im selben Slot zählen nicht gegen sich selbst. 'past_cutoff' ignorieren wir — Staff darf kurzfristig.
    const targetBoat = typeof upd.is_boat_day === 'boolean' ? upd.is_boat_day : Boolean(row.is_boat_day)
    if (!body.force && targetBoat && (Object.keys(upd).length > 0 || want === 'full')) {
      const targetDate = (upd.session_date as string) ?? row.session_date
      const targetSessions: string[] = want === 'full' ? ['am', 'pm'] : [String(upd.session ?? row.session)]
      const seatsNeeded = Number(row.seats ?? 1)
      const avail = await getAvailability(targetDate, targetDate)
      for (const ts of targetSessions) {
        if (ts === 'tbd') continue
        const a = avail.find(x => x.session === ts)
        if (!a) continue
        const ownHere = (row.session_date === targetDate && row.session === ts) ? seatsNeeded : 0
        const free = a.capacity - (a.booked - ownHere)
        if (a.reason === 'no_boat' || free < seatsNeeded) {
          // Staff darf überbuchen (Lucas 24.10.) — Warnung mit Override, keine Sperre
          return NextResponse.json({ ok: false, capacity_warning: true, error: a.reason === 'no_boat'
            ? `No boat runs on ${fmt(targetDate)} ${ts.toUpperCase()} — check Boat Management, or save anyway`
            : `Boat full on ${fmt(targetDate)} ${ts.toUpperCase()}: ${Math.max(0, free)} of ${a.capacity} seat(s) free, this booking needs ${seatsNeeded} — save anyway to overbook` }, { status: 409 })
        }
      }
    }
    if (Object.keys(upd).length > 0) {
      const { error } = await supabase.from('booking_sessions').update(upd).eq('id', s.session_id)
      if (error) return NextResponse.json({ ok: false, error: error.code === '23505' ? `${fmt((upd.session_date as string) ?? row.session_date)} ${String(upd.session ?? row.session).toUpperCase()} already exists on this booking` : `Could not update ${fmt(row.session_date)}: ${error.message}` }, { status: error.code === '23505' ? 409 : 500 })
      Object.assign(row, upd)
    }
    if (want === 'full') {
      // Ganzer Tag: zweite Hälfte als eigene PM-Session (Unique booking_id+date+session verhindert Doppel)
      const { error: pmErr } = await supabase.from('booking_sessions').insert({
        booking_id: bookingId, session_date: row.session_date, session: 'pm', seats: row.seats ?? 1, status: 'booked',
        is_boat_day: Boolean(row.is_boat_day), notes: row.notes ?? null, is_test: row.is_test ?? false, boat_id: row.boat_id ?? null,
      })
      if (pmErr && pmErr.code !== '23505') return NextResponse.json({ ok: false, error: `AM set, but PM for ${fmt(row.session_date)} failed: ${pmErr.message}` }, { status: 500 })
      if (pmErr?.code === '23505' && parts[parts.length - 1] === 'FULL DAY (AM+PM)' && !upd.session) parts.pop()
    }
    if (parts.length > 0) changed.push(`${fmt(row.session_date)}: ${parts.join(', ')}`)
  }
  if (changed.length === 0) return NextResponse.json({ ok: false, error: 'Nothing changed — pick a slot, a start time or a new date' }, { status: 409 })

  await auditStaff(supabase, user, 'sessions_changed', 'booking', bookingId, `Schedule changed: ${changed.join(' · ')}${body.force ? ' · boat capacity overridden' : ''}`, { changed, force: !!body.force })
  await supabase.from('booking_changelog').insert({
    booking_id: bookingId, action: 'session_updated', changed_by_email: user.email ?? null,
    description: `⏱ Schedule changed from instructor ticket by ${user.email ?? 'staff'}: ${changed.join(' · ')}${body.force ? ' · ⚠️ boat capacity overridden' : ''}`,
  })

  // Tag 1 (booking_date/session) nachziehen — Fallback für Bootskarte, Mails, Listen
  const { data: afterRows } = await supabase.from('booking_sessions').select('session_date, session, notes, start_time').eq('booking_id', bookingId).eq('status', 'booked')
  const all = (afterRows ?? []).sort((x, y) => x.session_date.localeCompare(y.session_date) || sessionRank(x.session) - sessionRank(y.session))
  const earliest = all[0]
  if (earliest && (earliest.session_date !== b.booking_date || (earliest.session !== 'tbd' && earliest.session !== b.session))) {
    await supabase.from('bookings').update({ booking_date: earliest.session_date, ...(earliest.session !== 'tbd' ? { session: earliest.session } : {}), updated_at: new Date().toISOString() }).eq('id', bookingId)
  }

  const remaining = all.filter(s => s.session === 'tbd').length
  if (remaining === 0) {
    await supabase.from('support_tickets').update({ status: 'resolved' }).eq('note', `booking:${bookingId}`).neq('status', 'resolved')
    if (body.ticket_id) await supabase.from('support_tickets').update({ status: 'resolved' }).eq('id', body.ticket_id)
    await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: 'ticket_resolved', description: '🎫 All time slots set — instructor ticket resolved' })
  }
  // Jede Änderung ist neue Info für den Schüler → Mail bei jedem Speichern (Lucas 24.10.); offene Tage stehen als „to be confirmed“ drin
  let mail: 'sent' | 'skipped' | 'error' = 'skipped'
  let mailError: string | undefined
  if (b.customer_email) {
    const r = await sendSessionTimesEmail({
      to: b.customer_email, customerName: b.customer_name, productName: b.product_name ?? 'Your course',
      sessions: all.map(x => ({ date: x.session_date, session: x.session, notes: x.notes, startTime: x.start_time })), isTest: !!b.is_test, bookingId,
      partial: remaining > 0, changes: changed,
    })
    if (r.ok) { mail = 'sent'; await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: 'email_sent', description: `📧 Schedule ${remaining > 0 ? 'update' : 'confirmation'} email sent to ${b.customer_email}` }) }
    else { mail = 'error'; mailError = r.error; await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: 'email_failed', description: `⚠️ Schedule email failed: ${r.error}` }) }
  }
  return NextResponse.json({ ok: true, set: changed, remaining, mail, ...(mailError ? { mail_error: mailError } : {}) })
}
