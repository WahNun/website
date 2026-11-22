import { createClient } from '@supabase/supabase-js'
import { stripeIsLiveKey } from './stripe'
import { INSTRUCTOR_PRODUCT_TYPES } from '@/lib/productType'

/**
 * Verfügbarkeit pro Tag und Session.
 *
 * Ein Tag ist buchbar, wenn drei Dinge stimmen:
 *   1. Vorlaufzeit — Buchungsschluss ist 18:00 Azoren-Zeit am Vortag
 *   2. Es fährt ein Boot — nicht alle Boote auf 'cancelled' gesetzt
 *   3. Es sind Sitze frei — Bootskapazität minus bereits gebuchte Plätze
 *
 * Crew aus dem Schedule sperrt bewusst NICHT: fehlt sie, wird der Tag nur
 * markiert, damit das Team es im Dashboard sieht. Ein Gast soll nicht daran
 * scheitern, dass der Dienstplan noch nicht geschrieben ist.
 */

export type SessionAvailability = {
  date: string
  session: SessionKey
  capacity: number
  booked: number
  seats_left: number
  bookable: boolean
  reason: null | 'past_cutoff' | 'no_boat' | 'full'
  crew_missing: boolean
  /**
   * Grösste Gruppe, die auf EIN Boot passt. Nicht dasselbe wie seats_left:
   * eine Buchung über mehrere Boote zu verteilen ist eine Betriebsentscheidung
   * und darf nicht still im Buchungsformular passieren.
   */
  max_party: number
  /** Abfahrt und erwartete Rückkehr, sofern für den Tag gesetzt. */
  departure_time: string | null
  eta: string | null
}

export type SessionKey = 'am' | 'pm' | 'night'
/** Bootssessions mit AM-/PM-Kapazität. 'night' ist der Night Dive (abends) — eigene Session, blockiert weder AM noch PM. */
export const BOAT_SESSIONS: ReadonlyArray<'am' | 'pm'> = ['am', 'pm']
/** Sortierreihenfolge der Sessions innerhalb eines Tages (String-Sort würde night vor pm stellen). */
export const SESSION_ORDER: Record<string, number> = { am: 0, pm: 1, night: 2, tbd: 3 }
export const sessionRank = (s: string | null | undefined) => SESSION_ORDER[(s ?? '').toLowerCase()] ?? 9
export const isNightProduct = (p: { id?: string | null } | null | undefined) => p?.id === 'night-dive'
/**
 * Session-Wert in booking_sessions: Bootssessions sind am/pm; Kurstage aus der Online-Buchung
 * kommen als 'tbd' — das Zeitfenster legt der Instructor danach im Front Office fest.
 * 'tbd' belegt Instructor-Kapazität (Schüler am Tag), aber keinen AM-/PM-Bootsplatz.
 */
export type BookingSessionKey = SessionKey | 'tbd'
/** Marker in booking_sessions.notes für den automatischen Refresher-Tag — zählt gegen das Instructor-Kontingent. */
export const SSU_SESSION_NOTE = 'Scuba Skills Update'

export const BOOKING_CUTOFF_HOUR = 18   // 18:00 Azoren am Vortag
/** Plätze pro Night Dive — vorläufig; Emanuel bestätigt Guide-Verhältnis bei Nacht. */
export const NIGHT_CAPACITY = 8

/**
 * Gastseitige Zeiten je Session — wann der Gast da sein soll, nicht wann das
 * Boot ablegt. Das ist bewusst getrennt: boat_status.departure_time ist eine
 * Betriebszeit, hier steht, was auf der Buchungsseite erscheint.
 * Wird aus app_settings.session_times gelesen, diese Werte sind der Fallback.
 */
export type SessionTimes = { arrive: string; back: string; label: string }
export const SESSION_TIMES_FALLBACK: Record<SessionKey, SessionTimes> = {
  am: { arrive: '08:00', back: '13:30', label: 'Morning' },
  pm: { arrive: '14:00', back: '18:30', label: 'Afternoon' },
  // Night Dive: Uhrzeit hängt vom Sonnenuntergang ab — wird vom Team bestätigt (app_settings.session_times.night überschreibt).
  night: { arrive: 'evening', back: '', label: 'Night Dive' },
}

