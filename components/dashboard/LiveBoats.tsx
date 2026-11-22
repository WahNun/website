'use client'

import { waiverHref } from '@/lib/waiver'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, s } from '@/components/pages/_shared'
import { INSURANCE_LABEL, needsRefresher, monthsSince, type InsuranceSource } from '@/lib/insurance'
import { FileSection, FileRow } from './GuestFile'
import { ageOn, minorDepthLimit, minorShort } from '@/lib/minorDepth'
import FrontOfficeBookings from '@/components/pages/FrontOfficeBookings'

/**
 * Live Boat Tracking.
 *
 * Ersetzt das frühere hartcodierte Mockup. Die Boote kommen aus `boats`, der
 * Tagesstatus aus `boat_status`, die Crew aus `crew_assignments` und die
 * Passagiere aus dem eigenen Buchungssystem (`bookings` + `booking_customers`).
 * FareHarbor-Buchungen laufen bewusst in einem eigenen, klar markierten Block —
 * sie haben keinen Check-in und sollen mit dem neuen System nicht vermischt
 * werden.
 *
 * Sichtbarkeit von Testdaten regelt die RLS. Diese Komponente entscheidet nur,
 * ob überhaupt gerendert oder das Coming-Soon-Overlay gezeigt wird.
 */

export type Boat = { id: string; name: string; seats: number; company: string; sort_order: number }
export type Sess = 'am' | 'pm' | 'night'

export type BoatStatus = {
 boat_id: string; session: string; status: string
 departure_time: string | null; eta: string | null; dive_site: string | null; notes: string | null
 is_test: boolean
}
export type CrewRow = { boat_id: string; session: string; crew_name: string; crew_role: string; is_test: boolean }

export type Seat = {
 bookingId: string
 slotIndex: number
 name: string
 checkedIn: boolean
 medicalFlag: boolean
 insuranceFlag: boolean
 /** Eigene Police mit Nummer schon im Check-in genannt (Lucas 30.10.): schwaches Flag — nur Sichtpruefung, Nummer steht schon da */
 insurancePolicyOnFile?: boolean
 insuranceSource: string | null
 /** Unsere DAN-Policennummer (nur bei azd_day): offen = Taucher noch nicht grün */
 danPolicyOpen?: boolean
 /** Letzter Tauchgang > 12 Monate und Refresher noch nicht gemacht: nicht grün, bis erledigt */
 refresherOpen?: boolean
 /** Unter 18 und Crew hat noch nicht per Knopf bestätigt (Einverständnis + Tiefenlimit): nicht grün */
 minorOpen?: boolean
 /** „15 y · max 18 m“ */
 minorInfo?: string
 /** Tauchtag dieser Karte (YYYY-MM-DD): Refresher-Check läuft gegen diesen Tag */
 diveDate?: string
 isTest: boolean
 productName: string | null
 /** checkin_token aus bookings – nötig für den Staff-Resend-Button. */
 checkinToken: string | null
 /** E-Mail aus der Buchung (Zahler = Platz 1). Vor dem Check-in die einzige bekannte Adresse. */
 bookingEmail?: string | null
 /** Vollstaendige Akte fuer das Popup. Null, solange niemand eingecheckt hat. */
 slot: SlotRecord
 /** bookings.status — pending = unbezahlt (Audit K1), no_show/completed sichtbar markieren (O-1) */
 bookingStatus: string
 /** Platz aus booking_sessions.seats ohne booking_customers-Zeile (Audit O-3: Kapazität zählt seats) */
 placeholder?: boolean
}

export type CustomerRecord = {
 name: string | null; email: string | null; phone: string | null
 dob: string | null; nationality: string | null; experience_level: string | null
 cert_agency: string | null; cert_number: string | null
 insurance_provider: string | null; insurance_policy_number: string | null
 emergency_contact_name: string | null; emergency_contact_phone: string | null
 waiver_signed_at: string | null; waiver_pdf_url: string | null
 logged_dives: number | null; last_dive_date: string | null
} | null

export type SlotRecord = {
 id?: string
 slot_index: number
 guest_name?: string | null
 checkin_completed_at: string | null
 medical_flag: boolean
 medical_flag_resolved: boolean
 medical_flag_reason: string | null
 medical_ack_at: string | null
 medical_resolved_at?: string | null
 medical_resolved_by?: string | null
 insurance_flag?: boolean
 insurance_verified_at?: string | null
 insurance_verified_by?: string | null
 insurance_source?: string | null
 medical_proof_path?: string | null
 medical_proof_name?: string | null
 dan_policy_number?: string | null
 dan_submitted_at?: string | null
 is_minor?: boolean
 minor_ack_at?: string | null
 minor_ack_by?: string | null
 wetsuit_size: string | null
 bcd_size: string | null
 boot_size: string | null
 special_notes: string | null
 refresher_completed_at: string | null
 customers: CustomerRecord
}

type BookingRow = {
 id: string; checkin_token: string | null; product_name: string | null; session: string | null; group_size: number
 boat_id: string | null; customer_name: string | null; customer_email?: string | null; status: string; is_test: boolean
 booking_customers: SlotRecord[]
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
 scheduled: { label: ' SCHEDULED', color: '#c9c2b6', bg: 'rgba(201,194,182,.15)' },
 boarding: { label: ' BOARDING', color: '#c9b48a', bg: 'rgba(201,180,138,.15)' },
 out: { label: ' OUT', color: '#c9928c', bg: 'rgba(201,146,140,.15)' },
 returned: { label: ' DOCKED', color: '#b7c4b0', bg: 'rgba(183,196,176,.15)' },
 cancelled: { label: ' CANCELLED', color: '#a39e94', bg: 'rgba(136,148,164,.15)' },
}

function shortName(full: string | null | undefined): string {
 if (!full) return 'Guest'
 const parts = full.trim().split(/\s+/)
 return parts.length === 1 ? parts[0].slice(0, 12) : `${parts[0]} ${parts[parts.length - 1][0]}.`
}

/** Sitzplätze auf zwei Reihen verteilen, wie im ursprünglichen Entwurf. */
function seatPositions(count: number) {
 const top = Math.ceil(count / 2)
 const bottom = count - top
 const spread = (n: number, y1: number, y2: number) =>
 Array.from({ length: n }, (_, i) => ({
 x: 82 + (n <= 1 ? 0 : i * (296 / (n - 1))),
 y: i % 2 === 0 ? y1 : y2,
 }))
 return [...spread(top, 26, 42), ...spread(bottom, 184, 168)]
}

/** Rollen aus dem Schedule-Tab, die als Bootscrew in Frage kommen. */
const SCHEDULE_CREW_ROLES: Record<string, 'skipper' | 'guide' | 'instructor'> = {
 'Skipper': 'skipper',
 'Guide': 'guide',
 'DSD': 'instructor',
 'Instructor': 'instructor',
 'Course': 'instructor',
}

/** cell_key des Schedule-Tabs für ein Datum: <montag>_d<index>_<am|pm> */
function scheduleCellKeys(dateStr: string) {
 const n = new Date(dateStr + 'T12:00:00')
 const wd = n.getDay()
 const diff = wd === 0 ? -6 : 1 - wd
 const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() + diff)
 const monStr = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
 const dayIdx = wd === 0 ? 6 : wd - 1
 return { am: `${monStr}_d${dayIdx}_am`, pm: `${monStr}_d${dayIdx}_pm` }
}

