/**
 * Bausteine für den Chatbot-Prompt (31.10.2026): heutiges Datum (Azoren) und aktive Buchungsfenster.
 * Rein und ohne Datenbankzugriff, damit testbar (__tests__/chatPrompt.test.ts).
 * Hintergrund: Der Prompt kannte kein heutiges Datum — der Bot nahm 2024 an, hielt echte Tauchdaten für "Zukunft"
 * und meldete einen "technical glitch". Außerdem kannte er die Buchungsfenster (Low Season = Request) nicht.
 */
import { resolveWindowMode, type WindowRule } from './bookingWindows'

export function azoresToday(now: Date = new Date()): { iso: string; long: string; year: number } {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Azores', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const long = new Intl.DateTimeFormat('en-GB', { timeZone: 'Atlantic/Azores', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  return { iso, long, year: Number(iso.slice(0, 4)) }
}

const fmtDay = (d: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
const clean = (s: string | null | undefined, max: number) => (s ?? '').replace(/[\r\n\t<>]/g, ' ').trim().slice(0, max)

/** Aktive, noch nicht abgelaufene Fenster als Klartext; letzte Zeile = Standard für alle übrigen Tage. */
export function describeBookingWindows(rules: WindowRule[], defaultMode: 'open' | 'request', todayIso: string): string {
  const label = { open: 'INSTANT booking', request: 'ON REQUEST', blocked: 'NOT bookable online' } as const
  const lines = rules
    .filter(r => r.to_date >= todayIso)
    .sort((a, b) => a.from_date.localeCompare(b.from_date))
    .map(r => {
      const scope = [r.product_id ? `product "${clean(r.product_id, 60)}" only` : '', r.session ? `${r.session.toUpperCase()} session only` : ''].filter(Boolean).join(', ')
      const note = clean(r.guest_text, 200)
      return `- ${fmtDay(r.from_date)} to ${fmtDay(r.to_date)}: ${label[r.mode]}${scope ? ` (${scope})` : ''}${note ? ` — note for guests: ${note}` : ''}`
    })
  lines.push(`- All dates not covered above: ${label[defaultMode]}.`)
  lines.push('Compare the wished date with each range above by year, month AND day. A date after a range ends (or before it starts) is NOT inside that range: e.g. a date in May 2027 is not inside a range that ends on 30 Apr 2027. Never put a date into a window it is not in.')
  return lines.join('\n')
}

/** rules = null: Fensterdaten nicht verfügbar → keine Sofortbuchung versprechen. */
export function buildTodayBlock(now: Date, rules: WindowRule[] | null, defaultMode: 'open' | 'request'): string {
  const t = azoresToday(now)
  const windows = rules === null
    ? 'Booking window information is currently unavailable: do not promise instant booking for any date; for booking questions offer a support ticket.'
    : describeBookingWindows(rules, defaultMode, t.iso)
  return `TODAY is ${t.long} (${t.iso}, Azores time). The current year is ${t.year}. Use this for ALL date logic and never assume another year from your own memory.\n\nBOOKING WINDOWS (live from our system):\n${windows}\n`
}

/**
 * Staff-Sandbox im Bot (31.10.2026): true nur, wenn der Server das Token selbst geprueft hat (isSandboxRequest)
 * und ein Mitarbeiter-Profil vorliegt. Dem Browser wird nie geglaubt; ein Gast ohne gueltiges Token bekommt nie true.
 */
export function isStaffSandbox(sb: { test: boolean; role: string | null } | null | undefined): boolean {
  return !!sb && sb.test === true && typeof sb.role === 'string' && sb.role.length > 0
}


/** Echtes Kalenderdatum YYYY-MM-DD? */
function validIso(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T12:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export type DiveDateCheck = {
  today: string
  first_dive_day: string | null
  first_dive_day_status: 'ok' | 'in_the_past' | 'invalid'
  divers: Array<{ diver: number; last_dive: string; status: 'ok' | 'in_the_future' | 'invalid'; months_before_first_dive_day: number | null; refresher_required: boolean }>
  refresher_required_for: number[]
  summary: string
}

/** Datumsrechnung fuer den Bot, deterministisch: Refresher-Pflicht gegen den Tauchtag (nicht gegen heute), Vergangenheit/Zukunft gegen heute. */
export function checkDiveDates(todayIso: string, firstDiveDay: unknown, lastDives: unknown, refresherCheck: (last: string, on: string) => boolean): DiveDateCheck {
  const first = validIso(firstDiveDay) ? firstDiveDay : null
  const firstStatus: DiveDateCheck['first_dive_day_status'] = first == null ? 'invalid' : first <= todayIso ? 'in_the_past' : 'ok'
  const list = Array.isArray(lastDives) ? lastDives : []
  const divers = list.map((raw, i) => {
    if (!validIso(raw)) return { diver: i + 1, last_dive: String(raw ?? ''), status: 'invalid' as const, months_before_first_dive_day: null, refresher_required: false }
    const future = raw > todayIso
    let months: number | null = null
    if (first) {
      const a = new Date(raw + 'T12:00:00Z'), b = new Date(first + 'T12:00:00Z')
      months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0)
    }
    return { diver: i + 1, last_dive: raw, status: future ? ('in_the_future' as const) : ('ok' as const), months_before_first_dive_day: months, refresher_required: !future && first != null && firstStatus === 'ok' ? refresherCheck(raw, first) : false }
  })
  const need = divers.filter(d => d.refresher_required).map(d => d.diver)
  const parts: string[] = [`Today is ${todayIso}.`]
  if (firstStatus === 'invalid') parts.push('The first dive day is missing or not a valid date.')
  if (firstStatus === 'in_the_past') parts.push(`The first dive day ${first} is today or in the PAST: it cannot be booked. Ask which date (probably next year) the guest means.`)
  for (const d of divers) {
    if (d.status === 'invalid') parts.push(`Diver ${d.diver}: last dive date is not valid, ask again.`)
    else if (d.status === 'in_the_future') parts.push(`Diver ${d.diver}: last dive ${d.last_dive} is in the FUTURE, which is impossible. Ask what the guest meant (do not change the year yourself).`)
    else parts.push(`Diver ${d.diver}: last dive ${d.last_dive}${d.months_before_first_dive_day != null ? `, ${d.months_before_first_dive_day} months before the first dive day` : ''} -> refresher ${d.refresher_required ? 'REQUIRED' : 'not required'}.`)
  }
  if (firstStatus === 'ok' && divers.length) parts.push(need.length ? `A Scuba Skills Update is required for diver ${need.join(' and ')}.` : 'Nobody needs a Scuba Skills Update.')
  if (firstStatus === 'ok' && need.length) parts.push(`Wording: the dive day is in the FUTURE, so say it in the future tense, e.g. "by your first dive on ${first} it will have been more than a year since your last dive". Never say "your last dive was over a year ago" (that is not true today).`)
  return { today: todayIso, first_dive_day: first, first_dive_day_status: firstStatus, divers, refresher_required_for: need, summary: parts.join(' ') }
}

// ── Saison-Check aus den Worten des Gastes (31.10.2026) ─────────────────────
// Der Bot sprach bei "coming in march" von Preisen und "I'll check availability", obwohl der März Low Season (nur Request) ist.
// Deshalb ermittelt der Server die Saison selbst aus den genannten Monaten und gibt sie dem Bot als feste Information.

const MONTH_WORDS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  januar: 1, februar: 2, 'märz': 3, maerz: 3, mai: 5, juni: 6, juli: 7, oktober: 10, dezember: 12,
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Monate (1-12) mit optionalem Jahr aus freiem Text. "may" nur mit Präposition/Zahl, damit das Hilfsverb nicht zählt. */
export function monthsInText(text: string): { month: number; year: number | null }[] {
  const t = String(text ?? '').toLowerCase().slice(0, 4000)
  const found: { month: number; year: number | null }[] = []
  const add = (month: number, rest: string) => {
    const y = /^\s*(20\d\d)\b/.exec(rest)
    const year = y ? Number(y[1]) : null
    if (!found.some(f => f.month === month && f.year === year)) found.push({ month, year })
  }
  const re = /(?:^|[^a-zà-ÿ])([a-zà-ÿ]{3,10})(?=[^a-zà-ÿ]|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    const w = m[1]
    const after = t.slice(m.index + m[0].length)
    if (MONTH_WORDS[w]) add(MONTH_WORDS[w], after)
    else if (w === 'may') {
      const before = t.slice(Math.max(0, m.index - 14), m.index + 1)
      if (/\b(in|of|early|late|mid|during|end|next|for|until|by|from|to)\s+$/.test(before) || /^\s*(\d|20\d\d)/.test(after) || /\d\s*(st|nd|rd|th)?\s+$/.test(before)) add(5, after)
    }
  }
  return found.slice(0, 3)
}

/** Ein Satz je Monat: welche Tage INSTANT / ON REQUEST / NOT bookable online sind. Null, wenn kein Monat genannt wurde. */
export function seasonHint(text: string, todayIso: string, rules: WindowRule[] | null, defaultMode: 'open' | 'request'): string | null {
  if (rules === null) return null
  const label = { open: 'INSTANT booking', request: 'ON REQUEST (Low Season: the guest sends a booking request, nothing is paid now)', blocked: 'NOT bookable online' } as const
  const lines: string[] = []
  for (const { month, year } of monthsInText(text)) {
    let y = year ?? Number(todayIso.slice(0, 4))
    const dim = (yy: number) => new Date(Date.UTC(yy, month, 0)).getUTCDate()
    const iso = (yy: number, d: number) => `${yy}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (year === null && iso(y, dim(y)) <= todayIso) y += 1
    const days = Array.from({ length: dim(y) }, (_, i) => i + 1).filter(d => iso(y, d) > todayIso)
    if (days.length === 0) continue
    const runs: { mode: 'open' | 'request' | 'blocked'; from: number; to: number }[] = []
    for (const d of days) {
      const mode = resolveWindowMode(rules, defaultMode, { date: iso(y, d), session: null, product_id: null }).mode
      const last = runs[runs.length - 1]
      if (last && last.mode === mode && last.to === d - 1) last.to = d
      else runs.push({ mode, from: d, to: d })
    }
    const head = `${MONTH_NAMES[month]} ${y}`
    lines.push(runs.length === 1
      ? `- ${head}: ${label[runs[0].mode]} for the whole month.`
      : `- ${head}: ${runs.map(r => `${r.from === r.to ? r.from : `${r.from}-${r.to}`} ${MONTH_NAMES[month]} = ${label[r.mode]}`).join('; ')}.`)
  }
  if (lines.length === 0) return null
  return `SEASON CHECK (computed by the server from the guest's own words; trust it over your own reading and mention the booking mode in your FIRST reply about that time, before prices):\n${lines.join('\n')}`
}