export async function getSessionTimes(): Promise<Record<SessionKey, SessionTimes>> {
  try {
    const { data } = await serviceClient()
      .from('app_settings').select('value').eq('key', 'session_times').maybeSingle()
    const v = data?.value as Partial<Record<SessionKey, SessionTimes>> | undefined
    if (!v) return SESSION_TIMES_FALLBACK
    return {
      am: { ...SESSION_TIMES_FALLBACK.am, ...(v.am ?? {}) },
      pm: { ...SESSION_TIMES_FALLBACK.pm, ...(v.pm ?? {}) },
      night: { ...SESSION_TIMES_FALLBACK.night, ...(v.night ?? {}) },
    }
  } catch {
    return SESSION_TIMES_FALLBACK
  }
}

/**
 * Innerhalb dieses Fensters steht der Dienstplan und kann echt geprüft werden.
 * Danach gibt es nichts zu prüfen — für Juli existiert im März keine
 * Einteilung — und es greift das Planungskontingent aus `capacity_quota`.
 * Relevant für Kurse (online über /book → /api/availability/course und im Front Office):
 * im Fenster ohne eingetragenen Instructor gilt der Tag als „on request" (reason 'no_roster').
 * Tauchgänge hängen an Bootsplätzen und brauchen den Dienstplan nicht.
 * Wert liegt in app_settings.roster_horizon_days.
 */
export const ROSTER_HORIZON_DAYS_DEFAULT = 7

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Wanduhr auf den Azoren — die Insel wechselt zwischen UTC+0 und UTC−1. */
export function azoresNow(): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Atlantic/Azores',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parseInt(parts.hour as string, 10) }
}

/**
 * Plätze belegt erst eine bestätigte Buchung (Lucas 25.10.): confirmed = mindestens 50 % bezahlt bzw. als bezahlt markiert.
 * pending-Buchungen (Zahlungslink, Überweisung, Bar ohne Zahlung) halten KEINEN Platz.
 */
const SEAT_HOLDING_STATUSES = ['confirmed', 'completed']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seatHoldingBookingIds(db: any, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const uniq = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < uniq.length; i += 150) {
    const { data } = await db.from('bookings').select('id').in('id', uniq.slice(i, i + 150)).in('status', SEAT_HOLDING_STATUSES)
    for (const r of data ?? []) out.add((r as { id: string }).id)
  }
  return out
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)
}

/**
 * Buchungsschluss: 18:00 Azoren am Vortag.
 * Übermorgen und später ist immer offen, morgen nur bis 18:00 heute,
 * heute und alles davor ist zu.
 */
export function passesCutoff(date: string, now = azoresNow()): boolean {
  const diff = daysBetween(now.date, date)
  if (diff >= 2) return true
  if (diff === 1) return now.hour < BOOKING_CUTOFF_HOUR
  return false
}

export function addDays(date: string, n: number): string {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000)
  return d.toISOString().slice(0, 10)
}

/**
 * Buchungen über azoresdiving.com laufen auf AZD-Booten. Die Season Challenge
 * gehört zu einer anderen Firma (company = 'sc') — deren Plätze dürfen hier
 * nicht mitgezählt werden, sonst verkauft die Seite fremde Kapazität.
 */
export const DEFAULT_COMPANY = 'azd'