export default function LiveBoats({
 rollDateStr, isAdmin, isMobile, simulationMode, onTbdChange, reloadKey = 0, onRefresh,
}: {
 rollDateStr: string
 isAdmin: boolean
 isMobile: boolean
 simulationMode: boolean
 /** Meldet Buchungen ohne Zeitfenster an die Übersicht (Kachel „Needs attention“) */
 onTbdChange?: (rows: { bookingId: string; seats: number }[]) => void
 /** Hochzählen = sofort neu laden (z. B. nach Schließen des Buchungs-Popups) */
 reloadKey?: number
 /** Refresh-Button: lädt das ganze Dashboard neu (Boote, Kurse, Needs attention) */
 onRefresh?: () => void
}) {
 const [refreshing, setRefreshing] = useState(false)
 const [boats, setBoats] = useState<Boat[]>([])
 const [statuses, setStatuses] = useState<BoatStatus[]>([])
 const [crew, setCrew] = useState<CrewRow[]>([])
 const [bookings, setBookings] = useState<BookingRow[]>([])
 // Welche Session hat DIESE Buchung an DIESEM Tag? Bei einem Dive Pack ist das
 // nicht bookings.session — das ist nur der erste Tag der Serie.
 const [daySession, setDaySession] = useState<Record<string, Sess>>({})
 // Kurs-/Refresher-Tage ohne Zeitfenster ('tbd') — belegen heute Instructor, aber noch kein Boot
 const [tbdToday, setTbdToday] = useState<{ bookingId: string; seats: number }[]>([])
 const [daySeats, setDaySeats] = useState<Record<string, number>>({})
 const [scheduleCrew, setScheduleCrew] = useState<Record<Sess, { name: string; role: string }[]>>({ am: [], pm: [], night: [] })
 const [loaded, setLoaded] = useState(false)
 const [busy, setBusy] = useState(false)
 // Vier Kacheln (2 Boote x 2 Sessions) waren zu viel auf einmal. Eine Reihe
 // pro Session, umgeschaltet — vorbelegt mit der Session, die gerade laeuft.
 const [view, setView] = useState<Sess>(() => new Date().getHours() < 13 ? 'am' : 'pm')
 // Hat der Nutzer fuer DIESEN Tag selbst umgeschaltet? Dann nie dazwischenfunken.
 const manualView = useRef<string | null>(null)
 const [openSeat, setOpenSeat] = useState<Seat | null>(null)

 const load = useCallback(async () => {
 // Simulation aus: nur Echtdaten (auch fuer Admins, die per RLS alles sehen duerften).
 // Simulation an: Test- und Echtdaten, wie in CourseLoad.
 const testFilter = simulationMode ? [true, false] : [false]
 const [boatsRes, statusRes, crewRes, bookingRes] = await Promise.all([
 supabase.from('boats').select('id,name,seats,company,sort_order').eq('active', true).order('sort_order'),
 supabase.from('boat_status').select('boat_id,session,status,departure_time,eta,dive_site,notes,is_test').eq('status_date', rollDateStr).in('is_test', testFilter),
 supabase.from('crew_assignments').select('boat_id,session,crew_name,crew_role,is_test').eq('status_date', rollDateStr).in('is_test', testFilter),
 // Ein Dive Pack taucht an mehreren Tagen. bookings.booking_date haelt nur
 // den ersten davon fest, die uebrigen stehen in booking_sessions — wer
 // nur nach booking_date filtert, verliert Tag 2 und 3 komplett vom Boot.
 // is_boat_day wird mitgeladen: Pool-/Hafentage (false) belegen keinen Platz auf dem Boot.
 supabase.from('booking_sessions')
 .select('booking_id,session,status,is_boat_day,seats')
 .eq('session_date', rollDateStr)
 .in('is_test', testFilter)
 .not('status', 'in', '("cancelled","refunded")'),
 ])
 for (const [label, res] of [['boats', boatsRes], ['boat_status', statusRes], ['crew', crewRes], ['booking_sessions', bookingRes]] as const) {
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const err = (res as any).error
 if (err) console.error(`[LiveBoats] Abfrage ${label} fehlgeschlagen:`, err)
 }

 setBoats(boatsRes.data ?? [])
 setStatuses((statusRes.data ?? []) as BoatStatus[])
 setCrew((crewRes.data ?? []) as CrewRow[])

 // Tagestermine aus booking_sessions plus Buchungen, die ihren Tag noch
 // klassisch in booking_date tragen (Walk-ins, Altbestand).
 const daySessions = (bookingRes.data ?? []) as { booking_id: string; session: string; is_boat_day: boolean | null; seats?: number | null }[]
 setTbdToday(daySessions.filter(r => (r.session ?? '').toLowerCase() === 'tbd').map(r => ({ bookingId: r.booking_id, seats: r.seats ?? 1 })))
 const sessionMap: Record<string, Sess> = {}
 const seatsByBooking: Record<string, number> = {}
 // Buchungen, die heute irgendeine Session haben (Boot ODER Pool). Für diese
 // entscheidet ausschliesslich booking_sessions.is_boat_day, nicht booking_date —
 // sonst erscheint ein in den Pool verlegter Tag weiter als Bootsbelegung.
 const hasSessionToday = new Set<string>()
 for (const r of daySessions) {
 hasSessionToday.add(r.booking_id)
 const sess = (r.session ?? '').toLowerCase()
 // Night ist eine eigene Abend-Session ohne Bootsslot (is_boat_day=false) und gehört trotzdem in den Night-Chip
 if (r.is_boat_day === false && sess !== 'night') continue
 if (sess === 'night' && sessionMap[r.booking_id]) continue // AM/PM am selben Tag hat Vorrang
 if (sess === 'am' || sess === 'pm' || sess === 'night') { sessionMap[r.booking_id] = sess; seatsByBooking[r.booking_id] = Math.max(seatsByBooking[r.booking_id] ?? 0, r.seats ?? 1) }
 }

 const select = 'id,checkin_token,product_name,session,group_size,boat_id,customer_name,customer_email,status,is_test,booking_customers!booking_customers_booking_id_is_test_fkey(id,slot_index,guest_name,checkin_completed_at,medical_flag,medical_flag_resolved,medical_flag_reason,medical_ack_at,medical_resolved_at,medical_resolved_by,insurance_flag,insurance_verified_at,insurance_verified_by,insurance_source,dan_policy_number,dan_submitted_at,medical_proof_path,medical_proof_name,is_minor,minor_ack_at,minor_ack_by,refresher_completed_at,refresher_completed_by,wetsuit_size,bcd_size,boot_size,special_notes,customers!booking_customers_customer_id_fkey(name,email,phone,dob,nationality,experience_level,cert_agency,cert_number,insurance_provider,insurance_policy_number,emergency_contact_name,emergency_contact_phone,waiver_signed_at,waiver_pdf_url,logged_dives,last_dive_date))'
 const ids = Object.keys(sessionMap)
 const [byDay, byId] = await Promise.all([
 supabase.from('bookings').select(select)
 .eq('booking_date', rollDateStr)
 .in('is_test', testFilter)
 .not('status', 'in', '("cancelled","refunded")'),
 ids.length > 0
 ? supabase.from('bookings').select(select)
 .in('id', ids)
 .in('is_test', testFilter)
 .not('status', 'in', '("cancelled","refunded")')
 : Promise.resolve({ data: [] as unknown[] }),
 ])

 // Eine fehlgeschlagene Abfrage darf nicht als „null Taucher" durchgehen.
 // Genau so blieb der eingebettete customers-Join monatelang unbemerkt kaputt:
 // data war null, das Panel zeigte ein leeres Boot, und niemand sah warum.
 for (const [label, res] of [['byDay', byDay], ['byId', byId]] as const) {
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const err = (res as any).error
 if (err) console.error(`[LiveBoats] Buchungsabfrage ${label} fehlgeschlagen:`, err)
 }

 const merged = new Map<string, BookingRow>()
 // byDay nur als Fallback für Buchungen ohne booking_sessions (Altbestand);
 // wer heute Sessions hat, kommt ausschliesslich über byId (= Bootstage).
 const byDayRows = ((byDay.data ?? []) as unknown as BookingRow[]).filter(r => !hasSessionToday.has(r.id))
 for (const row of [...byDayRows, ...(byId.data ?? [])] as unknown as BookingRow[]) {
 merged.set(row.id, row)
 }
 setDaySession(sessionMap)
 setDaySeats(seatsByBooking)
 setBookings([...merged.values()])

 // Crew-Vorschläge kommen aus dem Schedule-Tab desselben Tages
 const keys = scheduleCellKeys(rollDateStr)
 const { data: sched } = await supabase.from('schedule_data').select('cell_key,entries').in('cell_key', [keys.am, keys.pm]).eq('is_test', simulationMode)
 const next: Record<Sess, { name: string; role: string }[]> = { am: [], pm: [], night: [] }
 for (const row of sched ?? []) {
 const session: Sess = row.cell_key === keys.am ? 'am' : 'pm' // Schedule-Tab kennt keine Night-Zellen
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 next[session] = ((row.entries ?? []) as any[])
 .filter(e => e?.name && SCHEDULE_CREW_ROLES[e.role])
 .map(e => ({ name: e.name as string, role: e.role as string }))
 }
 setScheduleCrew(next)
 setLoaded(true)
 }, [rollDateStr, simulationMode])

 // eslint-disable-next-line react-hooks/set-state-in-effect -- externer Fetch, kein synchrones setState
 useEffect(() => { load() }, [load])
 useEffect(() => { onTbdChange?.(tbdToday) }, [tbdToday]) // eslint-disable-line react-hooks/exhaustive-deps
 // eslint-disable-next-line react-hooks/set-state-in-effect -- externer Fetch
 useEffect(() => { if (reloadKey > 0) load() }, [reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

 // Die Vorbelegung nach Uhrzeit stimmt nur fuer heute. Blaettert man auf einen
 // anderen Tag, zeigt sie unter Umstaenden die leere Haelfte — und ein leerer
 // Umschalter sieht genauso aus wie „keine Buchungen". Also: hat die aktuelle
 // Session an diesem Tag niemanden und die andere schon, wird umgeschaltet.
 // Datumswechsel: immer bei AM starten (vorhersehbar). Erstes Laden behält die Uhrzeit-Vorbelegung.
 const prevRollDate = useRef(rollDateStr)
 useEffect(() => {
 manualView.current = null
 if (prevRollDate.current !== rollDateStr) {
 prevRollDate.current = rollDateStr
 // eslint-disable-next-line react-hooks/set-state-in-effect -- reagiert auf Datumswechsel
 setView('am')
 }
 }, [rollDateStr])

 useEffect(() => {
 if (!loaded || manualView.current === rollDateStr) return
 const count = (sess: Sess) => bookings.reduce((n, b) => {
 const bs = daySession[b.id] ?? (b.session ?? '').toLowerCase()
 return bs === sess ? n + (b.booking_customers?.length ?? 0) : n
 }, 0)
 const other = view === 'am' ? 'pm' : 'am'
 // eslint-disable-next-line react-hooks/set-state-in-effect -- haengt an geladenen Daten, kein Render-Zyklus
 if (count(view) === 0 && count(other) > 0) setView(other)
 }, [loaded, bookings, daySession, rollDateStr, view])

 // Realtime: eine Buchung oder ein Check-in soll sofort auf dem Panel landen
 useEffect(() => {
 const ch = supabase.channel('live-boats')
 .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => load())
 .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_customers' }, () => load())
 .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_sessions' }, () => load())
 .on('postgres_changes', { event: '*', schema: 'public', table: 'boat_status' }, () => load())
 .on('postgres_changes', { event: '*', schema: 'public', table: 'crew_assignments' }, () => load())
 .subscribe()
 return () => { supabase.removeChannel(ch) }
 }, [load])

 // ── Nicht-Admins sehen weiter das Overlay ──
 if (!isAdmin) {
 return (
 <>
 <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', color: s.muted, marginBottom: '14px' }}>The Boats</div>
 <div style={{
 position: 'relative', marginBottom: '28px', minHeight: '180px', borderRadius: 0,
 background: 'rgba(10,28,50,.7)', border: '1px solid rgba(243,239,230,.15)',
 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
 }}>
 <div style={{ fontSize: '20px' }}></div>
 <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(243,239,230,.8)' }}>Coming Soon</div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', textAlign: 'center', lineHeight: 1.5 }}>Live boat tracking is in development</div>
 </div>
 </>
 )
 }

 // ── Sitze pro Boot + Session aus den eigenen Buchungen ──
 // pending=true liefert die Warteliste (unbezahlt/unconfirmed), sonst nur bestätigte Plätze fürs Boot
 function seatsFor(boatId: string, session: Sess, pending = false): Seat[] {
 const out: Seat[] = []
 for (const b of bookings) {
 if ((b.status === 'pending') !== pending) continue
 // Tages-Session gewinnt; bookings.session ist beim Pack nur Tag 1.
 const bookingSession = daySession[b.id] ?? (b.session ?? '').toLowerCase()
 if (bookingSession !== session) continue
 // Buchungen ohne Bootszuweisung landen beim ersten Boot der Session
 const assigned = b.boat_id ?? boats[0]?.id
 if (assigned !== boatId) continue
 const slots = b.booking_customers ?? []
 // Audit O-3: Kapazität rechnet mit booking_sessions.seats. Fehlen Gäste-Zeilen (z. B. Vorab-Buchung,
 // Gruppenänderung), zeigen wir Platzhalter, damit die Karte so voll ist wie die Verfügbarkeit.
 const wantSeats = Math.max(daySeats[b.id] ?? 0, b.group_size ?? 0, slots.length)
 for (let i = slots.length; i < wantSeats; i++) {
 out.push({
 bookingId: b.id, slotIndex: i, name: i === 0 ? (b.customer_name ?? `Seat ${i + 1}`) : `Seat ${i + 1}`,
 checkedIn: false, medicalFlag: false, insuranceFlag: false, insuranceSource: null,
 isTest: b.is_test, productName: b.product_name, checkinToken: b.checkin_token ?? null,
 slot: null as unknown as SlotRecord, bookingStatus: b.status, placeholder: true,
 })
 }
 for (const bc of slots) {
 out.push({
 bookingId: b.id,
 bookingStatus: b.status,
 slotIndex: bc.slot_index,
 // Vor dem Check-in kennen wir nur den Zahler — Platz 2..n ist offen.
 // Dann nummerieren statt fuenfmal „Guest": die Crew muss die Plaetze
 // auseinanderhalten koennen, auch wenn noch kein Name dranhaengt.
 name: bc.guest_name
 ?? bc.customers?.name
 ?? (bc.slot_index === 0 ? b.customer_name : null)
 ?? `Seat ${bc.slot_index + 1}`,
 checkedIn: bc.checkin_completed_at !== null,
 medicalFlag: bc.medical_flag && !bc.medical_flag_resolved,
 insuranceFlag: Boolean(bc.insurance_flag) && !bc.insurance_verified_at,
 insurancePolicyOnFile: Boolean((bc.customers?.insurance_policy_number ?? '').trim()),
 insuranceSource: bc.insurance_source ?? null,
 refresherOpen: needsRefresher(bc.customers?.last_dive_date, rollDateStr) && !bc.refresher_completed_at,
 diveDate: rollDateStr,
 danPolicyOpen: bc.insurance_source === 'azd_day' && !(bc.dan_policy_number ?? '').trim(),
 minorOpen: Boolean(bc.is_minor) && !bc.minor_ack_at,
 minorInfo: bc.is_minor ? minorShort(bc.customers?.dob, bc.customers?.experience_level, rollDateStr) : undefined,
 isTest: b.is_test,
 productName: b.product_name,
 checkinToken: b.checkin_token ?? null,
 bookingEmail: bc.slot_index === 0 ? (b.customer_email ?? null) : null,
 slot: bc,
 })
 }
 }
 return out.sort((a, b) => a.bookingId.localeCompare(b.bookingId) || a.slotIndex - b.slotIndex)
 }

 async function setStatus(boatId: string, session: Sess, patch: Record<string, unknown>) {
 setBusy(true)
 try {
 const existing = statuses.find(x => x.boat_id === boatId && x.session === session)
 if (existing) {
 await supabase.from('boat_status').update({ ...patch, updated_at: new Date().toISOString() })
 .eq('boat_id', boatId).eq('status_date', rollDateStr).eq('session', session).eq('is_test', existing.is_test)
 } else {
 await supabase.from('boat_status').insert({
 boat_id: boatId, status_date: rollDateStr, session,
 is_test: simulationMode, ...patch,
 })
 }
 await load()
 } finally { setBusy(false) }
 }

 async function toggleCrew(boatId: string, session: Sess, name: string, scheduleRole: string) {
 setBusy(true)
 try {
 const existing = crew.find(c => c.boat_id === boatId && c.session === session && c.crew_name === name)
 if (existing) {
 await supabase.from('crew_assignments').delete()
 .eq('boat_id', boatId).eq('status_date', rollDateStr).eq('session', session)
 .eq('crew_name', name).eq('is_test', existing.is_test)
 } else {
 await supabase.from('crew_assignments').insert({
 boat_id: boatId, status_date: rollDateStr, session,
 crew_name: name, crew_role: SCHEDULE_CREW_ROLES[scheduleRole] ?? 'guide',
 is_test: simulationMode,
 })
 }
 await load()
 } finally { setBusy(false) }
 }

 const sessions: Sess[] = ['am', 'pm', 'night']

 return (
 <>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
 <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', color: s.muted }}>The Boats</div>
 <button type="button" disabled={refreshing} title="Reload the dashboard" aria-label="Reload the dashboard"
 onClick={async () => { setRefreshing(true); try { if (onRefresh) onRefresh(); await load() } finally { setTimeout(() => setRefreshing(false), 600) } }}
 style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: 0, cursor: refreshing ? 'default' : 'pointer', fontFamily: s.font, fontSize: '14px', fontWeight: 800, letterSpacing: '.04em', background: 'rgba(243,239,230,.1)', color: s.accent, border: '1px solid rgba(243,239,230,.3)', opacity: refreshing ? .6 : 1 }}>
 <span aria-hidden="true" style={{ display: 'inline-block', transition: 'transform .6s', transform: refreshing ? 'rotate(360deg)' : 'none' }}></span>{refreshing ? 'Refreshing…' : 'Refresh'}
 </button>
 <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', fontSize: '14px', color: s.muted, flexWrap: 'wrap' }}>
 <Legend color="#b7c4b0" label="checked in" />
 <Legend color="#d4a07a" label="medical flag" glyph="!" />
 <Legend color="#c9928c" label="not checked in" />
 <Legend color="#f3efe6" label="crew" />
 <Legend color="#c9c2b6" label="policy on file, look at proof" glyph="" />
 <Legend color="#c9b48a" label="insurance proof to check" glyph="" />
 <Legend color="#c9928c" label="no insurance" glyph="" />
 <Legend color="#c9b48a" label="DAN no. missing" glyph="#" />
 <Legend color="#c9b48a" label="Refresher required" glyph="" />
 <Legend color="#c9b48a" label="under 18" glyph="18" />
 </div>
 </div>
 {!loaded ? (
 <div style={{ marginBottom: '28px', padding: '40px', textAlign: 'center', color: s.muted, fontSize: '14px', background: 'rgba(10,28,50,.4)', borderRadius: 0, border: '1px solid rgba(243,239,230,.1)' }}>Loading boats…</div>
 ) : boats.length === 0 ? (
 <div style={{ marginBottom: '28px', padding: '40px', textAlign: 'center', color: s.muted, fontSize: '14px', background: 'rgba(10,28,50,.4)', borderRadius: 0, border: '1px solid rgba(243,239,230,.1)' }}>No boats configured.</div>
 ) : (
 <>
 <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
 {sessions.map(sess => {
 const on = view === sess
 const guests = boats.reduce((n, b) => n + seatsFor(b.id, sess).length, 0)
 const waiting = boats.reduce((n, b) => n + seatsFor(b.id, sess, true).length, 0)
 return (
 <button key={sess} type="button" onClick={() => { manualView.current = rollDateStr; setView(sess) }} style={{
 padding: '8px 18px', borderRadius: 0, cursor: 'pointer', fontFamily: s.font,
 fontSize: '14px', fontWeight: 800, letterSpacing: '.06em',
 background: on ? 'rgba(243,239,230,.15)' : 'rgba(255,255,255,.04)',
 color: on ? s.accent : s.muted,
 border: `1px solid ${on ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.1)'}`,
 }}>
 {sess === 'night' ? ' NIGHT' : sess.toUpperCase()}
 <span style={{ fontWeight: 600, opacity: .75 }}> · {guests} diver{guests === 1 ? '' : 's'}{waiting > 0 ? ` · ${waiting} waiting` : ''}</span>
 </button>
 )
 })}
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '12px' : '20px', marginBottom: '20px' }}>
 {boats.map(boat => {
 const st = statuses.find(x => x.boat_id === boat.id && x.session === view)
 const boatCrew = crew.filter(c => c.boat_id === boat.id && c.session === view)
 const seats = seatsFor(boat.id, view)
 return (
 <BoatCard
 key={`${boat.id}-${view}`}
 boat={boat} session={view} status={st} crew={boatCrew} seats={seats}
 onOpenSeat={seat => { if (seat.placeholder) { alert(`Seat reserved for booking ${seat.bookingId.slice(0, 8).toUpperCase()} — guest details appear once the booking has guest slots (after payment / check-in).`); return } setOpenSeat(seat) }}
 available={scheduleCrew[view]} busy={busy}
 onStatus={patch => setStatus(boat.id, view, patch)}
 onToggleCrew={(name, role) => toggleCrew(boat.id, view, name, role)}
 />
 )
 })}
 <div style={boats.length === 1 ? { display: 'flex', flexDirection: 'column', gap: '12px', alignSelf: 'start' } : { display: 'contents' }}>
 {(() => {
 const waitlist = boats.flatMap(b => seatsFor(b.id, view, true))
 if (waitlist.length === 0) return null
 return (
 <div style={{ border: '1px solid rgba(201,180,138,.3)', background: 'rgba(201,180,138,.05)', borderRadius: 0, padding: '16px 18px', alignSelf: 'start', gridColumn: '1 / -1' }}>
 <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
 <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: '#c9b48a' }}>Waiting list · {view === 'night' ? ' NIGHT' : view.toUpperCase()}</div>
 <div style={{ fontSize: '14px', fontWeight: 700, color: '#c9b48a' }}>{waitlist.length} unpaid</div>
 </div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5, marginBottom: '12px' }}>Not confirmed yet — a seat moves onto the boat as soon as the booking is paid (≥ 50 %).</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {waitlist.map(w => (
 <button key={`${w.bookingId}-${w.slotIndex}`} type="button" onClick={() => setOpenSeat(w)}
 style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', width: '100%', padding: '8px 10px', borderRadius: 0, cursor: 'pointer', fontFamily: s.font, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(201,180,138,.25)', color: s.text }}>
 <span style={{ fontSize: '14px', fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
 <span style={{ fontSize: '14px', color: s.muted, whiteSpace: 'nowrap' }}>{w.productName ?? 'Booking'}</span>
 <span style={{ fontSize: '14px', fontWeight: 800, color: '#090909', background: '#c9b48a', borderRadius: 0, padding: '0 4px' }}>UNPAID</span>
 {w.isTest && <span style={{ fontSize: '14px', fontWeight: 800, color: '#c9b48a' }}>TEST</span>}
 </button>
 ))}
 </div>
 </div>
 )
 })()}
 <InsuranceCasesCard
 label={view === 'night' ? ' NIGHT' : view.toUpperCase()}
 seats={boats.flatMap(b => seatsFor(b.id, view).map(x => ({ seat: x, boat: b.name }))).filter(({ seat: x }) => seatAlerts(x).length > 0)}
 onOpen={setOpenSeat} onSaved={load}
 />
 </div>
 </div>
 </>
 )}

 {openSeat && <DiverFile key={openSeat.slot?.id ?? `${openSeat.bookingId}-${openSeat.slotIndex}`} seat={openSeat} onClose={() => setOpenSeat(null)} onReload={load} />}
 </>
 )
}