export async function getAvailability(
  from: string,
  to: string,
  company: string = DEFAULT_COMPANY,
  sandbox: boolean = false
): Promise<SessionAvailability[]> {
  const db = serviceClient()
  // In der Sandbox zählt Sandbox-Kapazität, im Livebetrieb echte. sandbox=true: Mitarbeiter-Sandbox (/book?sandbox=1).
  const isTest = sandbox || !stripeIsLiveKey()

  const [boatsRes, statusRes, sessionsRes, crewRes, draftsRes] = await Promise.all([
    db.from('boats').select('id,seats').eq('active', true).eq('company', company),
    db.from('boat_status').select('boat_id,status_date,session,status,departure_time,eta')
      .gte('status_date', from).lte('status_date', to).eq('is_test', isTest),
    db.from('booking_sessions').select('session_date,session,seats,booking_id')
      .gte('session_date', from).lte('session_date', to)
      .eq('is_test', isTest).eq('status', 'booked').or('is_boat_day.eq.true,session.eq.night'),
    db.from('crew_assignments').select('status_date,session,crew_role')
      .gte('status_date', from).lte('status_date', to).eq('is_test', isTest),
    // W-5: aktive Capacity-Holds aus laufenden Checkout-Sessions
    db.from('draft_bookings').select('date,session,num_divers')
      .gte('date', from).lte('date', to)
      .in('status', ['active', 'checked_out'])
      .gt('expires_at', new Date().toISOString()),
  ])

  const boats = boatsRes.data ?? []
  const totalSeats = boats.reduce((sum, b) => sum + b.seats, 0)

  const cancelled = new Map<string, Set<string>>()
  // Fahren mehrere Boote, gilt die früheste Abfahrt und die späteste Rückkehr
  const times = new Map<string, { departure: string | null; eta: string | null }>()
  for (const r of statusRes.data ?? []) {
    const key = `${r.status_date}_${r.session}`
    if (r.status === 'cancelled') {
      if (!cancelled.has(key)) cancelled.set(key, new Set())
      cancelled.get(key)!.add(r.boat_id)
      continue
    }
    const prev = times.get(key)
    times.set(key, {
      departure: !prev?.departure || (r.departure_time && r.departure_time < prev.departure) ? r.departure_time : prev.departure,
      eta: !prev?.eta || (r.eta && r.eta > prev.eta) ? r.eta : prev.eta,
    })
  }

  const holdingIds = await seatHoldingBookingIds(db, (sessionsRes.data ?? []).map((r: { booking_id: string }) => r.booking_id))
  const bookedSeats = new Map<string, number>()
  for (const r of (sessionsRes.data ?? []).filter((x: { booking_id: string }) => holdingIds.has(x.booking_id))) {
    const key = `${r.session_date}_${r.session}`
    bookedSeats.set(key, (bookedSeats.get(key) ?? 0) + (r.seats ?? 1))
  }

  // W-5: Draft-Holds — session im Draft ist 'AM'/'PM', normalisieren auf 'am'/'pm'
  const draftHolds = new Map<string, number>()
  for (const r of draftsRes.data ?? []) {
    const key = `${r.date}_${r.session?.toLowerCase()}`
    draftHolds.set(key, (draftHolds.get(key) ?? 0) + (r.num_divers ?? 1))
  }

  const hasCrew = new Set<string>()
  for (const r of crewRes.data ?? []) {
    if (r.crew_role === 'skipper' || r.crew_role === 'guide' || r.crew_role === 'instructor') {
      hasCrew.add(`${r.status_date}_${r.session}`)
    }
  }

  const now = azoresNow()
  const out: SessionAvailability[] = []

  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) {
    // Night Dive: keine Bootskapazität — eigene Zeile, nur Cutoff-Regel; Platzzahl zählt pro Night-Session (Guide-Kontingent, kein Boot).
    {
      const key = `${d}_night`
      const booked = bookedSeats.get(key) ?? 0
      out.push({
        date: d, session: 'night', capacity: NIGHT_CAPACITY, booked,
        seats_left: Math.max(0, NIGHT_CAPACITY - booked),
        bookable: passesCutoff(d, now) && booked < NIGHT_CAPACITY,
        reason: !passesCutoff(d, now) ? 'past_cutoff' : booked >= NIGHT_CAPACITY ? 'full' : null,
        crew_missing: false,
        max_party: Math.max(0, NIGHT_CAPACITY - booked),
        departure_time: null, eta: null,
      })
    }
    for (const session of BOAT_SESSIONS) {
      const key = `${d}_${session}`
      const cancelledBoats = cancelled.get(key) ?? new Set<string>()
      const running = boats.filter(b => !cancelledBoats.has(b.id))
      const capacity = running.reduce((sum, b) => sum + b.seats, 0)
      const booked = bookedSeats.get(key) ?? 0
      const drafts = draftHolds.get(key) ?? 0
      const seatsLeft = Math.max(0, capacity - booked - drafts)
      // Konservativ: solange Buchungen nicht boots-genau zugeordnet werden,
      // gehen belegte Plätze vom grössten Boot ab. Lieber eine Gruppe zu
      // klein angesetzt als eine, die am Steg nicht aufs Boot passt.
      const biggest = running.reduce((m, b) => Math.max(m, b.seats), 0)
      const maxParty = Math.max(0, Math.min(biggest, capacity - booked - drafts))

      let reason: SessionAvailability['reason'] = null
      if (!passesCutoff(d, now)) reason = 'past_cutoff'
      else if (capacity === 0) reason = 'no_boat'
      else if (seatsLeft === 0) reason = 'full'

      const t = times.get(key)
      out.push({
        date: d, session, capacity, booked: booked + drafts,
        seats_left: seatsLeft,
        bookable: reason === null,
        reason,
        crew_missing: !hasCrew.has(key),
        max_party: maxParty,
        departure_time: t?.departure ? t.departure.slice(0, 5) : null,
        eta: t?.eta ? t.eta.slice(0, 5) : null,
      })
    }
  }

  void totalSeats
  return out
}

// ─── Kurs-Verfügbarkeit ──────────────────────────────────────────────────────

export type CourseAvailability = {
  date: string
  /** Direkt buchbar — kein Anfragemodus, kein Stopp. */
  bookable: boolean
  /**
   * Über Tageskontingent — Kurs wechselt in Anfragemodus, aber kein hartes Sperren.
   * bookable ist dann false; das Frontend zeigt "Auf Anfrage".
   */
  request_only: boolean
  /**
   * 'full'       — Instruktoren × max_students bereits voll (nur wenn Dienstplan vorhanden).
   * 'no_roster'  — Innerhalb Planungshorizont, kein Instruktor eingetragen →
   *                request_only = true; das Team muss bestätigen.
   * 'over_quota' — Tageskontingent überschritten → request_only = true.
   * 'past_cutoff'— Buchungsschluss vorbei → hartes Sperren.
   */
  reason: null | 'past_cutoff' | 'no_roster' | 'over_quota' | 'full'
  /** Kursstudenten, die an diesem Tag bereits gebucht sind (alle Kurse). */
  booked_students: number
  /** Tageskontingent aus capacity_quota (null = kein Eintrag → gilt als unbegrenzt). */
  quota: number | null
  /** Wirksame Tageskapazität: Instruktoren × max/Instructor innerhalb des Horizonts, sonst quota (null = unbegrenzt). */
  capacity: number | null
  /**
   * Anzahl eingetragener Instruktoren an diesem Tag.
   * null = ausserhalb des Planungshorizonts ODER kein Dienstplan geschrieben.
   */
  instructor_count: number | null
  /**
   * True wenn innerhalb Planungshorizont aber kein Instruktor eingetragen.
   * Reines Dashboard-Warning — blockiert keine Buchung (→ request_only stattdessen).
   */
  instructor_missing: boolean
}

async function getRosterHorizon(): Promise<number> {
  try {
    const { data } = await serviceClient()
      .from('app_settings').select('value').eq('key', 'roster_horizon_days').maybeSingle()
    // Gespeichert als Zahl oder als { "days": N } (so steht es aktuell in app_settings) — beides lesen
    const v = data?.value as unknown
    const n = typeof v === 'number' ? v : (v && typeof v === 'object' && typeof (v as { days?: unknown }).days === 'number') ? (v as { days: number }).days : null
    if (n !== null && n > 0) return n
    return ROSTER_HORIZON_DAYS_DEFAULT
  } catch {
    return ROSTER_HORIZON_DAYS_DEFAULT
  }
}

/**
 * Kurs-Verfügbarkeit pro Kalendertag.
 *
 * Zwei Zeithorizonte:
 *   ≤ rosterHorizon Tage + Instruktor eingetragen: Dienstplan-basiert (präzise).
 *     → Voll, wenn gebuchte Studenten ≥ Instruktoren × maxStudentsPerInstructor.
 *
 *   ≤ rosterHorizon Tage, kein Instruktor eingetragen:
 *     → request_only = true, reason = 'no_roster' (kein hartes Sperren).
 *     → Buchungsinterface: "Auf Anfrage"; das Team bestätigt manuell.
 *
 *   > rosterHorizon Tage: Kontingent-basiert (capacity_quota).
 *     → Über Kontingent: request_only = true, reason = 'over_quota'.
 *     → Kein Quota-Eintrag: gilt als unbegrenzt buchbar.
 *
 * @param opts.maxStudentsPerInstructor  Aus course_prices; Standard 4 (SSI-Kurse).
 */