type HistoryRow = { id: string; created_at: string; user_email: string; user_name?: string | null; action_type: string; source?: 'diver' | 'booking' }

const DIVER_ACTION_LABELS: Record<string, string> = {
 insurance_proof_seen: ' Insurance proof seen',
 insurance_proof_undone: ' Insurance proof undone',
 medical_clearance_seen: ' Medical clearance seen',
 medical_clearance_undone: ' Medical clearance undone',
 minor_acknowledged: ' Under-18 diver acknowledged',
 minor_ack_undone: ' Under-18 acknowledgement undone',
 refresher_completed: ' Refresher completed',
 refresher_undone: ' Refresher undone',
 medical_proof_attached: ' Medical proof uploaded',
 medical_proof_removed: ' Medical proof removed',
 dan_policy_recorded: ' DAN policy number recorded',
 dan_policy_cleared: ' DAN policy number cleared',
 insurance_onsite_purchased: '€ DAN day cover sold on-site',
 insurance_onsite_undone: ' On-site day cover flag undone',
}

function formatHistoryTs(iso: string) {
 const d = new Date(iso)
 return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
 + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Gaesteakte am Boot.
 *
 * Was die Crew vor dem Ablegen wissen muss, auf einem Blatt: Brevet, Erfahrung,
 * Auffrischungspflicht, Versicherung, Notfallkontakt, Ausruestungsgroessen und
 * offene Flags. Bewusst kein Auszug — wer am Steg nachfragen muss, fragt nicht
 * nach, sondern laesst es.
 */
function DiverFile({ seat, onClose, onReload }: { seat: Seat; onClose: () => void; onReload: () => void }) {
 const [slot, setSlot] = useState<SlotRecord>(seat.slot)
 const [bookingPopup, setBookingPopup] = useState(false)
 const [insState, setInsState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 const [onsiteState, setOnsiteState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 // Steg-Kauf: Zahlungsart ist Pflicht (Geld landet als bezahlte Position an der Buchung); Nachweis: Police muss stehen
 const [onsiteMethod, setOnsiteMethod] = useState<'cash' | 'card' | 'revolut' | 'later' | ''>('')
 const [proofProvider, setProofProvider] = useState<string>(slot?.customers?.insurance_provider ?? '')
 const [proofPolicy, setProofPolicy] = useState<string>(slot?.customers?.insurance_policy_number ?? '')
 const [medModal, setMedModal] = useState(false)
 const [medFile, setMedFile] = useState<File | null>(null)
 const [medUp, setMedUp] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 const [proofView, setProofView] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 const [danState, setDanState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 const [danPolicy, setDanPolicy] = useState<string>(slot?.dan_policy_number ?? '')
 const [medState, setMedState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 const [refresherState, setRefresherState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 const [minorState, setMinorState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
 const [resendState, setResendState] = useState<{ loading: boolean; sent: boolean; error: string | null }>({ loading: false, sent: false, error: null })
 const [resendEmail, setResendEmail] = useState<string>(seat.bookingEmail ?? '')
 const [history, setHistory] = useState<HistoryRow[]>([])
 const [activeTab, setActiveTab] = useState<'status'|'akte'|'history'>('status')
 // Profil-Untertabs (Contact / Health / Dive) — waren mit 1132706 (GuestFile-Extraktion) verloren gegangen
 const [activeAkteTab, setActiveAkteTab] = useState<'contact'|'health'>('contact')

 const cu = slot?.customers ?? null
 const refresher = needsRefresher(cu?.last_dive_date, seat.diveDate ?? null) && !slot?.refresher_completed_at
 const months = monthsSince(cu?.last_dive_date, seat.diveDate ? new Date(seat.diveDate + 'T12:00:00') : undefined)

 // History = Staff-Aktionen am Taucher (audit_log) + Buchungs-Log (booking_changelog: Zahlungen, Status,
 // Sessions, Mails) — chronologisch gemischt, Quelle pro Zeile gekennzeichnet.
 const loadHistory = useCallback(async () => {
 if (!slot?.id) return
 const [diverRes, bookingRes] = await Promise.all([
 supabase.from('audit_log').select('id,created_at,user_email,action_type')
 .eq('entity_type', 'booking_customer').eq('entity_id', slot.id),
 supabase.from('booking_changelog').select('id,changed_at,changed_by_email,action,description')
 .eq('booking_id', seat.bookingId),
 ])
 const diverRows: HistoryRow[] = ((diverRes.data ?? []) as { id: string; created_at: string; user_email: string; action_type: string }[])
 .map(r => ({ ...r, source: 'diver' as const }))
 const bookingRows: HistoryRow[] = ((bookingRes.data ?? []) as { id: string; changed_at: string; changed_by_email: string | null; action: string; description: string | null }[])
 .map(r => ({ id: r.id, created_at: r.changed_at, user_email: r.changed_by_email ?? '', action_type: r.description ?? r.action, source: 'booking' as const }))
 setHistory([...diverRows, ...bookingRows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
 }, [slot?.id, seat.bookingId])

 useEffect(() => { loadHistory() }, [loadHistory])

 async function uploadMedicalProof() {
 if (!medFile || !slot?.id) { setMedUp({ loading: false, error: 'Choose the clearance file first (photo, PDF or scan)' }); return }
 setMedUp({ loading: true, error: null })
 try {
 const r1 = await fetch('/api/dashboard/medical-proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_customer_id: slot.id, filename: medFile.name, content_type: medFile.type || 'application/octet-stream', size: medFile.size }) })
 const d1 = await r1.json().catch(() => ({}))
 if (!r1.ok) { setMedUp({ loading: false, error: `${r1.status} — ${d1.error ?? 'Unknown error'}` }); return }
 const up = await supabase.storage.from('medical-proofs').uploadToSignedUrl(d1.path, d1.token, medFile, { contentType: medFile.type || 'application/octet-stream' })
 if (up.error) { setMedUp({ loading: false, error: `Upload failed: ${up.error.message}` }); return }
 const ok = await resolveFlag('medical_proof', true, { proof_path: d1.path, proof_name: medFile.name })
 setMedUp({ loading: false, error: null })
 if (ok) { setMedModal(false); setMedFile(null) }
 } catch (e) { setMedUp({ loading: false, error: e instanceof Error ? e.message : 'Network error' }) }
 }

 async function openMedicalProof() {
 if (!slot?.id) return
 setProofView({ loading: true, error: null })
 try {
 const res = await fetch(`/api/dashboard/medical-proof?booking_customer_id=${encodeURIComponent(slot.id)}`)
 const d = await res.json().catch(() => ({}))
 if (!res.ok) { setProofView({ loading: false, error: `${res.status} — ${d.error ?? 'Unknown error'}` }); return }
 window.open(d.url, '_blank', 'noopener')
 setProofView({ loading: false, error: null })
 } catch (e) { setProofView({ loading: false, error: e instanceof Error ? e.message : 'Network error' }) }
 }

 async function resendCheckinLink() {
 const email = slot?.customers?.email || resendEmail.trim() || seat.bookingEmail || null
 if (!email) {
 setResendState({ loading: false, sent: false, error: 'Please enter an email address.' })
 return
 }
 if (!seat.checkinToken) {
 setResendState({ loading: false, sent: false, error: 'Kein Check-in-Token für diese Buchung gefunden.' })
 return
 }
 setResendState({ loading: true, sent: false, error: null })
 try {
 const res = await fetch('/api/checkin/invite', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ token: seat.checkinToken, invites: [{ slot_index: seat.slotIndex, email }] }),
 })
 const data = await res.json()
 if (!res.ok) {
 setResendState({ loading: false, sent: false, error: `${res.status} — ${data.error ?? 'Unknown error'}` })
 } else {
 setResendState({ loading: false, sent: true, error: null })
 }
 } catch (e) {
 setResendState({ loading: false, sent: false, error: e instanceof Error ? e.message : 'Network error' })
 }
 }

 async function resolveFlag(kind: 'insurance' | 'insurance_onsite' | 'medical' | 'medical_proof' | 'refresher' | 'dan_policy' | 'minor', resolved: boolean, extra?: Record<string, unknown>): Promise<boolean> {
 const setState = kind === 'dan_policy' ? setDanState : kind === 'insurance' ? setInsState : kind === 'insurance_onsite' ? setOnsiteState : kind === 'refresher' ? setRefresherState : kind === 'minor' ? setMinorState : setMedState
 setState({ loading: true, error: null })
 try {
 const res = await fetch('/api/dashboard/resolve-flag', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 booking_customer_id: slot?.id, kind, resolved,
 ...(kind === 'insurance_onsite' && resolved ? { payment_method: onsiteMethod } : {}),
 ...(extra ?? {}),
 ...(kind === 'dan_policy' && resolved ? { dan_policy_number: danPolicy.trim() } : {}),
 ...(kind === 'insurance' && resolved ? { insurance_provider: proofProvider.trim(), insurance_policy_number: proofPolicy.trim() } : {}),
 }),
 })
 const data = await res.json()
 if (!res.ok) {
 setState({ loading: false, error: `${res.status} — ${data.error ?? 'Unknown error'}` })
 return false
 }
 setSlot(prev => ({ ...prev, ...data }))
 setState({ loading: false, error: data.audit_warning ? `Saved · audit log warning: ${data.audit_warning}` : data.day_cover ? `Saved · €${(data.day_cover.cents / 100).toFixed(2)} day cover added to the booking (${data.day_cover.days} day${data.day_cover.days === 1 ? '' : 's'})${onsiteMethod === 'later' ? ' — open, collect after the dive' : ''}` : null })
 if (kind === 'insurance' || kind === 'insurance_onsite' || kind === 'dan_policy') setActiveTab('status')
 onReload()
 loadHistory()
 return true
 } catch (e) {
 setState({ loading: false, error: e instanceof Error ? e.message : 'Network error' })
 return false
 }
 }

 // Jedes Zeichen bedeutet ueberall dasselbe: Legende, Chip auf der Bootskarte
 // und diese Akte. Wer das Symbol einmal gelernt hat, muss nicht nachlesen.
 const flags: { tone: 'warn' | 'bad' | 'ok' | 'soft'; label: string; detail?: string; linkBooking?: boolean; glyph: string; actionKey?: 'insurance' | 'insurance_onsite' | 'medical' | 'refresher' | 'dan_policy' | 'minor' }[] = []
 if (!slot?.checkin_completed_at) flags.push({ tone: 'bad', glyph: '', label: 'Check-in not completed', detail: 'No waiver, no medical declaration on file.' })
 if (seat.bookingStatus === 'pending') flags.push({ tone: 'warn', glyph: '€', label: 'Booking not paid yet', linkBooking: true })
 if (slot?.medical_flag && !slot.medical_flag_resolved) {
 flags.push({
 tone: 'warn',
 glyph: '!',
 label: 'Medical clearance required',
 detail: (slot.medical_flag_reason || 'Declared at check-in.')
 + (slot.medical_ack_at ? ' · Guest acknowledged they must bring it.' : ' · NOT acknowledged.'),
 actionKey: 'medical',
 })
 }
 if (slot?.insurance_source === 'none' && !slot.insurance_verified_at) flags.push({ tone: 'bad', glyph: '', label: 'No dive insurance', detail: 'Guest must buy DAN day cover before boarding — pick how they pay (or “Pay later” for after the dive); the cover is added to the booking either way.', actionKey: 'insurance_onsite' as const })
 else if (slot?.insurance_flag && !slot.insurance_verified_at && (cu?.insurance_policy_number ?? '').trim()) flags.push({ tone: 'soft', glyph: '', label: 'Policy on file — look at proof', detail: `Guest entered ${cu?.insurance_provider ? `${cu.insurance_provider} ` : ''}policy ${cu?.insurance_policy_number} at check-in. Look at the card, PDF or app and mark as seen.`, actionKey: 'insurance' })
 else if (slot?.insurance_flag && !slot.insurance_verified_at) flags.push({ tone: 'warn', glyph: '', label: 'Insurance proof to check', detail: 'Guest said they would show the policy at the centre — no number yet. Ask for the card, PDF or app and record provider + policy number.', actionKey: 'insurance' })
 if (slot?.insurance_flag && !slot.insurance_verified_at && slot.insurance_source !== 'azd_day') flags.push({ tone: 'warn', glyph: '€', label: 'No proof? Sell DAN day cover', detail: 'Pick how the guest pays (or “Pay later” for after the dive). The cover is added to the booking and the diver counts as insured by us — do not use the Add tab for this, it creates a separate booking and leaves this flag open.', actionKey: 'insurance_onsite' as const })
 if (slot?.insurance_source === 'azd_day' && !(slot.dan_policy_number ?? '').trim()) flags.push({ tone: 'warn', glyph: '', label: 'DAN policy number to enter', detail: slot.dan_submitted_at ? 'Day cover bought with us and sent to DAN. Enter the policy number DAN issued.' : 'Day cover bought with us, not exported to DAN yet. Once DAN has issued the policy, enter its number here.', actionKey: 'dan_policy' as const })
 if (refresher) flags.push({ tone: 'warn', glyph: '', label: 'Refresher required', detail: `Last dive ${months} months ago. Skills session in shallow water before the first dive.`, actionKey: 'refresher' as const })
 if (slot?.is_minor && !slot.minor_ack_at) {
 const mAge = ageOn(cu?.dob, seat.diveDate)
 flags.push({ tone: 'warn', glyph: '18', label: `Under 18${mAge !== null ? ` · ${mAge} years old` : ''}`, detail: `Depth limit: ${minorDepthLimit(mAge, cu?.experience_level).text}. Check the guardian's consent and brief the diver, then acknowledge.`, actionKey: 'minor' })
 }

 const tone = { warn: '#c9b48a', bad: '#c9928c', ok: '#b7c4b0', soft: '#c9c2b6' }
 const flagBtnState = { dan_policy: danState, insurance: insState, insurance_onsite: onsiteState, medical: medState, refresher: refresherState, minor: minorState }
 const flagBtnLabel = { dan_policy: 'Save DAN policy number', insurance: 'Record policy & mark as seen', insurance_onsite: 'Add day cover to booking', medical: 'Upload proof', refresher: 'Refresher completed ', minor: 'Acknowledge — consent & depth limit checked' }

 return (
 <div role="dialog" aria-modal="true" onClick={onClose}
 style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(9,9,9,.82)' }}>
 <div onClick={e => e.stopPropagation()} style={{
 maxWidth: '560px', width: '100%', maxHeight: '88vh', overflowY: 'auto',
 background: '#121210', border: '1px solid rgba(243,239,230,.22)', borderRadius: 0, padding: '24px',
 }}>
 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
 <div>
 <div style={{ fontSize: '20px', fontWeight: 900, color: s.text }}>{seat.name}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {seat.productName ?? 'Booking'} · seat {seat.slotIndex + 1}
 {seat.isTest ? ' · TEST' : ''}
 {seat.bookingId && (
 <>
 {' · '}
 <button type="button" onClick={() => setBookingPopup(true)} title="Open booking" style={{ fontFamily: 'monospace', color: '#f3efe6', fontWeight: 700, background: 'transparent', border: '1px solid rgba(243,239,230,.4)', borderRadius: 0, padding: '0 6px', cursor: 'pointer', fontSize: '14px' }}>{seat.bookingId.slice(0, 8).toUpperCase()}</button>
 </>
 )}
 </div>
 </div>
 <button onClick={onClose} style={{ background: 'none', border: 'none', color: s.muted, fontSize: '22px', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
 </div>

 {/* ── Tab bar ── */}
 <div style={{ display: 'flex', gap: '2px', margin: '14px 0 4px', background: 'rgba(0,0,0,.25)', borderRadius: 0, padding: '3px' }}>
 {([['status','Profile'],['akte','Details'],['history','History']] as const).map(([id,label]) => (
 <button key={id} onClick={() => setActiveTab(id)} style={{
 flex: 1, padding: '5px 0', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit',
 borderRadius: 0, border: 'none', cursor: 'pointer',
 background: activeTab === id ? 'rgba(243,239,230,.15)' : 'transparent',
 color: activeTab === id ? '#f3efe6' : '#c9c2b6',
 }}>{label}</button>
 ))}
 </div>

 {medModal && (
 <div role="dialog" aria-modal="true" onClick={() => { if (!medUp.loading) setMedModal(false) }}
 style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(9,9,9,.7)' }}>
 <div onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', width: '100%', background: '#121210', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '15px', fontWeight: 800, color: s.text, marginBottom: '6px' }}>Medical clearance — proof required</div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, marginBottom: '12px' }}>
 Upload the doctor’s clearance for {seat.name}: photo, PDF or document (max 15 MB). The file is stored privately and linked to this diver. Afterwards you confirm with “Mark as seen”.
 </div>
 <input type="file" accept="image/*,.heic,.heif,.pdf,.doc,.docx,.odt,.rtf,.txt" onChange={e => { setMedFile(e.target.files?.[0] ?? null); setMedUp({ loading: false, error: null }) }}
 style={{ width: '100%', boxSizing: 'border-box', fontSize: '14px', color: s.text, background: 'rgba(0,0,0,.3)', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, padding: '8px' }} />
 {medFile && <div style={{ fontSize: '14px', color: s.muted, marginTop: '6px' }}>{medFile.name} · {(medFile.size / 1024 / 1024).toFixed(2)} MB</div>}
 {medUp.error && <div style={{ marginTop: '8px', fontSize: '14px', color: '#c9928c', background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.2)', borderRadius: 0, padding: '5px 9px' }}>{medUp.error}</div>}
 {medState.error && <div style={{ marginTop: '8px', fontSize: '14px', color: '#c9928c' }}>{medState.error}</div>}
 <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
 <button type="button" disabled={medUp.loading} onClick={() => setMedModal(false)} style={{ fontSize: '14px', fontWeight: 700, padding: '6px 14px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: s.muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
 <button type="button" disabled={medUp.loading || !medFile} onClick={uploadMedicalProof}
 style={{ fontSize: '14px', fontWeight: 800, padding: '6px 14px', borderRadius: 0, background: 'rgba(183,196,176,.15)', border: '1px solid rgba(183,196,176,.4)', color: '#b7c4b0', cursor: medFile && !medUp.loading ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: medFile && !medUp.loading ? 1 : .4, filter: medFile ? 'none' : 'grayscale(1)' }}>
 {medUp.loading ? 'Uploading…' : 'Upload'}
 </button>
 </div>
 </div>
 </div>
 )}

 {activeTab === 'status' && flags.length > 0 && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '16px 0 4px' }}>
 {flags.map(f => {
 const st = f.actionKey ? flagBtnState[f.actionKey] : null
 return (
 <div key={f.label} style={{
 background: f.tone === 'bad' ? 'rgba(201,146,140,.09)' : f.tone === 'soft' ? 'rgba(201,194,182,.07)' : 'rgba(201,180,138,.09)',
 border: `1px solid ${f.tone === 'bad' ? 'rgba(201,146,140,.3)' : f.tone === 'soft' ? 'rgba(201,194,182,.3)' : 'rgba(201,180,138,.3)'}`,
 borderRadius: 0, padding: '10px 13px',
 }}>
 <div style={{ fontSize: '14px', fontWeight: 800, color: tone[f.tone], display: 'flex', alignItems: 'baseline', gap: '7px' }}>
 <span aria-hidden="true" style={{ fontSize: '14px', minWidth: '13px', textAlign: 'center' }}>{f.glyph}</span>
 <span>{f.label}</span>
 </div>
 {f.detail && <div style={{ fontSize: '14px', color: '#f3efe6', lineHeight: 1.6, marginTop: '3px', whiteSpace: 'pre-line' }}>{f.detail}</div>}
 {f.linkBooking && (
 <div style={{ fontSize: '14px', color: '#f3efe6', lineHeight: 1.6, marginTop: '3px' }}>
 Payment is still open (booking is pending). Check the Payments tab of the booking{' '}
 <button type="button" onClick={() => setBookingPopup(true)} title="Open booking" style={{ fontFamily: 'monospace', color: '#f3efe6', fontWeight: 700, background: 'transparent', border: '1px solid rgba(243,239,230,.4)', borderRadius: 0, padding: '0 6px', cursor: 'pointer' }}>{seat.bookingId.slice(0, 8).toUpperCase()}</button>
 {' '}before the dive.
 </div>
 )}
 {f.actionKey === 'insurance_onsite' && (
 <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
 <span style={{ fontSize: '14px', color: '#f3efe6' }}>Paid by:</span>
 {([['cash', ' Cash'], ['card', ' Card (n/a)'], ['revolut', ' Revolut'], ['later', ' Pay later']] as const).map(([m, l]) => (
 <button key={m} type="button" disabled={m === 'card'} title={m === 'card' ? 'Not available yet — no card terminal' : undefined} onClick={() => setOnsiteMethod(m)} style={{ opacity: m === 'card' ? 0.4 : 1, fontSize: '14px', fontWeight: 700, padding: '3px 9px', borderRadius: 0, border: `1px solid ${onsiteMethod === m ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.12)'}`, background: onsiteMethod === m ? 'rgba(243,239,230,.15)' : 'transparent', color: onsiteMethod === m ? '#f3efe6' : '#c9c2b6', cursor: 'pointer', fontFamily: 'inherit' , ...(m === 'card' ? { cursor: 'not-allowed' } : {})}}>{l}</button>
 ))}
 </div>
 )}
 {f.actionKey === 'dan_policy' && (
 <div style={{ marginTop: '8px' }}>
 <input value={danPolicy} onChange={e => setDanPolicy(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && danPolicy.trim()) resolveFlag('dan_policy', true) }} placeholder="DAN policy number" style={{ width: '100%', boxSizing: 'border-box', background: '#090909', border: '1px solid rgba(255,255,255,.14)', borderRadius: 0, padding: '5px 8px', fontSize: '14px', color: '#f3efe6', fontFamily: 'inherit', outline: 'none' }} />
 </div>
 )}
 {f.actionKey === 'insurance' && (
 <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
 <input value={proofProvider} onChange={e => setProofProvider(e.target.value)} placeholder="Provider (e.g. DAN)" style={{ flex: '1 1 120px', minWidth: 0, background: '#090909', border: '1px solid rgba(255,255,255,.14)', borderRadius: 0, padding: '5px 8px', fontSize: '14px', color: '#f3efe6', fontFamily: 'inherit', outline: 'none' }} />
 <input value={proofPolicy} onChange={e => setProofPolicy(e.target.value)} placeholder="Policy number" style={{ flex: '1 1 140px', minWidth: 0, background: '#090909', border: '1px solid rgba(255,255,255,.14)', borderRadius: 0, padding: '5px 8px', fontSize: '14px', color: '#f3efe6', fontFamily: 'inherit', outline: 'none' }} />
 </div>
 )}
 {f.actionKey === 'medical' && slot?.medical_proof_path && (
 <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
 <button type="button" disabled={proofView.loading} onClick={openMedicalProof} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#f3efe6', fontWeight: 600, fontFamily: 'inherit', fontSize: '14px', textDecoration: 'underline' }}>
 {proofView.loading ? '…' : ` ${slot.medical_proof_name ?? 'View proof'}`}
 </button>
 <button type="button" onClick={() => { setMedUp({ loading: false, error: null }); setMedFile(null); setMedModal(true) }} style={{ background: 'none', border: '1px solid rgba(255,255,255,.2)', borderRadius: 0, padding: '1px 8px', cursor: 'pointer', color: s.muted, fontFamily: 'inherit', fontSize: '14px' }}>Replace file</button>
 {proofView.error && <span style={{ color: '#c9928c' }}>{proofView.error}</span>}
 </div>
 )}
 {f.actionKey && st && (
 <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
 <button type="button" disabled={st.loading || (f.actionKey === 'insurance_onsite' && !onsiteMethod) || (f.actionKey === 'insurance' && !(proofProvider.trim() && proofPolicy.trim())) || (f.actionKey === 'dan_policy' && !danPolicy.trim())} onClick={() => f.actionKey === 'medical' && !slot?.medical_proof_path ? (setMedUp({ loading: false, error: null }), setMedFile(null), setMedModal(true)) : resolveFlag(f.actionKey!, true)}
 style={{ fontSize: '14px', fontWeight: 700, padding: '4px 12px', borderRadius: 0, background: 'rgba(183,196,176,.12)', border: '1px solid rgba(183,196,176,.35)', color: '#b7c4b0', cursor: st.loading ? 'wait' : ((f.actionKey === 'insurance_onsite' && !onsiteMethod) || (f.actionKey === 'insurance' && !(proofProvider.trim() && proofPolicy.trim())) || (f.actionKey === 'dan_policy' && !danPolicy.trim()) ? 'not-allowed' : 'pointer'), fontFamily: 'inherit', ...(((f.actionKey === 'insurance_onsite' && !onsiteMethod) || (f.actionKey === 'insurance' && !(proofProvider.trim() && proofPolicy.trim())) || (f.actionKey === 'dan_policy' && !danPolicy.trim())) ? { opacity: 0.4, filter: 'grayscale(1)' } : {}) }}>
 {st.loading ? '…' : f.actionKey === 'medical' && slot?.medical_proof_path ? 'Mark as seen' : flagBtnLabel[f.actionKey]}
 </button>
 {st.error && (
 <div style={{ width: '100%', fontSize: '14px', color: '#c9928c', background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.2)', borderRadius: 0, padding: '5px 9px' }}>
 {st.error}
 </div>
 )}
 </div>
 )}
 </div>
 )
 })}
 </div>
 )}

 {activeTab === 'status' && !slot?.checkin_completed_at && (
 <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(243,239,230,.05)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: s.accent, marginBottom: '10px' }}>Staff actions</div>
 {/* E-Mail-Eingabe: zeigen wenn keine E-Mail in der Akte */}
 {!slot?.customers?.email && !resendState.sent && (
 <div style={{ marginBottom: '8px' }}>
 <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c9c2b6', marginBottom: '4px' }}>
 Email for check-in link
 </div>
 <input
 type="email"
 value={resendEmail}
 onChange={e => setResendEmail(e.target.value)}
 placeholder="guest@example.com"
 style={{
 width: '100%', boxSizing: 'border-box',
 fontSize: '14px', padding: '6px 10px', borderRadius: 0,
 background: 'rgba(0,0,0,.3)', color: s.text,
 border: '1px solid rgba(243,239,230,.25)', fontFamily: 'inherit',
 }}
 />
 </div>
 )}
 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
 {(() => {
 const effectiveEmail = slot?.customers?.email || resendEmail.trim()
 const canSend = !!seat.checkinToken && !!effectiveEmail && !resendState.loading && !resendState.sent
 return (
 <button
 type="button"
 disabled={!canSend}
 onClick={resendCheckinLink}
 style={{
 fontSize: '14px', fontWeight: 700, padding: '6px 14px', borderRadius: 0,
 background: resendState.sent ? 'rgba(183,196,176,.12)' : 'rgba(243,239,230,.12)',
 border: `1px solid ${resendState.sent ? 'rgba(183,196,176,.35)' : 'rgba(243,239,230,.35)'}`,
 color: resendState.sent ? '#b7c4b0' : s.accent,
 cursor: canSend ? 'pointer' : 'default',
 fontFamily: 'inherit',
 opacity: canSend ? 1 : .45,
 }}
 >
 {resendState.loading ? '…' : resendState.sent ? ' Link sent' : ' Send check-in link'}
 </button>
 )
 })()}
 </div>
 {resendState.error && (
 <div style={{ marginTop: '7px', fontSize: '14px', color: '#c9928c', background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.2)', borderRadius: 0, padding: '5px 9px' }}>
 {resendState.error}
 </div>
 )}
 </div>
 )}

 {/* Status-Kurzakte: alles, was das Front Office am Steg braucht, ohne in die Profil-Tabs zu
 wechseln — Name, Zertifizierung, Tauchgänge, letzter Tauchgang, Versicherung mit Police,
 Check-in. Flags (falls vorhanden) stehen darüber. (Oct 2026: war mit 27f843f verloren gegangen.) */}
 {activeTab === 'status' && cu && (
 <>
 <FileSection title="Diver">
 <FileRow k="Name" v={seat.name} />
 <FileRow k="Certification" v={[cu.cert_agency, cu.experience_level].filter(Boolean).join(' · ') || null} />
 <FileRow k="Licence no." v={cu.cert_number} />
 <FileRow k="Logged dives" v={cu.logged_dives != null ? String(cu.logged_dives) : null} />
 <FileRow
 k="Last dive"
 v={cu.last_dive_date ? `${cu.last_dive_date}${months != null ? ` · ${months} months ago` : ''}${refresher ? ' · refresher' : ''}` : null}
 warn={refresher}
 />
 </FileSection>
 <FileSection title="Insurance">
 <FileRow
 k="Status"
 v={slot?.insurance_source ? INSURANCE_LABEL[slot.insurance_source as InsuranceSource] : null}
 warn={slot?.insurance_source === 'none' || (Boolean(slot?.insurance_flag) && !slot?.insurance_verified_at)}
 />
 {slot?.insurance_source === 'azd_day' && (
 <FileRow k="DAN policy no." v={slot.dan_policy_number ?? null} warn={!(slot.dan_policy_number ?? '').trim()} />
 )}
 {slot?.insurance_source === 'own' && (
 <>
 <FileRow k="Provider" v={cu.insurance_provider} />
 <FileRow k="Policy no." v={cu.insurance_policy_number} warn={!cu.insurance_policy_number} />
 </>
 )}
 </FileSection>
 <FileSection title="Check-in">
 <FileRow k="Completed" v={slot?.checkin_completed_at ? slot.checkin_completed_at.slice(0, 16).replace('T', ' ') : null} warn={!slot?.checkin_completed_at} />
 <FileRow k="Medical" v={slot?.medical_flag ? (slot.medical_flag_resolved ? 'flag resolved' : 'flag open') : 'clear'} warn={Boolean(slot?.medical_flag) && !slot?.medical_flag_resolved} />
 {slot?.medical_flag && slot.medical_flag_resolved && (
 <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
 <button type="button" disabled={medState.loading} onClick={() => resolveFlag('medical', false)}
 style={{ fontSize: '14px', fontWeight: 600, padding: '3px 8px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, cursor: medState.loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {medState.loading ? '…' : 'Undo'}
 </button>
 {medState.error && <span style={{ fontSize: '14px', color: '#c9928c' }}>{medState.error}</span>}
 </div>
 )}
 {slot?.is_minor && <FileRow k="Under 18" v={`${minorShort(cu?.dob, cu?.experience_level, seat.diveDate)} · ${slot.minor_ack_at ? `acknowledged ${slot.minor_ack_at.slice(0, 10)}${slot.minor_ack_by ? ` · ${slot.minor_ack_by}` : ''}` : 'not acknowledged'}`} warn={!slot.minor_ack_at} />}
 {slot?.is_minor && slot.minor_ack_at && (
 <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
 <button type="button" disabled={minorState.loading} onClick={() => resolveFlag('minor', false)}
 style={{ fontSize: '14px', fontWeight: 600, padding: '3px 8px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, cursor: minorState.loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {minorState.loading ? '…' : 'Undo'}
 </button>
 {minorState.error && <span style={{ fontSize: '14px', color: '#c9928c' }}>{minorState.error}</span>}
 </div>
 )}
 </FileSection>
 <FileSection title="Equipment">
 <FileRow k="Wetsuit" v={slot?.wetsuit_size} />
 <FileRow k="BCD" v={slot?.bcd_size} />
 <FileRow k="Boots" v={slot?.boot_size} />
 </FileSection>
 </>
 )}

 {activeTab === 'status' && !cu && (
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.7, marginTop: '16px' }}>
 Nobody has checked in on this seat yet, so there is nothing on file — no name, no
 certification, no emergency contact. Everything below fills itself in once the guest
 completes the check-in.
 </div>
 )}

 {activeTab === 'akte' && !cu && (
 <FileSection title="Booking contact">
 <FileRow k="Name" v={seat.name} />
 <FileRow k="Email" v={seat.bookingEmail ?? null} />
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, marginTop: '8px' }}>
 {seat.slotIndex === 0 ? 'From the booking. The full profile fills in once the guest completes the check-in.' : 'Guest seat — no email on file; send the check-in link to this guest\'s own address.'}
 </div>
 </FileSection>
 )}

 {activeTab === 'akte' && cu && (
 <>
 {/* ── Akte sub-tab bar ── */}
 <div style={{ display: 'flex', gap: '2px', margin: '14px 0 4px', background: 'rgba(0,0,0,.2)', borderRadius: 0, padding: '3px' }}>
 {([['contact','Contact'],['health','Clearances']] as const).map(([id,label]) => (
 <button key={id} onClick={() => setActiveAkteTab(id)} style={{
 flex: 1, padding: '5px 0', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit',
 borderRadius: 0, border: 'none', cursor: 'pointer',
 background: activeAkteTab === id ? 'rgba(243,239,230,.12)' : 'transparent',
 color: activeAkteTab === id ? '#f3efe6' : '#c9c2b6',
 }}>{label}</button>
 ))}
 </div>

 {/* ── Contact: personal info + emergency ── */}
 {activeAkteTab === 'contact' && (
 <>
 <FileSection title="Personal">
 <FileRow k="Email" v={cu.email} />
 <FileRow k="Phone" v={cu.phone} />
 <FileRow k="Date of birth" v={cu.dob} />
 <FileRow k="Nationality" v={cu.nationality} />
 </FileSection>
 <FileSection title="Emergency contact">
 <FileRow k="Name" v={cu.emergency_contact_name} />
 <FileRow k="Phone" v={cu.emergency_contact_phone} />
 </FileSection>
 </>
 )}

 {/* ── Health: insurance + medical ── */}
 {activeAkteTab === 'health' && (
 <>
 {/* Status/Provider/Police stehen im Status-Tab — hier nur Prüfvermerk + Undo */}
 <FileSection title="Insurance proof">
 <div style={{ padding: '4px 0' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '14px', lineHeight: 1.6, alignItems: 'flex-start' }}>
 <span style={{ color: s.muted }}>{slot?.insurance_source === 'azd_day' ? 'DAN policy no.' : 'Proof checked'}</span>
 <span style={{ textAlign: 'right' }}>
 {slot?.insurance_source === 'azd_day'
 ? ((slot.dan_policy_number ?? '').trim()
 ? <span style={{ color: '#f3efe6', fontWeight: 600 }}>{slot.dan_policy_number}</span>
 : <span style={{ color: '#c9b48a', fontWeight: 600 }}>not entered yet</span>)
 : slot?.insurance_verified_at
 ? <span style={{ color: '#f3efe6', fontWeight: 600 }}>
 {slot.insurance_verified_at.slice(0, 10)}{slot.insurance_verified_by ? ` · ${slot.insurance_verified_by}` : ''}
 </span>
 : <span style={{ color: slot?.insurance_flag ? '#c9b48a' : 'rgba(255,255,255,.25)', fontWeight: slot?.insurance_flag ? 600 : 400 }}>—</span>
 }
 </span>
 </div>
 {slot?.insurance_source === 'azd_day' && (slot.dan_policy_number ?? '').trim() && (
 <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
 <button type="button" disabled={danState.loading} onClick={async () => { await resolveFlag('dan_policy', false); setDanPolicy('') }}
 title="Clear the number (typo?) — the diver goes back to “DAN policy number to enter”"
 style={{ fontSize: '14px', fontWeight: 600, padding: '3px 8px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, cursor: danState.loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {danState.loading ? '…' : 'Undo'}
 </button>
 {danState.error && (
 <div style={{ width: '100%', fontSize: '14px', color: '#c9928c', background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.2)', borderRadius: 0, padding: '5px 9px' }}>
 {danState.error}
 </div>
 )}
 </div>
 )}
 {slot?.insurance_flag && slot.insurance_verified_at && (
 <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
 <button type="button" disabled={insState.loading} onClick={() => resolveFlag('insurance', false)}
 style={{ fontSize: '14px', fontWeight: 600, padding: '3px 8px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, cursor: insState.loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {insState.loading ? '…' : 'Undo'}
 </button>
 {insState.error && (
 <div style={{ width: '100%', fontSize: '14px', color: '#c9928c', background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.2)', borderRadius: 0, padding: '5px 9px' }}>
 {insState.error}
 </div>
 )}
 </div>
 )}
 </div>
 </FileSection>

 {(needsRefresher(cu?.last_dive_date, seat.diveDate ?? null) || slot?.refresher_completed_at) && (
 <FileSection title="Refresher">
 <FileRow k="Last dive" v={cu?.last_dive_date ?? null} />
 <FileRow k="Skills session done" v={slot?.refresher_completed_at ? `${slot.refresher_completed_at.slice(0, 10)}${(slot as { refresher_completed_by?: string | null }).refresher_completed_by ? ` · ${(slot as { refresher_completed_by?: string | null }).refresher_completed_by}` : ''}` : null} warn={!slot?.refresher_completed_at} />
 <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
 {slot?.refresher_completed_at ? (
 <button type="button" disabled={refresherState.loading} onClick={() => resolveFlag('refresher', false)}
 style={{ fontSize: '14px', fontWeight: 600, padding: '3px 8px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, cursor: refresherState.loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {refresherState.loading ? '…' : 'Undo'}
 </button>
 ) : (
 <button type="button" disabled={refresherState.loading} onClick={() => resolveFlag('refresher', true)}
 style={{ padding: '5px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(183,196,176,.15)', color: '#b7c4b0', border: '1px solid rgba(183,196,176,.4)', opacity: refresherState.loading ? .6 : 1 }}>
 {refresherState.loading ? 'Saving…' : 'Refresher completed '}
 </button>
 )}
 {refresherState.error && <span style={{ fontSize: '14px', color: '#c9928c' }}>{refresherState.error}</span>}
 </div>
 </FileSection>
 )}

 {slot?.is_minor && (
 <FileSection title="Under 18">
 <FileRow k="Diver" v={minorShort(cu?.dob, cu?.experience_level, seat.diveDate)} />
 <FileRow k="Consent & depth limit checked" v={slot.minor_ack_at ? `${slot.minor_ack_at.slice(0, 10)}${slot.minor_ack_by ? ` · ${slot.minor_ack_by}` : ''}` : null} warn={!slot.minor_ack_at} />
 <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
 {slot.minor_ack_at ? (
 <button type="button" disabled={minorState.loading} onClick={() => resolveFlag('minor', false)}
 style={{ fontSize: '14px', fontWeight: 600, padding: '3px 8px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, cursor: minorState.loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {minorState.loading ? '…' : 'Undo'}
 </button>
 ) : (
 <button type="button" disabled={minorState.loading} onClick={() => resolveFlag('minor', true)}
 style={{ padding: '5px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(183,196,176,.15)', color: '#b7c4b0', border: '1px solid rgba(183,196,176,.4)', opacity: minorState.loading ? .6 : 1 }}>
 {minorState.loading ? 'Saving…' : 'Acknowledge — consent & depth limit checked'}
 </button>
 )}
 {minorState.error && <span style={{ fontSize: '14px', color: '#c9928c' }}>{minorState.error}</span>}
 </div>
 </FileSection>
 )}

 {slot?.medical_flag ? (
 <FileSection title="Medical clearance">
 {slot.medical_flag_reason && (
 <div style={{ fontSize: '14px', color: '#c9b48a', lineHeight: 1.6, marginBottom: '8px' }}>{slot.medical_flag_reason}</div>
 )}
 <div style={{ padding: '4px 0' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '14px', lineHeight: 1.6, alignItems: 'flex-start' }}>
 <span style={{ color: s.muted }}>Clearance seen</span>
 <span style={{ textAlign: 'right' }}>
 {slot.medical_flag_resolved && slot.medical_resolved_at
 ? <span style={{ color: '#f3efe6', fontWeight: 600 }}>
 {slot.medical_resolved_at.slice(0, 10)}{slot.medical_resolved_by ? ` · ${slot.medical_resolved_by}` : ''}
 </span>
 : <span style={{ color: '#c9b48a', fontWeight: 600 }}>—</span>
 }
 </span>
 </div>
 {slot.medical_proof_path && (
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '14px', lineHeight: 1.6, alignItems: 'center', marginTop: '4px' }}>
 <span style={{ color: s.muted }}>Proof</span>
 <button type="button" disabled={proofView.loading} onClick={openMedicalProof} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#f3efe6', fontWeight: 600, fontFamily: 'inherit', fontSize: '14px', textDecoration: 'underline', textAlign: 'right' }}>
 {proofView.loading ? '…' : ` ${slot.medical_proof_name ?? 'View file'}`}
 </button>
 </div>
 )}
 {proofView.error && <div style={{ fontSize: '14px', color: '#c9928c', marginTop: '4px' }}>{proofView.error}</div>}
 {slot.medical_flag_resolved && (
 <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
 <button type="button" disabled={medState.loading} onClick={() => resolveFlag('medical', false)}
 style={{ fontSize: '14px', fontWeight: 600, padding: '3px 8px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, cursor: medState.loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
 {medState.loading ? '…' : 'Undo'}
 </button>
 {medState.error && (
 <div style={{ width: '100%', fontSize: '14px', color: '#c9928c', background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.2)', borderRadius: 0, padding: '5px 9px' }}>
 {medState.error}
 </div>
 )}
 </div>
 )}
 </div>
 </FileSection>
 ) : (
 <div style={{ marginTop: '14px', fontSize: '14px', color: 'rgba(255,255,255,.3)' }}>No medical flag declared at check-in.</div>
 )}
 </>
 )}

 {/* ── Dive: cert + experience + equipment ── */}
 </>
 )}

 {activeTab === 'history' && (
 <div style={{ marginTop: '14px' }}>
 {/* Check-in record */}
 {slot?.checkin_completed_at && cu && (
 <div style={{ marginBottom: '16px', padding: '10px 13px', background: 'rgba(183,196,176,.06)', border: '1px solid rgba(183,196,176,.2)', borderRadius: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#b7c4b0', marginBottom: '8px' }}>Check-in record</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
 {[
 ['Completed', slot.checkin_completed_at.slice(0, 16).replace('T', ' ')],
 ...(cu.waiver_signed_at ? [['Waiver signed', cu.waiver_signed_at.slice(0, 10)]] : []),
 ...(slot.special_notes ? [['Notes', slot.special_notes]] : []),
 ].map(([k, v]) => (
 <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '14px', padding: '3px 0', lineHeight: 1.6 }}>
 <span style={{ color: s.muted }}>{k}</span>
 <span style={{ color: '#f3efe6', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
 </div>
 ))}
 {cu.waiver_pdf_url && (
 <div style={{ paddingTop: '4px' }}>
 <a href={waiverHref(cu.waiver_pdf_url) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#f3efe6' }}>Open signature </a>
 </div>
 )}
 </div>
 </div>
 )}

 {/* Audit log */}
 {history.length > 0 ? (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
 {history.map(h => (
 <div key={h.id} style={{ display: 'flex', gap: '10px', fontSize: '14px', padding: '5px 0', alignItems: 'baseline', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
 <span style={{ color: s.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatHistoryTs(h.created_at)}</span>
 <span style={{ color: 'rgba(255,255,255,.55)', flexShrink: 0 }}>{(h.user_name ?? h.user_email ?? '').split('@')[0]}</span>
 <span style={{ color: h.source === 'booking' ? 'rgba(207,226,244,.75)' : '#f3efe6' }}>
 {h.source === 'booking' && <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '.1em', color: s.muted, marginRight: '6px' }}>BOOKING</span>}
 {DIVER_ACTION_LABELS[h.action_type] ?? h.action_type}
 </span>
 </div>
 ))}
 </div>
 ) : (
 <div style={{ fontSize: '14px', color: s.muted }}>{slot?.checkin_completed_at ? 'No staff actions logged yet.' : 'No history yet.'}</div>
 )}
 </div>
 )}
 </div>
 {bookingPopup && (
 <div onClick={e => { e.stopPropagation(); setBookingPopup(false) }} style={{ position: 'fixed', inset: 0, zIndex: 10010, background: 'rgba(2,8,20,.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, boxShadow: 'none', overflow: 'hidden' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Booking <span style={{ fontFamily: 'monospace', color: s.text, fontWeight: 700 }}>{seat.bookingId.slice(0, 8).toUpperCase()}</span> · changes here are live</span>
 <button type="button" onClick={() => setBookingPopup(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 0, padding: '4px 10px', cursor: 'pointer', fontSize: '14px' }}>Close</button>
 </div>
 <div style={{ padding: '14px' }}>
 <FrontOfficeBookings focusBookingId={seat.bookingId} embedded initialTab="payments" />
 </div>
 </div>
 </div>
 )}
 </div>

 )
}


function Legend({ color, label, glyph }: { color: string; label: string; glyph?: string }) {
 return (
 <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
 {glyph
 // Versicherung und Auffrischung sind Zeichen auf dem Chip, keine Sitzfarbe.
 // Die Legende muss sie trotzdem erklaeren, sonst raet der Empfang.
 ? <span style={{ color, fontSize: '14px', lineHeight: 1, display: 'inline-block' }}>{glyph}</span>
 : <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block' }} />}
 {label}
 </span>
 )
}

/** Alle offenen Flags eines Platzes (Karte „Alerts“ neben den Booten). Gleiche Regeln wie die Flags im Taucherprofil. */
function seatAlerts(seat: Seat): { label: string; tone: 'warn' | 'bad' | 'med' | 'soft'; glyph: string; color: string }[] {
 const out: { label: string; tone: 'warn' | 'bad' | 'med' | 'soft'; glyph: string; color: string }[] = []
 if (seat.placeholder) return out
 // Zeichen und Farben wie in der Legende und auf dem Bootsplan
 if (!seat.checkedIn) out.push({ label: 'Check-in not completed', tone: 'bad', glyph: '', color: '#c9928c' })
 if (seat.medicalFlag) out.push({ label: 'Medical clearance required', tone: 'med', glyph: '!', color: '#d4a07a' })
 if (seat.insuranceSource === 'none') out.push({ label: 'No insurance — sell day cover', tone: 'bad', glyph: '', color: '#c9928c' })
 else if (seat.insuranceFlag && seat.insurancePolicyOnFile) out.push({ label: 'Policy on file — look at proof', tone: 'soft', glyph: '', color: '#c9c2b6' })
 else if (seat.insuranceFlag) out.push({ label: 'Insurance proof to check', tone: 'warn', glyph: '', color: '#c9b48a' })
 if (seat.danPolicyOpen) out.push({ label: 'DAN policy no. missing', tone: 'warn', glyph: '#', color: '#c9b48a' })
 if (seat.refresherOpen) out.push({ label: 'Refresher required', tone: 'warn', glyph: '', color: '#c9b48a' })
 if (seat.minorOpen) out.push({ label: `Under 18 · ${seat.minorInfo ?? ''}`.trim(), tone: 'warn', glyph: '18', color: '#c9b48a' })
 return out
}

/** Offene Versicherungsfaelle der Session (wie die Warteliste rechts neben den Booten).
 * DAN hat keine API unsere Policennummer tragen wir pro Taucher von Hand ein (Zeile + Save). */
function InsuranceCasesCard({ label, seats, onOpen, onSaved }: {
 label: string
 seats: { seat: Seat; boat: string }[]
 onOpen: (seat: Seat) => void
 onSaved: () => void
}) {
 const [vals, setVals] = useState<Record<string, string>>({})
 const [busyId, setBusyId] = useState<string | null>(null)
 const [errs, setErrs] = useState<Record<string, string>>({})
 const [mails, setMails] = useState<Record<string, string>>({})
 const [sendSt, setSendSt] = useState<Record<string, { loading?: boolean; sent?: boolean; error?: string }>>({})
 if (seats.length === 0) return null
 async function sendLink(w: Seat) {
 const k = `${w.bookingId}-${w.slotIndex}`
 const email = (mails[k] ?? w.slot?.customers?.email ?? w.bookingEmail ?? '').trim()
 if (!email) { setSendSt(x => ({ ...x, [k]: { error: 'Enter an email address first' } })); return }
 if (!w.checkinToken) { setSendSt(x => ({ ...x, [k]: { error: 'No check-in token on this booking' } })); return }
 setSendSt(x => ({ ...x, [k]: { loading: true } }))
 try {
 const res = await fetch('/api/checkin/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: w.checkinToken, invites: [{ slot_index: w.slotIndex, email }] }) })
 const d = await res.json().catch(() => ({}))
 setSendSt(x => ({ ...x, [k]: res.ok ? { sent: true } : { error: `${res.status} — ${d.error ?? 'Unknown error'}` } }))
 } catch (e) { setSendSt(x => ({ ...x, [k]: { error: e instanceof Error ? e.message : 'Network error' } })) }
 }
 async function ackMinor(id: string) {
 setBusyId(id); setErrs(e => ({ ...e, [id]: '' }))
 try {
 const res = await fetch('/api/dashboard/resolve-flag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_customer_id: id, kind: 'minor', resolved: true }) })
 const d = await res.json().catch(() => ({}))
 if (!res.ok) { setErrs(e => ({ ...e, [id]: `${res.status} — ${d.error ?? 'Unknown error'}` })); return }
 onSaved()
 } catch (e) { setErrs(x => ({ ...x, [id]: e instanceof Error ? e.message : String(e) })) }
 finally { setBusyId(null) }
 }
 async function save(id: string) {
 const v = (vals[id] ?? '').trim()
 if (!v) { setErrs(e => ({ ...e, [id]: 'Enter the DAN policy number first' })); return }
 setBusyId(id); setErrs(e => ({ ...e, [id]: '' }))
 try {
 const res = await fetch('/api/dashboard/resolve-flag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_customer_id: id, kind: 'dan_policy', resolved: true, dan_policy_number: v }) })
 const d = await res.json().catch(() => ({}))
 if (!res.ok) { setErrs(e => ({ ...e, [id]: `${res.status} — ${d.error ?? 'Unknown error'}` })); return }
 onSaved()
 } catch (e) { setErrs(x => ({ ...x, [id]: e instanceof Error ? e.message : String(e) })) }
 finally { setBusyId(null) }
 }
 return (
 <div style={{ border: '1px solid rgba(201,180,138,.35)', background: 'rgba(201,180,138,.09)', borderRadius: 0, padding: '16px 18px', alignSelf: 'start', gridColumn: '1 / -1' }}>
 <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
 <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: '#c9b48a' }}>Alerts · {label}</div>
 <div style={{ fontSize: '14px', fontWeight: 700, color: '#c9b48a' }}>{seats.length} open</div>
 </div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5, marginBottom: '12px' }}>Every open flag of this session's divers. Click a name for the full profile. Our DAN covers need the policy number DAN issued.</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {seats.map(({ seat: w, boat }) => {
 const id = w.slot?.id as string | undefined
 const alerts = seatAlerts(w)
 return (
 <div key={`${w.bookingId}-${w.slotIndex}`} style={{ padding: '8px 10px', borderRadius: 0, background: 'rgba(18,18,16,.78)', border: '1px solid rgba(201,180,138,.3)' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
 <button type="button" onClick={() => onOpen(w)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: s.font, fontSize: '14px', fontWeight: 700, color: s.text, textAlign: 'left' }}>{w.name}</button>
 {alerts.map(a => <span key={a.label} style={{ fontSize: '14px', fontWeight: 700, padding: '2px 9px', borderRadius: 0, background: a.tone === 'bad' ? 'rgba(201,146,140,.2)' : a.tone === 'med' ? 'rgba(212,160,122,.2)' : 'rgba(201,180,138,.18)', color: a.tone === 'bad' ? '#c9928c' : a.tone === 'med' ? '#d4a07a' : '#c9b48a', border: `1px solid ${a.tone === 'bad' ? 'rgba(201,146,140,.4)' : a.tone === 'med' ? 'rgba(212,160,122,.4)' : 'rgba(201,180,138,.4)'}` }}><span aria-hidden="true" style={{ marginRight: '5px', color: a.color, fontWeight: 900 }}>{a.glyph}</span>{a.label}</span>)}
 <span style={{ fontSize: '14px', color: s.muted, marginLeft: 'auto' }}>{boat} · <span style={{ fontFamily: 'monospace' }}>{w.bookingId.slice(0, 8).toUpperCase()}{w.isTest ? ' · TEST' : ''}</span></span>
 </div>
 {w.minorOpen && id && (
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
 <span style={{ fontSize: '14px', color: s.muted, flex: 1, minWidth: '180px' }}>{minorDepthLimit(ageOn(w.slot?.customers?.dob, w.diveDate), w.slot?.customers?.experience_level).text}</span>
 <button type="button" disabled={busyId === id} onClick={() => ackMinor(id)}
 style={{ padding: '5px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(183,196,176,.15)', color: '#b7c4b0', border: '1px solid rgba(183,196,176,.4)', opacity: busyId === id ? .6 : 1 }}>
 {busyId === id ? 'Saving…' : 'Acknowledge'}
 </button>
 </div>
 )}
 {w.danPolicyOpen && id && (
 <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
 <input value={vals[id] ?? ''} onChange={e => setVals(v => ({ ...v, [id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') save(id) }} placeholder="DAN policy no."
 style={{ flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: 0, fontSize: '14px', fontFamily: 'inherit', background: 'rgba(0,0,0,.25)', color: '#fff', border: '1px solid rgba(255,255,255,.2)' }} />
 <button type="button" disabled={busyId === id} onClick={() => save(id)}
 style={{ padding: '5px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(183,196,176,.15)', color: '#b7c4b0', border: '1px solid rgba(183,196,176,.4)', opacity: busyId === id ? .6 : 1 }}>
 {busyId === id ? 'Saving…' : 'Save'}
 </button>
 </div>
 )}
 {!w.checkedIn && w.checkinToken && (() => {
 const k = `${w.bookingId}-${w.slotIndex}`
 const st = sendSt[k] ?? {}
 return (
 <div style={{ marginTop: '6px' }}>
 <div style={{ display: 'flex', gap: '6px' }}>
 <input type="email" value={mails[k] ?? w.slot?.customers?.email ?? w.bookingEmail ?? ''} onChange={e => { setMails(v => ({ ...v, [k]: e.target.value })); setSendSt(x => ({ ...x, [k]: {} })) }} onKeyDown={e => { if (e.key === 'Enter') sendLink(w) }} placeholder="guest@example.com"
 style={{ flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: 0, fontSize: '14px', fontFamily: 'inherit', background: 'rgba(0,0,0,.25)', color: '#fff', border: '1px solid rgba(255,255,255,.2)' }} />
 <button type="button" disabled={st.loading} onClick={() => sendLink(w)}
 style={{ padding: '5px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', background: st.sent ? 'rgba(183,196,176,.15)' : 'rgba(243,239,230,.12)', color: st.sent ? '#b7c4b0' : '#f3efe6', border: `1px solid ${st.sent ? 'rgba(183,196,176,.4)' : 'rgba(243,239,230,.35)'}`, opacity: st.loading ? .6 : 1 }}>
 {st.loading ? '…' : st.sent ? ' Link sent' : ' Send check-in link'}
 </button>
 </div>
 {st.error && <div style={{ marginTop: '4px', fontSize: '14px', color: '#c9928c' }}>{st.error}</div>}
 </div>
 )
 })()}
 {id && errs[id] && <div style={{ marginTop: '4px', fontSize: '14px', color: '#c9928c' }}>{errs[id]}</div>}
 </div>
 )
 })}
 </div>
 </div>
 )
}

function BoatCard({ boat, session, status, crew, seats, available, busy, onStatus, onToggleCrew, onOpenSeat }: {
 boat: Boat; session: Sess; status?: BoatStatus; crew: CrewRow[]; seats: Seat[]
 available: { name: string; role: string }[]
 busy: boolean
 onStatus: (patch: Record<string, unknown>) => void
 onToggleCrew: (name: string, role: string) => void
 onOpenSeat: (seat: Seat) => void
}) {
 const meta = STATUS_META[status?.status ?? 'scheduled'] ?? STATUS_META.scheduled
 const skipper = crew.find(c => c.crew_role === 'skipper')
 const guides = crew.filter(c => c.crew_role !== 'skipper')
 const positions = seatPositions(boat.seats)
 const checkedIn = seats.filter(x => x.checkedIn).length
 const flags = seats.filter(x => x.medicalFlag).length
 const hasTestSeat = seats.some(x => x.isTest)

 const seatColor = (seat: Seat | undefined) => {
 if (!seat) return null
 if (seat.bookingStatus === 'no_show') return '#8a8f99'
 if (seat.bookingStatus === 'pending') return '#c9b48a'
 if (seat.medicalFlag) return '#d4a07a'
 if (seat.insuranceSource === 'none') return '#c9928c'
 if ((seat.insuranceFlag && !seat.insurancePolicyOnFile) || seat.insuranceSource === 'none' || seat.danPolicyOpen || seat.refresherOpen || seat.minorOpen) return '#c9b48a'
 if (seat.insuranceFlag) return '#c9c2b6' // Police genannt, nur Sichtpruefung offen — nicht gruen, aber kein Alarm
 if (seat.checkedIn) return '#b7c4b0'
 return '#c9928c'
 }

 // Gleiche Zeichen und Farben wie in der Legende; ein Platz kann mehrere Flags haben
 const seatGlyphs = (seat: Seat): { g: string; c: string }[] => {
 const out: { g: string; c: string }[] = []
 if (seat.medicalFlag) out.push({ g: '!', c: '#d4a07a' })
 if (seat.insuranceSource === 'none') out.push({ g: 'N', c: '#c9928c' })
 else if (seat.insuranceFlag) out.push({ g: 'P', c: seat.insurancePolicyOnFile ? '#c9c2b6' : '#c9b48a' })
 if (seat.danPolicyOpen) out.push({ g: '#', c: '#c9b48a' })
 if (seat.refresherOpen) out.push({ g: 'R', c: '#c9b48a' })
 if (seat.minorOpen) out.push({ g: '18', c: '#c9b48a' })
 return out
 }

 return (
 <div style={{
 background: 'rgba(18,18,16,.94)',
 border: hasTestSeat ? '1px solid rgba(201,180,138,.45)' : '1px solid rgba(243,239,230,.15)',
 borderRadius: 0, overflow: 'hidden',
 }}>
 <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
 <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: meta.color, background: meta.bg, padding: '4px 10px', borderRadius: 0, whiteSpace: 'nowrap' }}>{meta.label}</span>
 <div>
 <div style={{ fontSize: '15px', fontWeight: 800, color: s.text }}>
 {boat.name} <span style={{ fontSize: '14px', fontWeight: 700, color: s.muted }}>· {session === 'night' ? ' NIGHT' : session.toUpperCase()}</span>
 </div>
 <div style={{ fontSize: '14px', color: s.muted }}>
 {status?.departure_time ? `Departs ${status.departure_time.slice(0, 5)}` : 'No departure set'}
 {status?.eta ? ` · ETA ${status.eta.slice(0, 5)}` : ''}
 {status?.dive_site ? ` · ${status.dive_site}` : ''}
 </div>
 </div>
 <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
 <div style={{ fontSize: '14px', color: seats.length > boat.seats ? '#c9928c' : s.muted, fontWeight: seats.length > boat.seats ? 800 : 400 }}>
 {seats.length} of {boat.seats} seats{seats.length > boat.seats ? ' — OVERBOOKED' : ''}
 </div>
 <div style={{ fontSize: '14px', color: checkedIn === seats.length && seats.length > 0 ? '#b7c4b0' : '#d4a07a', fontWeight: 700 }}>
 {checkedIn}/{seats.length} checked in{flags > 0 ? ` · ${flags} medical` : ''}
 </div>
 </div>
 </div>

 <div style={{ padding: '16px 16px 8px' }}>
 <svg viewBox="0 0 560 218" width="100%" style={{ display: 'block', overflow: 'visible' }} xmlns="http://www.w3.org/2000/svg">
 <defs>
 <linearGradient id={`hull-${boat.id}-${session}`} x1="0" y1="0" x2="1" y2="1">
 <stop offset="0%" stopColor="#2a2a28" />
 <stop offset="100%" stopColor="#181816" />
 </linearGradient>
 </defs>
 <rect x="0" y="0" width="560" height="218" rx="12" fill="#121210" opacity="0.4" />
 <g style={{ animation: `boat_bob_${status?.status === 'out' ? 'fast' : 'slow'} ${status?.status === 'out' ? '3.8s' : '6s'} ease-in-out infinite`, transformOrigin: '280px 100px' }}>
 <style>{`
 @keyframes boat_bob_fast { 0%,100%{transform:translateY(0) rotate(0)} 30%{transform:translateY(-5px) rotate(.6deg)} 70%{transform:translateY(3px) rotate(-.4deg)} }
 @keyframes boat_bob_slow { 0%,100%{transform:translateY(0) rotate(0)} 30%{transform:translateY(-2px) rotate(.2deg)} 70%{transform:translateY(1px) rotate(-.1deg)} }
 `}</style>
 <path d="M 50 100 Q 50 30 105 18 L 455 18 Q 510 18 510 60 Q 522 100 510 140 Q 510 182 455 182 L 105 182 Q 50 170 50 100 Z" fill={`url(#hull-${boat.id}-${session})`} stroke="#f3efe6" strokeWidth="2" />
 <path d="M 80 100 Q 80 47 115 42 L 445 42 Q 490 42 490 80 Q 495 100 490 120 Q 490 158 445 158 L 115 158 Q 80 153 80 100 Z" fill="#181816" opacity="0.8" />
 <rect x="450" y="76" width="42" height="48" rx="6" fill="#181816" opacity="0.9" />
 <circle cx="471" cy="114" r="8" fill="none" stroke="#f3efe6" strokeWidth="1.8" opacity="0.8" />

 {/* Sitzplätze */}
 {positions.map((p, i) => {
 const seat = seats[i]
 const c = seatColor(seat)
 if (!c) {
 return <circle key={i} cx={p.x} cy={p.y} r="8" fill="none" stroke="#c9c2b6" strokeWidth="1.2" strokeDasharray="3,2" opacity="0.4" />
 }
 const labelBelow = p.y > 100
 return (
 <g
 key={i}
 onClick={() => onOpenSeat(seat)}
 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSeat(seat) } }}
 tabIndex={0}
 role="button"
 aria-label={seat.name}
 style={{ cursor: 'pointer' }}
 >
 {/* Invisible hit area covering circle + name label */}
 <rect x={p.x - 40} y={p.y - 25} width={80} height={65} fill="transparent" />
 <title>{`${seat.name} — ${seat.bookingStatus === 'pending' ? 'UNPAID — ' : seat.bookingStatus === 'no_show' ? 'NO-SHOW — ' : seat.bookingStatus === 'completed' ? 'completed — ' : ''}${seat.medicalFlag ? 'medical flag' : seat.checkedIn ? 'checked in' : 'check-in pending'}${seat.insuranceSource === 'none' ? ' · no insurance' : seat.insuranceFlag ? ' · insurance proof to check' : seat.insuranceSource === 'azd_day' ? ' · DAN day cover' : seat.insuranceSource === 'ssi' ? ' · SSI course insurance' : ''}${seat.isTest ? ' (TEST)' : ''}`}</title>
 <circle cx={p.x} cy={p.y} r="12" fill={c} opacity="0.85" />
 <ellipse cx={p.x} cy={p.y + (labelBelow ? 12 : 12)} rx="4.5" ry="4.5" fill={c} opacity="0.5" />
 <text x={p.x} y={labelBelow ? p.y + 30 : p.y - 13} textAnchor="middle" fontSize="13" fill={c} fontWeight="600" fontFamily="-apple-system,sans-serif">{shortName(seat.name)}{seatGlyphs(seat).map((f, fi) => <tspan key={fi} dx="3" fill={f.c} fontWeight="900">{f.g}</tspan>)}</text>
 {seatGlyphs(seat)[0] && <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fill="#090909" fontWeight="700" fontFamily="sans-serif">{seatGlyphs(seat)[0].g}</text>}
 </g>
 )
 })}

 {/* Skipper */}
 <circle cx="448" cy="100" r="13" fill={skipper ? '#f3efe6' : 'none'} stroke={skipper ? 'none' : '#c9c2b6'} strokeWidth="1.2" strokeDasharray={skipper ? undefined : '3,2'} opacity={skipper ? 0.95 : 0.4} />
 {skipper && <text x="448" y="103" textAnchor="middle" fontSize="13" fill="white" fontWeight="900" fontFamily="sans-serif"></text>}
 <text x="448" y="75" textAnchor="middle" fontSize="13" fill="#f3efe6" opacity="0.65" fontFamily="-apple-system,sans-serif" letterSpacing="0.1em">SKIPPER</text>
 <text x="448" y="83" textAnchor="middle" fontSize="13" fill="#f3efe6" fontWeight="700" fontFamily="-apple-system,sans-serif">{skipper ? shortName(skipper.crew_name) : '—'}</text>
 </g>
 </svg>
 </div>

 {/* ── Steuerleiste: Status + Zeiten ── */}
 <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
 <select
 value={status?.status ?? 'scheduled'} disabled={busy}
 onChange={e => onStatus({ status: e.target.value })}
 style={{ fontSize: '14px', fontWeight: 700, padding: '5px 9px', borderRadius: 0, background: 'rgba(0,0,0,.3)', color: s.text, border: '1px solid rgba(243,239,230,.2)', fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer' }}>
 {['scheduled', 'boarding', 'out', 'returned', 'cancelled'].map(v => <option key={v} value={v}>{v}</option>)}
 </select>
 <TimeField label="Dep" value={status?.departure_time ?? ''} disabled={busy} onCommit={v => onStatus({ departure_time: v || null })} />
 <TimeField label="ETA" value={status?.eta ?? ''} disabled={busy} onCommit={v => onStatus({ eta: v || null })} />
 <input
 defaultValue={status?.dive_site ?? ''} placeholder="dive site" disabled={busy}
 onBlur={e => { if (e.target.value !== (status?.dive_site ?? '')) onStatus({ dive_site: e.target.value || null }) }}
 style={{ fontSize: '14px', padding: '5px 9px', borderRadius: 0, background: 'rgba(0,0,0,.3)', color: s.text, border: '1px solid rgba(243,239,230,.2)', fontFamily: 'inherit', width: '130px' }} />
 </div>

 {/* ── Crew aus dem Schedule dieses Tages ── */}
 <div style={{ padding: '0 20px 10px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
 <ChipLabel>From schedule</ChipLabel>
 {available.length === 0
 ? <span style={{ fontSize: '14px', color: s.muted, opacity: .45, fontStyle: 'italic' }}>no rota for this session</span>
 : available.map(a => {
 const on = crew.some(c => c.crew_name === a.name)
 return (
 <button key={a.name} type="button" disabled={busy} onClick={() => onToggleCrew(a.name, a.role)}
 title={`${a.role} — click to ${on ? 'remove from' : 'assign to'} ${boat.name} ${session.toUpperCase()}`}
 style={{
 fontSize: '14px', fontWeight: on ? 700 : 500, padding: '3px 10px', borderRadius: 0,
 cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
 color: on ? '#090909' : s.muted,
 background: on ? '#b7c4b0' : 'rgba(255,255,255,.05)',
 border: `1px solid ${on ? '#b7c4b0' : 'rgba(255,255,255,.12)'}`,
 }}>
 {on ? ' ' : '+ '}{a.name}
 </button>
 )
 })}
 </div>

 <div style={{ padding: '8px 20px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
 <ChipLabel>Skipper</ChipLabel>
 {skipper
 ? <span style={{ fontSize: '14px', fontWeight: 700, color: '#f3efe6', padding: '3px 11px', borderRadius: 0, background: 'rgba(243,239,230,.13)', border: '1px solid rgba(243,239,230,.4)' }}> {skipper.crew_name}</span>
 : <span style={{ fontSize: '14px', color: s.muted, opacity: .5, fontStyle: 'italic' }}>none assigned</span>}
 <ChipLabel>Crew</ChipLabel>
 {guides.length > 0
 ? guides.map(g => (
 <span key={g.crew_name} style={{ fontSize: '14px', fontWeight: 600, color: '#b7c4b0', padding: '3px 11px', borderRadius: 0, background: 'rgba(183,196,176,.1)', border: '1px solid rgba(183,196,176,.3)' }}> {g.crew_name}</span>
 ))
 : <span style={{ fontSize: '14px', color: s.muted, opacity: .5, fontStyle: 'italic' }}>none assigned</span>}
 <ChipLabel>Divers</ChipLabel>
 {seats.length > 0
 ? seats.map(seat => (
 <button key={`${seat.bookingId}-${seat.slotIndex}`}
 type="button"
 onClick={() => onOpenSeat(seat)}
 title={seat.productName ?? undefined}
 style={{
 cursor: 'pointer', fontFamily: 'inherit',
 fontSize: '14px',
 color: seat.medicalFlag ? '#d4a07a' : ((seat.insuranceFlag && !seat.insurancePolicyOnFile) || seat.insuranceSource === 'none' || seat.danPolicyOpen || seat.refresherOpen || seat.minorOpen) ? '#c9b48a' : seat.insuranceFlag ? '#c9c2b6' : seat.checkedIn ? '#b7c4b0' : '#c9928c',
 padding: '3px 10px', borderRadius: 0,
 background: 'rgba(243,239,230,.06)',
 border: `1px solid ${seat.medicalFlag ? 'rgba(212,160,122,.35)' : ((seat.insuranceFlag && !seat.insurancePolicyOnFile) || seat.insuranceSource === 'none' || seat.danPolicyOpen || seat.refresherOpen || seat.minorOpen) ? 'rgba(201,180,138,.4)' : seat.insuranceFlag ? 'rgba(201,194,182,.35)' : seat.checkedIn ? 'rgba(183,196,176,.3)' : 'rgba(201,146,140,.3)'}`,
 }}>
 {seat.checkedIn ? 'In' : 'Due'} {shortName(seat.name)}
 {seat.bookingStatus === 'pending' && <span title="Booking not paid yet (pending)" style={{ marginLeft: '5px', fontSize: '14px', fontWeight: 800, color: '#090909', background: '#c9b48a', borderRadius: 0, padding: '0 4px' }}>UNPAID</span>}
 {seat.bookingStatus === 'no_show' && <span title="Marked as no-show" style={{ marginLeft: '5px', fontSize: '14px', fontWeight: 800, color: '#fff', background: '#8a8f99', borderRadius: 0, padding: '0 4px' }}>NO-SHOW</span>}
 {seat.placeholder && <span title="Seat reserved, guest details not entered yet" style={{ marginLeft: '5px', fontSize: '14px', color: '#c9c2b6' }}>(reserved)</span>}
 {/* Versicherung: = Nachweis noch zu sichten, = gar keine.
 Beides muss der Empfang sehen, bevor der Gast an Bord geht. */}
 {seat.insuranceSource === 'none' ? <span title="No insurance declared" style={{ marginLeft: '4px', color: '#c9928c' }}>No cover</span>
 : seat.insuranceFlag ? <span title={seat.insurancePolicyOnFile ? 'Own policy on file — look at proof' : 'Insurance proof to check — no policy number yet'} style={{ marginLeft: '4px', color: seat.insurancePolicyOnFile ? '#c9c2b6' : '#c9b48a' }}>Proof</span>
 : seat.insuranceSource === 'azd_day' ? <span title={seat.danPolicyOpen ? 'DAN day cover bought with us — DAN policy number still to be entered' : 'DAN day cover bought with us — policy number recorded'} style={{ marginLeft: '4px', color: seat.danPolicyOpen ? '#c9b48a' : '#b7c4b0' }}>D</span>
 : seat.insuranceSource === 'ssi' ? <span title="SSI insurance included in the course — not DAN" style={{ marginLeft: '4px', color: '#b7c4b0' }}>S</span>
 : null}
 {seat.slot?.customers?.last_dive_date && needsRefresher(seat.slot.customers.last_dive_date)
 ? <span title="Over a year since last dive — refresher required" style={{ marginLeft: '4px', color: '#c9b48a' }}>Refresher</span>
 : null}
 {seat.slot?.is_minor
 ? <span title={seat.minorOpen ? `Under 18 (${seat.minorInfo ?? ''}) — acknowledge in the profile` : `Under 18 (${seat.minorInfo ?? ''}) — acknowledged`} style={{ marginLeft: '4px', color: seat.minorOpen ? '#c9b48a' : '#b7c4b0', fontSize: '14px', fontWeight: 800 }}>18</span>
 : null}
 {seat.isTest ? ' ·TEST' : ''}
 </button>
 ))
 : <span style={{ fontSize: '14px', color: s.muted, opacity: .4, fontStyle: 'italic' }}>No bookings for this session</span>}
 </div>
 </div>
 )
}

function TimeField({ label, value, disabled, onCommit }: {
 label: string; value: string; disabled: boolean; onCommit: (v: string) => void
}) {
 return (
 <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
 <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#c9c2b6', opacity: .6 }}>{label}</span>
 <input
 type="time" defaultValue={value ? value.slice(0, 5) : ''} disabled={disabled}
 onBlur={e => { if (e.target.value !== value.slice(0, 5)) onCommit(e.target.value) }}
 style={{ fontSize: '14px', padding: '4px 7px', borderRadius: 0, background: 'rgba(0,0,0,.3)', color: s.text, border: '1px solid rgba(243,239,230,.2)', fontFamily: 'inherit', colorScheme: 'dark' }} />
 </label>
 )
}

function ChipLabel({ children }: { children: React.ReactNode }) {
 return (
 <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: '#c9c2b6', opacity: 0.6, alignSelf: 'center', whiteSpace: 'nowrap', padding: '0 4px' }}>{children}</span>
 )
}