export async function getCourseAvailability(
  from: string,
  to: string,
  opts: { maxStudentsPerInstructor?: number; sandbox?: boolean } = {}
): Promise<CourseAvailability[]> {
  const db = serviceClient()
  const isTest = opts.sandbox === true || !stripeIsLiveKey()
  const rosterHorizon = await getRosterHorizon()
  const now = azoresNow()
  const maxPerInstructor = opts.maxStudentsPerInstructor ?? 4

  // Instruktoren-Query nur bis Planungshorizont — danach existiert kein Dienstplan
  const horizonDate = addDays(now.date, rosterHorizon)
  const instructorTo = horizonDate < to ? horizonDate : to

  // 1. capacity_quota für den gesamten Zeitraum
  // 2. crew_assignments Instruktoren bis Planungshorizont
  // 3. Alle Kurs-Booking-IDs (für den Join auf booking_sessions)
  const [quotaRes, instructorRes, courseBookingsRes] = await Promise.all([
    db.from('capacity_quota')
      .select('valid_from,valid_to,max_course_students,priority')
      .lte('valid_from', to)
      .gte('valid_to', from)
      .eq('is_test', isTest)
      .order('priority', { ascending: false }),

    db.from('crew_assignments')
      .select('status_date,crew_name')
      .gte('status_date', from)
      .lte('status_date', instructorTo)
      .eq('crew_role', 'instructor')
      .eq('is_test', isTest),

    // Instructor-belegende Buchungen (Kurse + Try Scuba) ermitteln, um booking_sessions filtern zu können
    db.from('bookings')
      .select('id')
      .in('product_type', [...INSTRUCTOR_PRODUCT_TYPES])
      .eq('is_test', isTest)
      .in('status', SEAT_HOLDING_STATUSES),
  ])

  const courseBookingIds = (courseBookingsRes.data ?? []).map(b => b.id)

  // 4. Gebuchte Kurs-Sessions im Zeitraum — plus Scuba-Skills-Update-Tage, die als Refresher an
  //    Fun-Dive-Buchungen hängen (notes = 'Scuba Skills Update'): die binden genauso einen Instructor.
  const [courseSessRes, ssuSessRes] = await Promise.all([
    courseBookingIds.length > 0
      ? db.from('booking_sessions')
          .select('id,session_date,seats')
          .gte('session_date', from).lte('session_date', to)
          .eq('is_test', isTest).eq('status', 'booked')
          .in('booking_id', courseBookingIds)
      : Promise.resolve({ data: [] as { id: string; session_date: string; seats: number }[] }),
    db.from('booking_sessions')
      .select('id,session_date,seats,booking_id')
      .gte('session_date', from).lte('session_date', to)
      .eq('is_test', isTest).eq('status', 'booked')
      .eq('notes', SSU_SESSION_NOTE),
  ])
  const ssuHolding = await seatHoldingBookingIds(db, (ssuSessRes.data ?? []).map((r: { booking_id: string }) => r.booking_id))
  const seenSess = new Set<string>()
  const bookedRows: { session_date: string; seats: number }[] = []
  for (const r of [...(courseSessRes.data ?? []), ...(ssuSessRes.data ?? []).filter((x: { booking_id: string }) => ssuHolding.has(x.booking_id))] as { id: string; session_date: string; seats: number }[]) {
    if (seenSess.has(r.id)) continue
    seenSess.add(r.id); bookedRows.push(r)
  }
  const bookedRes = { data: bookedRows }

  // ── Aufbau der Lookup-Maps ────────────────────────────────────────────────

  // capacity_quota → Map<Datum, maxStudents> — höchste Priorität gewinnt
  const quotaMap = new Map<string, number>()
  for (const q of quotaRes.data ?? []) {
    let d = q.valid_from
    while (daysBetween(d, q.valid_to) >= 0) {
      if (!quotaMap.has(d)) quotaMap.set(d, q.max_course_students)
      d = addDays(d, 1)
    }
  }

  // Instruktoren-Set pro Datum (distinct by crew_name)
  const instructorsByDate = new Map<string, Set<string>>()
  for (const r of instructorRes.data ?? []) {
    if (!instructorsByDate.has(r.status_date)) {
      instructorsByDate.set(r.status_date, new Set())
    }
    instructorsByDate.get(r.status_date)!.add(r.crew_name)
  }

  // Gebuchte Kursstudenten pro Datum
  const bookedByDate = new Map<string, number>()
  for (const r of bookedRes.data ?? []) {
    bookedByDate.set(r.session_date, (bookedByDate.get(r.session_date) ?? 0) + (r.seats ?? 1))
  }

  // ── Ausgabe berechnen ─────────────────────────────────────────────────────
  const out: CourseAvailability[] = []

  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) {
    const quota = quotaMap.get(d) ?? null
    const booked = bookedByDate.get(d) ?? 0
    const daysOut = daysBetween(now.date, d)
    const withinHorizon = daysOut <= rosterHorizon
    const instructorSet = instructorsByDate.get(d)
    const instructorCount = withinHorizon && instructorSet && instructorSet.size > 0
      ? instructorSet.size
      : null
    const instructorMissing = withinHorizon && instructorCount === null

    let bookable = false
    let request_only = false
    let reason: CourseAvailability['reason'] = null

    if (!passesCutoff(d, now)) {
      // Buchungsschluss — hartes Sperren
      reason = 'past_cutoff'
    } else if (withinHorizon && instructorCount !== null) {
      // Dienstplan vorhanden → präzise Kapazitätsprüfung
      const cap = instructorCount * maxPerInstructor
      if (booked >= cap) {
        reason = 'full'
      } else {
        bookable = true
      }
    } else if (instructorMissing) {
      // Innerhalb Horizont, kein Dienstplan → Anfragemodus (kein hartes Sperren)
      reason = 'no_roster'
      request_only = true
    } else {
      // Ausserhalb Horizont → Quota-Fallback
      if (quota !== null && booked >= quota) {
        reason = 'over_quota'
        request_only = true
      } else {
        bookable = true
      }
    }

    out.push({
      date: d,
      bookable,
      request_only,
      reason,
      booked_students: booked,
      quota,
      capacity: withinHorizon && instructorCount !== null ? instructorCount * maxPerInstructor : quota,
      instructor_count: instructorCount,
      instructor_missing: instructorMissing,
    })
  }

  return out
}

/** Serverseitige Gegenprüfung beim Checkout — dem Browser wird nicht geglaubt. */
export async function assertSessionsBookable(
  sessions: { date: string; session: BookingSessionKey }[],
  seats: number,
  boatSessionKeys?: Set<string>
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (sessions.length === 0) return { ok: false, error: 'No dive days selected' }

  const dates = sessions.map(s => s.date).sort()
  const all = await getAvailability(dates[0], dates[dates.length - 1])
  const index = new Map(all.map(a => [`${a.date}_${a.session}`, a]))

  for (const s of sessions) {
    if (s.session === 'tbd') {
      // Kurstag ohne festes Zeitfenster: Cutoff prüfen; ist es ein Bootstag, muss AM ODER PM noch Platz haben.
      const am = index.get(`${s.date}_am`); const pm = index.get(`${s.date}_pm`)
      if (!am && !pm) return { ok: false, error: `${s.date} is not a valid date` }
      if ((am ?? pm)!.reason === 'past_cutoff') {
        return { ok: false, error: `${s.date} is past the booking cutoff (18:00 Azores the day before)` }
      }
      const isBoat = boatSessionKeys === undefined || boatSessionKeys.has(`${s.date}_tbd`) || boatSessionKeys.has(`${s.date}_am`) || boatSessionKeys.has(`${s.date}_pm`)
      if (isBoat) {
        const fits = [am, pm].some(x => x && x.reason !== 'no_boat' && x.max_party >= seats)
        if (!fits) return { ok: false, error: `No boat session on ${s.date} has room for ${seats} guest(s) — please get in touch` }
      }
      continue
    }
    const key = `${s.date}_${s.session}`
    const a = index.get(key)
    if (!a) return { ok: false, error: `${s.date} ${s.session.toUpperCase()} is not a valid session` }
    if (a.reason === 'past_cutoff') {
      return { ok: false, error: `${s.date} is past the booking cutoff (18:00 Azores the day before)` }
    }
    if (boatSessionKeys === undefined || boatSessionKeys.has(key)) {
      if (a.reason === 'no_boat') return { ok: false, error: `No boat runs on ${s.date} ${s.session.toUpperCase()}` }
      if (a.max_party < seats) {
        const day = new Date(`${s.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
        const when = `${day} (${s.session === 'am' ? 'morning' : 'afternoon'})`
        return {
          ok: false,
          error: a.max_party <= 0
            ? `${when} is fully booked — please pick another day or send us an inquiry.`
            : `${when} has only ${a.max_party} seat${a.max_party === 1 ? '' : 's'} left on one boat — please pick another day, reduce your group or send us an inquiry.`,
        }
      }
    }
  }
  return { ok: true }
}
