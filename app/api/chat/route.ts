import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createDraft } from '@/lib/draft-bookings'
import { getAvailability } from '@/lib/availability'
import { getSetting } from '@/lib/site-settings'
import { needsRefresher } from '@/lib/insurance'
import { asksLastDive, isSkillsUpdate, REFRESHER_PRODUCT_ID } from '@/lib/productType'
import { SITE_META } from '@/lib/siteMeta'
import { loadBookingWindows, getBookingMode } from '@/lib/bookingMode'
import { resolveWindowMode } from '@/lib/bookingWindows'
import { buildTodayBlock, azoresToday, isStaffSandbox, checkDiveDates, monthsInText, seasonHint } from '@/lib/chatPrompt'
import { isSandboxRequest } from '@/lib/sandboxRequest'

// ── Tool definitions for the booking chatbot ─────────────────────────────────
const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'check_dive_dates',
      description: 'Deterministic date check. Call it EVERY time you know the first dive day and/or any last dive dates, BEFORE you say anything about dates, the year or a refresher. It tells you whether a date is in the past or future and which divers need a Scuba Skills Update (more than 12 months before the first dive day). NEVER do this arithmetic yourself and never change a year the guest gave.',
      parameters: {
        type: 'object',
        properties: {
          first_dive_day: { type: 'string', description: 'First dive day / course start, YYYY-MM-DD (use the next future occurrence if the guest names no year)' },
          last_dive_dates: { type: 'array', items: { type: 'string' }, description: 'Last dive of each diver, YYYY-MM-DD, one entry per diver in order. If only a month is named, use the 1st of its MOST RECENT PAST occurrence before today and do NOT ask the guest which year (just repeat month and year in your answer).' },
        },
        required: ['first_dive_day'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Live boat capacity. Call it BEFORE you ask the guest for or accept a dive day / AM-PM session, with a date range around the dates the guest named (max 31 days) and the number of divers. It returns for every day whether AM and PM have room for ALL divers on one boat. Offer and accept only sessions it reports as FREE. Never needed for courses.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'First day to check, YYYY-MM-DD' },
          to: { type: 'string', description: 'Last day to check, YYYY-MM-DD (max 31 days after from)' },
          num_divers: { type: 'integer', minimum: 1, description: 'Number of divers who dive together' },
        },
        required: ['from', 'to', 'num_divers'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_booking_draft',
      description: 'Create a draft booking reservation that the guest can pay for via the checkout link. Only call this after you have ALL required fields from the guest.',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'The product/course ID from the price list (e.g. "single-dive", "open-water-diver")',
          },
          date: {
            type: 'string',
            description: 'Booking date in YYYY-MM-DD format',
          },
          session: {
            type: 'string',
            enum: ['AM', 'PM'],
            description: 'Morning (AM) or afternoon (PM) session — dives only; omit for courses (instructor sets the times)',
          },
          dive_days: {
            type: 'array',
            items: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, session: { type: 'string', enum: ['AM', 'PM'] } }, required: ['date', 'session'] },
            description: 'ALL dive days the guest named for a dive pack, each with AM or PM (never invent or suggest days). Include every day the guest has decided; if some are still open, pass only the known ones. For single-day products or courses omit it. date/session must equal the earliest entry.',
          },
          capacity_request: {
            type: 'boolean',
            description: 'Set true ONLY when the guest insists on a dive day/session that check_availability showed as not FREE (or this tool answered NO_ROOM). The booking then goes out as a request (nothing paid, no seat held) and our team confirms or proposes another date. Never set it on your own.',
          },
          num_divers: {
            type: 'integer',
            minimum: 1,
            description: 'Number of divers/participants',
          },
          email: {
            type: 'string',
            description: 'Guest email address — required for booking confirmation',
          },
          diver_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'First and surname of EACH diver in order (diver 1 = the guest who books). Required when num_divers > 1 — passed to the booking page',
          },
          customer_phone: {
            type: 'string',
            description: 'Guest WhatsApp/mobile number if known (from the contact form) — passed to the booking page',
          },
          customer_name: {
            type: 'string',
            description: 'Guest full name (first AND surname) — use the contact-form name, ask only for the missing surname',
          },
          last_dive_dates: {
            type: 'array',
            items: { type: 'string' },
            description: 'Date (YYYY-MM-DD) of the LAST dive of EACH diver, one entry per diver, in the same order. REQUIRED for dives, specialties, pro courses, ecology, Upgrade courses and the Scuba Skills Update product; NOT for Basic Diver, Open Water, Scuba Diver. Ask every diver; if they cannot remember, ask for the best estimate.',
          },
          refresher_date: {
            type: 'string',
            description: 'YYYY-MM-DD of the Scuba Skills Update (refresher) day, ONLY a day the guest named himself, never invent one. REQUIRED if any diver\'s last dive is more than 12 months before the latest dive day. Must be after today and BEFORE the first dive day.',
          },
          insurance_choice: {
            type: 'string',
            enum: ['own', 'azd'],
            description: '"own" = guest has their own dive insurance, "azd" = guest wants the insurance we arrange (DAN day/block cover). REQUIRED unless the product includes insurance.',
          },
          equipment_addon_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of rental equipment the guest wants (from the equipment price list: rental-full-double, rental-bcd, rental-regulator, rental-wetsuit, rental-mask, rental-fins, rental-boots, rental-computer, rental-torch, rental-tank-15l, rental-gloves). Pass an EMPTY array if the guest needs none. REQUIRED (ask!) for every product except entry-level courses (Basic Diver, OWD, Scuba Diver, Skills Update).',
          },
          favourite_spot: {
            type: 'string',
            description: 'Optional: slug of the dive site the guest wishes for. Only if they mention one.',
          },
          last_day_on_island: {
            type: 'string',
            description: 'Courses only: last day the guest is on the island, YYYY-MM-DD. ASK for it for every course, so the course end can be planned before the guest leaves.',
          },
        },
        required: ['product_id', 'date', 'num_divers', 'email'],
      },
    },
  },
]

type ToolCallArgs = {
  product_id?: string
  date?: string
  session?: 'AM' | 'PM'
  dive_days?: { date: string; session: string }[]
  capacity_request?: boolean
  num_divers?: number
  email?: string
  customer_name?: string
  customer_phone?: string
  diver_names?: string[]
  last_dive_dates?: string[]
  refresher_date?: string
  insurance_choice?: 'own' | 'azd'
  equipment_addon_ids?: string[]
  favourite_spot?: string
  last_day_on_island?: string
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
/** Echtes Kalenderdatum (2020-13-45 und 2019-02-30 fallen durch). */
const ISO = { test: (v: unknown): boolean => {
  if (typeof v !== 'string' || !ISO_RE.test(v)) return false
  const d = new Date(v + 'T12:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
} }
const ymd = (d: Date) => d.toISOString().slice(0, 10)

// Dieselben Pflichtangaben wie im Online-Buchungstool (/book + checkoutGuest) — serverseitig erzwungen, nicht nur per Prompt.
async function validateBookingInfo(args: ToolCallArgs, sandboxLink = false): Promise<Record<string, unknown> | null> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const missing: { field: string; ask: string }[] = []
  const today = ymd(new Date())
  if (typeof args.session === 'string') args.session = args.session.toUpperCase() as 'AM' | 'PM'

  if (!args.product_id) return { error: 'MISSING_INFO', missing: [{ field: 'product_id', ask: 'Which product/course?' }] }
  const { data: product } = await db.from('course_prices')
    .select('id,name,category,price_cents,request_only,bookable_online,equipment_included,computer_included,insurance_included,duration_days_min,sessions_included')
    .eq('id', args.product_id).maybeSingle()
  if (!product) return { error: 'UNKNOWN_PRODUCT', instructions: 'This product id does not exist. Use an id from the price list or ask the guest to choose again.' }
  // Nur echte Tauch-/Kursprodukte — keine Miet-, Versicherungs- oder Zusatzposten
  if (!['dives', 'entry', 'specialty', 'pro', 'ecology', 'excursion'].includes(product.category as string)) return { error: 'UNKNOWN_PRODUCT', instructions: 'This id is not a bookable dive/course product. Use an id from the price list.' }
  // Was der Gast online nicht selbst buchen kann (bookable_online=false oder request_only), bucht auch der Bot nicht — dann Ticket.
  if (product.request_only || product.bookable_online === false) return { error: 'REQUEST_ONLY', instructions: 'This product is REQUEST ONLY (e.g. Night Dive, Single Dive, offshore excursions): it needs confirmation by our team. Do NOT create a booking and give NO booking link. Tell the guest briefly that this one is arranged on request and that you are opening a support ticket for them — use the words "support ticket" in your reply so the ticket form opens.' }

  if (!args.date || !ISO.test(args.date) || args.date <= today) missing.push({ field: 'date', ask: `A future date (YYYY-MM-DD) for the first dive / course start. Today is ${azoresToday().iso}. If the date the guest named has already passed this year, ask whether they mean the same date next year. Never present this to the guest as a technical problem.` })
  // Alle Tauchtage eines Dive-Packs (dive_days): jeder Tag zukuenftig, AM/PM, keine Doppelten, hoechstens so viele wie das Pack enthaelt
  let dayList: { date: string; session: string | null }[] = args.date && args.session ? [{ date: args.date, session: args.session }] : []
  if (product.category === 'dives' && Array.isArray(args.dive_days) && args.dive_days.length > 0) {
    const need = Math.max(1, Number(product.sessions_included ?? 1))
    const days = args.dive_days.map(d => ({ date: String(d?.date ?? ''), session: String(d?.session ?? '').toUpperCase() }))
    const seen = new Set<string>()
    const okDays = days.length <= need && days.every(d => ISO.test(d.date) && d.date > today && (d.session === 'AM' || d.session === 'PM') && !seen.has(d.date + d.session) && seen.add(d.date + d.session))
    if (!okDays) missing.push({ field: 'dive_days', ask: `dive_days must list at most ${need} different future days, each with AM or PM (the days the guest named). Ask the guest for the dive days again.` })
    else {
      days.sort((a, b) => (a.date + (a.session === 'AM' ? '0' : '1')).localeCompare(b.date + (b.session === 'AM' ? '0' : '1')))
      args.dive_days = days
      args.date = days[0].date
      args.session = days[0].session as 'AM' | 'PM'
      dayList = days
    }
  }
  // Buchungsfenster serverseitig erzwingen (Low Season = Request): kein Entwurf, kein Zahlungslink. Die Prompt-Regel allein reicht nicht. Gilt fuer JEDEN Tauchtag.
  const windowDays = dayList.length ? dayList : args.date ? [{ date: args.date, session: args.session ?? null }] : []
  const bookingWindows = windowDays.length ? await loadBookingWindows(db) : []
  const fallbackMode = windowDays.length ? await getBookingMode(db) : 'open'
  for (const wd of windowDays) {
    if (!ISO.test(wd.date) || wd.date <= today) continue
    const win = resolveWindowMode(bookingWindows, fallbackMode, { date: wd.date, session: wd.session ? wd.session.toLowerCase() : null, product_id: args.product_id ?? null })
    const gt = win.guest_text ? ` Note for the guest from our team: ${win.guest_text}` : ''
    if (win.mode === 'request') return { error: 'REQUEST_WINDOW', _card: makeCard('request', String(product.name ?? ''), args, buildBookUrl(args, null, sandboxLink, product.category !== 'dives')), instructions: `This date is inside an ON-REQUEST window (Low Season). No booking was created and nothing is paid. A card with a prefilled request appears below your message: tell the guest in 1-2 short sentences that for these dates we take booking requests, that their request is prepared below, that they can check it and send it from there, that nothing is paid now and that our team will get back to them by email. Do NOT write any link or URL. The date is only a preference, never promise it.${gt}` }
    if (win.mode === 'blocked') return { error: 'BLOCKED_WINDOW', instructions: `This date cannot be booked online.${gt} Tell the guest briefly and offer to open a support ticket. Do NOT create a booking.` }
  }
  const divers = Number.isInteger(args.num_divers) ? (args.num_divers as number) : 1
  if (!Number.isInteger(args.num_divers ?? 1) || divers < 1 || divers > 20) return { error: 'INVALID_DIVERS', instructions: 'num_divers must be a whole number between 1 and 20. Ask the guest again.' }

  if (divers > 1) {
    const names = (args.diver_names ?? []).map(n => String(n ?? '').trim()).filter(Boolean)
    if (names.length < divers || names.some(n => n.split(/\s+/).length < 2)) missing.push({ field: 'diver_names', ask: `First and surname of each of the ${divers} divers (diver 1 = the person booking).` })
  }
  const lastDiveRequired = asksLastDive(product.name, product.category)
  let latestDiveDay = args.date && ISO.test(args.date) ? args.date : ''
  if (latestDiveDay && (product.duration_days_min ?? 1) > 1) {
    const d = new Date(latestDiveDay + 'T12:00:00'); d.setDate(d.getDate() + (product.duration_days_min as number) - 1); latestDiveDay = ymd(d)
  }
  let refresherCount = 0
  if (lastDiveRequired) {
    const ld = args.last_dive_dates ?? []
    const ok = ld.length === divers && ld.every(x => ISO.test(x) && x <= today)
    if (!ok) missing.push({ field: 'last_dive_dates', ask: `The date of the last dive of EACH of the ${divers} diver(s) (YYYY-MM-DD, in the past). Ask every diver; an estimate is fine.` })
    else if (latestDiveDay && !isSkillsUpdate(product.name)) refresherCount = ld.filter(x => needsRefresher(x, latestDiveDay)).length
  }
  let refresherInfo: Record<string, unknown> | undefined
  if (refresherCount > 0) {
    const { data: rp } = await db.from('course_prices').select('name,price_cents').eq('id', REFRESHER_PRODUCT_ID).maybeSingle()
    refresherInfo = { product: rp?.name ?? 'Scuba Skills Update', price_eur_per_diver: rp ? rp.price_cents / 100 : null, divers_needing_it: refresherCount, note: 'Full equipment is included on the refresher day. With several divers and a refresher the online checkout switches to per-person booking.' }
    const rd = args.refresher_date
    const first = args.date ?? ''
    if (!rd || !ISO.test(rd) || rd <= today || rd >= first) {
      missing.push({ field: 'refresher_date', ask: `A Scuba Skills Update (refresher) is REQUIRED because at least one diver's last dive is more than 12 months before the dive day. Tell the guest this, quote the refresher price, and ask for a day for it — after today and BEFORE ${first}.` })
    }
  }
  if (!product.insurance_included && args.insurance_choice !== 'own' && args.insurance_choice !== 'azd') {
    missing.push({ field: 'insurance_choice', ask: 'Does the guest have their own dive insurance ("own") or should we arrange it ("azd")? Mention that the insurance we arrange is a DAN day/block cover priced per diving day; quote prices only from the list.' })
  }
  if (product.category === 'entry') {
    args.equipment_addon_ids = [] // Einsteigerkurse: keine Miet-/Extra-Auswahl (wie im Buchungstool)
  } else {
    if (!Array.isArray(args.equipment_addon_ids)) {
      missing.push({ field: 'equipment_addon_ids', ask: product.equipment_included
        ? 'Ask whether they want any paid extras: torch, 15L tank, gloves' + (product.computer_included ? '' : ', dive computer') + '. Pass [] if none.'
        : 'Ask about rental equipment: full equipment incl. computer (per day) or single items (BCD, regulator, wetsuit, mask, fins, boots, computer), plus extras torch, 15L tank, gloves. Quote prices from the list. Pass [] if they bring everything.' })
    } else {
      const { data: eq } = await db.from('course_prices').select('id,name').eq('category', 'equipment')
      const allowed = new Set((eq ?? []).map(e => e.id as string))
      let usable = allowed
      if (product.equipment_included) {
        usable = new Set(['rental-torch', 'rental-tank-15l', 'rental-gloves', ...(product.computer_included ? [] : ['rental-computer'])].filter(id => allowed.has(id)))
      }
      const bad = args.equipment_addon_ids.filter(id => !usable.has(id))
      if (bad.length) return { error: 'INVALID_EQUIPMENT', invalid: bad, allowed_ids: [...usable], instructions: 'Some equipment ids are not valid for this product. Use only allowed_ids.' }
    }
  }
  if (args.favourite_spot && !(args.favourite_spot in SITE_META)) return { error: 'INVALID_SPOT', valid_slugs: Object.keys(SITE_META), instructions: 'Unknown dive site slug.' }
  if (args.last_day_on_island && (!ISO.test(args.last_day_on_island) || args.last_day_on_island < today)) return { error: 'INVALID_LAST_DAY', instructions: 'last_day_on_island must be a future date YYYY-MM-DD.' }

  if (missing.length) return { error: 'MISSING_INFO', missing, refresher: refresherInfo, instructions: 'Do NOT call the tool again until you have asked the guest for these items and received answers. Ask them in a short, friendly message (you may ask several at once).' }
  return null
}

// Nur https-Origin aus der Env akzeptieren (lokale .env hat localhost); ohne Slash am Ende.
const SITE_ORIGIN = (/^https:\/\/[^/]+$/.test((process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')) ? (process.env.NEXT_PUBLIC_SITE_URL as string).replace(/\/+$/, '') : 'https://azoresdiving.com')

// Eigener Schalter fuer den Chatbot-Zahlungslink (site_settings.chatbot_link_mode, AI-Config-Tab) — direkt aus der DB, ohne Cache.
// Alles ausser 'production' (auch Fehler/fehlend) => Sandbox (fail-safe).
async function isSandboxLink(): Promise<boolean> {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { data, error } = await db.from('site_settings').select('value').eq('key', 'chatbot_link_mode').maybeSingle()
    if (error || !data) return true
    return data.value !== 'production'
  } catch {
    return true
  }
}

/** Karte, die der Chat unter der Bot-Antwort zeigt (Knopf oeffnet die vorbereitete Buchung). Nur Anzeige: der Server erzeugt sie, der Bot schreibt keinen Link. */
type BookingCard = {
  kind: 'book' | 'request'
  title: string
  product: string
  date: string | null
  session: 'AM' | 'PM' | null
  days?: { date: string; session: 'AM' | 'PM' }[]
  divers: string[]
  refresher_date: string | null
  equipment: boolean
  insurance: 'own' | 'azd' | null
  button: string
  url: string
}
function makeCard(kind: BookingCard['kind'], productName: string, args: ToolCallArgs, url: string): BookingCard {
  const n = Number.isInteger(args.num_divers) ? (args.num_divers as number) : 1
  const names = (args.diver_names ?? []).map(x => String(x ?? '').trim()).filter(Boolean)
  return {
    kind,
    title: kind === 'book' ? 'Your booking is prepared' : 'Your booking request is prepared',
    product: productName,
    date: args.date ?? null,
    session: args.session === 'AM' || args.session === 'PM' ? args.session : null,
    ...(Array.isArray(args.dive_days) && args.dive_days.length > 1 ? { days: args.dive_days.map(d => ({ date: d.date, session: (String(d.session).toUpperCase() === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM' })) } : {}),
    divers: names.length ? names.slice(0, 20) : [args.customer_name ?? `${n} diver${n > 1 ? 's' : ''}`],
    refresher_date: args.refresher_date ?? null,
    equipment: Boolean(args.equipment_addon_ids?.length),
    insurance: args.insurance_choice ?? null,
    button: kind === 'book' ? 'Review & complete booking' : 'Review & send request',
    url,
  }
}

function buildBookUrl(args: ToolCallArgs, draftId: string | null, sandbox: boolean, isCourse = false): string {
  const q = new URLSearchParams()
  if (args.product_id) q.set('product', args.product_id)
  // /book kennt nur am|pm — bei Night-Dives lieber ohne Datum/Session vorbelegen als falsch. Kurse: nur Startdatum, Zeiten setzt der Instructor.
  if (args.date && (isCourse || args.session === 'AM' || args.session === 'PM' || !args.session)) {
    q.set('date', args.date)
    if (!isCourse) q.set('session', args.session === 'PM' ? 'pm' : 'am')
  }
  if (args.capacity_request === true) q.set('capreq', '1')
  // Alle Tauchtage eines Dive-Packs: dates=YYYY-MM-DD:am,YYYY-MM-DD:pm (validiert und sortiert in validateBookingInfo)
  if (!isCourse && Array.isArray(args.dive_days) && args.dive_days.length > 0) {
    q.set('dates', args.dive_days.slice(0, 20).map(d => `${d.date}:${String(d.session).toLowerCase() === 'pm' ? 'pm' : 'am'}`).join(','))
  }
  if (args.num_divers) q.set('guests', String(args.num_divers))
  if (args.email) q.set('email', args.email)
  if (args.customer_name) q.set('name', args.customer_name.slice(0, 80))
  if (Array.isArray(args.diver_names) && args.diver_names.length > 1) q.set('names', args.diver_names.slice(0, 20).map(n => String(n).slice(0, 80)).join('|'))
  if (args.customer_phone) q.set('phone', args.customer_phone.slice(0, 30))
  if (args.last_dive_dates?.length) q.set('lastdive', args.last_dive_dates.join(','))
  if (args.refresher_date) q.set('refresher_date', args.refresher_date)
  if (args.insurance_choice) q.set('insurance', args.insurance_choice === 'azd' ? 'auto' : 'own')
  if (args.equipment_addon_ids?.length) q.set('addons', args.equipment_addon_ids.join(','))
  if (args.favourite_spot) q.set('spot', args.favourite_spot)
  if (args.last_day_on_island) q.set('lastday', args.last_day_on_island)
  if (draftId) q.set('draft_id', draftId)
  q.set('src', 'chatbot')
  // Sandbox: /book verlangt dann einen Staff-Login und zahlt nur mit dem Stripe-Testkey. Ohne Login kommt eine Fehlermeldung, nie ein Live-Checkout.
  if (sandbox) q.set('sandbox', '1')
  return `${SITE_ORIGIN}/book?${q.toString()}`
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
async function runCheckAvailability(a: { from?: unknown; to?: unknown; num_divers?: unknown }, staffSandbox: boolean): Promise<Record<string, unknown>> {
  try {
    const today = azoresToday().iso
    const divers = Number.isInteger(a.num_divers) ? (a.num_divers as number) : 1
    if (typeof a.from !== 'string' || typeof a.to !== 'string' || !ISO.test(a.from) || !ISO.test(a.to) || a.to < a.from) return { error: 'INVALID_RANGE', instructions: 'from and to must be YYYY-MM-DD with to >= from.' }
    if (divers < 1 || divers > 20) return { error: 'INVALID_DIVERS', instructions: 'num_divers must be 1-20.' }
    const from = a.from <= today ? ymd(new Date(new Date(today + 'T12:00:00Z').getTime() + 86400000)) : a.from
    if (a.to < from) return { error: 'PAST_RANGE', instructions: 'This range is in the past. Ask the guest for a future date.' }
    if ((new Date(a.to + 'T12:00:00Z').getTime() - new Date(from + 'T12:00:00Z').getTime()) / 86400000 > 31) return { error: 'RANGE_TOO_LONG', instructions: 'Maximum 31 days per call. Ask a narrower range.' }
    const rows = await getAvailability(from, a.to, undefined, staffSandbox)
    const days: Record<string, string>[] = []
    for (const r of rows) {
      if (r.session !== 'am' && r.session !== 'pm') continue
      let day = days.find(d => d.date === r.date)
      if (!day) { day = { date: r.date, weekday: WD[new Date(r.date + 'T12:00:00Z').getUTCDay()] }; days.push(day) }
      day[r.session.toUpperCase()] = r.bookable && r.max_party >= divers ? 'FREE' : r.reason === 'past_cutoff' ? 'NOT BOOKABLE (too short notice)' : r.reason === 'no_boat' ? 'NO BOAT' : r.bookable ? `NO ROOM for ${divers} divers together` : 'FULL'
    }
    return { num_divers: divers, days, instructions: 'Offer and accept ONLY sessions marked FREE. Never reveal seat numbers or boat details. A guest can still ask for a session that is not FREE: then it goes out as a request (capacity_request=true in the booking tool) and the team comes back with options.' }
  } catch (e) {
    console.warn('[chat] availability failed', e)
    return { error: 'AVAILABILITY_UNAVAILABLE', instructions: 'Availability could not be checked right now. Do not offer specific sessions; say the team confirms the session and offer a support ticket if the guest wants.' }
  }
}

async function runCreateBookingDraft(args: ToolCallArgs, ip: string | undefined, staffSandbox = false): Promise<Record<string, unknown>> {
  try {
    const sandboxLink = staffSandbox || await isSandboxLink()
    const invalid = await validateBookingInfo(args, sandboxLink)
    if (invalid) return invalid
    const dbp = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { data: prod } = await dbp.from('course_prices').select('category,name').eq('id', args.product_id ?? '').maybeSingle()
    const isCourse = Boolean(prod && prod.category !== 'dives')
    // Kapazitaet: jeder Tauchtag muss Platz fuer ALLE Taucher auf einem Boot haben. Voll => kein Entwurf; der Bot nennt Alternativen oder bietet an, die Anfrage ans Team zu geben.
    if (!isCourse) {
      const days = args.dive_days?.length ? args.dive_days : args.date && args.session ? [{ date: args.date, session: args.session }] : []
      if (days.length) {
        const dates = days.map(d => d.date).sort()
        const rows = await getAvailability(dates[0], dates[dates.length - 1], undefined, staffSandbox)
        const need = Number.isInteger(args.num_divers) ? (args.num_divers as number) : 1
        const full = days.filter(d => { const r = rows.find(x => x.date === d.date && x.session === String(d.session).toLowerCase()); return !r || !r.bookable || r.max_party < need })
        if (full.length && args.capacity_request === true) {
          return { error: 'CAPACITY_REQUEST', _card: makeCard('request', String(prod?.name ?? ''), args, buildBookUrl(args, null, sandboxLink, false)), instructions: `${full.map(d => `${d.date} ${d.session}`).join(', ')} is fully booked right now. No booking was created, nothing is paid and no seat is held. A card with the prefilled request appears below your message. Say in 2 short, warm but honest sentences: that day is fully booked right now, so we cannot promise it; the request is sent to the team who check what is possible and reply by email with a confirmation or another suggestion. Be friendly, but do not raise false hopes: no "we will do our best", never say it will probably work out, never promise or imply the session, no 'we will make it happen'. Do NOT write any link or URL.` }
        }
        if (full.length) return { error: 'NO_ROOM', instructions: `No booking was created: ${full.map(d => `${d.date} ${d.session}`).join(', ')} has no room for ${need} diver(s) on one boat (or is not bookable any more). Tell the guest briefly and kindly, positive tone. Call check_availability for nearby days and offer the free sessions. If the guest still wants the full session (or nothing fits), do not give up: call create_booking_draft again with the same details and capacity_request=true so it goes out as a request. Never promise the full session.` }
      }
    }
    const draft = await createDraft(
      {
        product_id: args.product_id,
        date: args.date,
        session: args.session,
        num_divers: Number.isInteger(args.num_divers) ? args.num_divers : 1,
        customer_email: args.email,
        customer_name: args.customer_name,
        ...(staffSandbox ? { metadata: { sandbox: true, source: 'bot-sandbox' } } : {}),
      },
      undefined,
      ip,
    )
    const bookUrl = buildBookUrl(args, draft.id, sandboxLink, isCourse)
    return {
      draft_id: draft.id,
      expires_at: draft.expires_at,
      // /book liest product/date/session/guests/email/draft_id aus der URL und fuellt das Formular vor. Der Gast prueft die Uebersicht und loest die Zahlung selbst per Knopf aus (kein Auto-Start).
      // (/checkout ist nur ein Platzhalter und wuerde die Startseite zeigen.)
      checkout_url: bookUrl,
      _card: makeCard('book', String(prod?.name ?? ''), args, bookUrl),
      instructions: 'A card with the prepared booking and a button appears below your message. Do NOT write any link or URL. The seat is confirmed only after payment: do not say it is held or reserved. A light, natural nudge to complete the booking is welcome.',
      ...(isCourse ? { note: 'Course: do not mention a morning/afternoon session — the instructor sets the times and the guest is informed via ticket.' } : {}),
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
    if (msg === 'RATE_LIMIT_EXCEEDED') {
      return { error: 'Our booking system is a bit busy from your connection right now — please try again in about 10 minutes, or book directly at azoresdiving.com/book.' }
    }
    if (msg === 'CAPACITY_CAP_EXCEEDED') {
      return { error: 'No availability for this date.' }
    }
    return { error: 'Failed to create booking. Please contact us directly.' }
  }
}

// Simple in-memory rate limiter (per IP, resets on cold start / redeployment)
const rateMap = new Map<string, { count: number; reset: number }>()
const RATE_LIMIT = 20       // max requests per window
const RATE_WINDOW = 60_000  // 60-second window
const MAX_BODY_BYTES = 65536 // 64 KB — system prompt alone can be 10+ KB

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.reset) {
    rateMap.set(ip, { count: 1, reset: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ── Price cache: refresh every 5 min, no DB hit on every message ──────────────
let priceCache: { text: string; fetchedAt: number } | null = null
const PRICE_CACHE_TTL = 5 * 60 * 1000

const CATEGORY_LABELS: Record<string, string> = {
  dives:      'FUN DIVES',
  entry:      'BEGINNER / ENTRY COURSES',
  specialty:  'SPECIALTY COURSES',
  pro:        'PRO COURSES',
  ecology:    'ECOLOGY COURSES',
  equipment:  'EQUIPMENT RENTAL (per item per dive)',
  extras:     'EXTRAS / SPECIAL TRIPS',
  insurance:  'DIVE INSURANCE',
}

async function getPriceList(): Promise<string> {
  const now = Date.now()
  if (priceCache && now - priceCache.fetchedAt < PRICE_CACHE_TTL) return priceCache.text
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data } = await supabase
      .from('course_prices')
      .select('id, name, category, price_cents, notes, sessions_included')
      .eq('is_placeholder', false)
      .gt('price_cents', 200) // exclude dummy €1-2 placeholder entries
      .order('category')
      .order('name')

    if (!data || data.length === 0) return ''

    const groups: Record<string, string[]> = {}
    for (const row of data) {
      const cat = row.category as string
      // Skip items not meant for public quoting
      const notes = (row.notes as string | null) ?? ''
      if (notes.toLowerCase().includes('dummy') || notes.toLowerCase().includes('not marketed')) continue
      const euros = ((row.price_cents as number) / 100).toFixed(0)
      const noteHint = notes && !notes.toLowerCase().includes('upon_request') ? ` — ${notes}` : ''
      if (!groups[cat]) groups[cat] = []
      const dd = cat === 'dives' && Number(row.sessions_included ?? 1) > 1 ? ` [dive_days_needed: ${row.sessions_included}]` : ''
      groups[cat].push(`  • ${row.name}: €${euros}${noteHint}${dd} [product_id: ${row.id}]`)
    }

    const lines = ['OFFICIAL PRICE LIST (use only these, never invent prices). The code in [product_id: …] is for the booking tool ONLY: pass it exactly as product_id, never guess or build an id yourself, never show it to the guest:']
    for (const [cat, items] of Object.entries(groups)) {
      lines.push(`\n${CATEGORY_LABELS[cat] ?? cat.toUpperCase()}:`)
      lines.push(...items)
    }

    const text = lines.join('\n')
    priceCache = { text, fetchedAt: now }
    return text
  } catch {
    return ''
  }
}

// ── System prompt (server-controlled — client cannot override) ────────────────
async function buildSystemPrompt(bookingEnabled: boolean, lead: { name: string; email: string; phone: string } | null = null): Promise<string> {
  const priceList = await getPriceList()
  // Heutiges Datum (Azoren) und aktive Buchungsfenster in den Prompt (31.10.2026)
  let todayBlock: string
  try {
    const dbw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const [windows, mode] = await Promise.all([loadBookingWindows(dbw), getBookingMode(dbw)])
    todayBlock = buildTodayBlock(new Date(), windows, mode)
  } catch {
    todayBlock = buildTodayBlock(new Date(), null, 'open')
  }
  // Kontaktdaten sind schon da — nicht erneut abfragen; E-Mail einmal bestätigen lassen, fehlenden Nachnamen nachfragen (Lucas 28.10.)
  const leadRule = lead && (lead.name || lead.email || lead.phone)
    ? `\n8. GUEST CONTACT (already captured before the chat started — do NOT ask for it again): name "${lead.name || '—'}", email "${lead.email || '—'}", WhatsApp "${lead.phone || '—'}". For a booking: if the name has only one word, ask once for the surname ("And your surname, for the booking?"). Always pass the full name as customer_name and the WhatsApp number as customer_phone to the booking tool so the booking page is pre-filled. If an email is on file, never ask "what is your email" — instead ask once "I'll use ${lead.email || 'the email you gave'} for the booking — correct, or would you like another one?" and show the current one whenever the guest corrects it. If no email is on file, ask for one.\n`
    : ''
  const bookingRule = bookingEnabled
    ? '\n7. BOOKING DRAFTS: You may create a booking draft using the create_booking_draft tool ONLY after you have collected ALL booking details, exactly like our online booking tool does. Ask conversationally (a few questions per message, never a long form), in this order: (0) CERTIFICATION AND LAST DIVE FIRST — before you recommend or price ANY dive product, and before you say anything about availability, whether a date works, a refresher or insurance, find out whether each diver is already certified, which level and agency (e.g. SSI/PADI Open Water, Advanced) and, for certified divers, roughly when their last dive was, with ONE short natural question like "How many of you are diving, are you all certified, and which level? And when was your last dive?" (never say "both" or "two" before the guest gave a number); if the guest asks for a price or a date first, answer briefly and ask this in the same message; never assume a certification; never confirm that a day or session is possible or available before check_availability has said so; (a) WHEN and WHAT, right after (0) and together in one natural question (e.g. "When would you like to dive, and what do you have in mind?") — product/course — for DIVES ask HOW MANY DIVE DAYS they want (1 day = Daily Double Dive, 2 = 4-Dive Pack, 3 = 6-Dive Pack, 4 = 8-Dive Pack, 5 = 10-Dive Pack; pick the matching pack from the price list and say the price) — then the date (first dive or course start; AM/PM ONLY for dives — for COURSES never ask morning or afternoon, the instructor sets the times later and the guest is informed), number of divers, and for COURSES also the LAST DAY the guest is on the island (ask "How long are you on the island, when do you leave?") so the course can be planned to finish before they leave — if the stay is shorter than the course needs, tell them and suggest an earlier start or another option, and pass last_day_on_island to the tool, (b) email and name — with more than one diver ask for the first AND surname of every diver (one message: "And the names of the other divers?") and pass them as diver_names, (c) the LAST DIVE DATE of every diver (required for dives, specialties, pro, ecology, upgrade courses and the Scuba Skills Update — not for Basic Diver / Open Water / Scuba Diver), (d) insurance: own dive insurance or ours (not asked if the product includes insurance), (e) rental equipment wishes and extras (full equipment incl. computer, single items, torch, 15L tank, gloves; not for entry-level courses; for courses that include equipment only paid extras), (f) optional favourite dive site. REFRESHER RULE (strict): if a diver\'s last dive is more than 12 months before the dive day, a Scuba Skills Update (refresher) is mandatory — tell the guest, quote the price from the list, and ask for a refresher day BEFORE the first dive day (full equipment incl. computer included that day). Never skip or waive it, never offer to book without it. The tool validates all of this server-side and returns MISSING_INFO with what to ask — follow it, do not guess values, never invent dates or answers for the guest. Never call the tool before you have everything. NOT-ONLINE-BOOKABLE products — anything the guest cannot book themselves on our website (request-only items such as Night Dive, Single Dive and the offshore excursions Formigas, Ilhéu, Sabrinas, plus items like Divemaster or Boat Diving): never call the tool and never give any booking link — explain that these are arranged on request and open a support ticket (say "support ticket" in your reply). The Scuba Skills Update IS bookable online as its own product, but ONLY when the guest wants just that. NEVER create a separate Scuba Skills Update booking for a refresher that belongs to a dive pack or course: pass its day as refresher_date in the ONE booking call. Call the tool exactly once per chat answer. To judge whether a diver needs the refresher, compare the last dive date with the DIVE DAY (not with today): more than 12 months before the first dive day means yes — check EVERY diver separately and name all who need it. After the tool returns, do NOT write any link or URL: the guest sees a booking card with a button below your message. Tell them in 1-2 short sentences that their PREPARED booking is shown below: they can open it, see the summary prefilled with everything from this chat, check it, correct anything that is wrong and send it from there; payment only happens on that page after they confirm. The seat is confirmed only after payment: never say or imply that a spot or seat is held, reserved or guaranteed before that, and you may add a light, natural nudge to finish the booking (for example that availability can change until the booking is completed, or that they can complete it in a minute whenever they are ready; never say "paid" or "payment" in that nudge, it puts guests off; never say it "keeps", "secures" or "saves" their spot, that implies a hold), warm and relaxed, never pushy, no fake scarcity and no countdowns. Never say or imply that the booking is already made, confirmed or paid, and never say things like "You are all set". Ask the guest to look at the summary carefully (dates, names, last dive dates, equipment, insurance).\n'
    : '\n7. BOOKING: Online booking via chat is currently disabled. If a guest wants to book, direct them to our website booking page or suggest opening a support ticket.\n'

  return `You are the support chatbot for Azores Diving, an SSI & Mares dive center in Ponta Delgada, São Miguel, Azores.

${todayBlock}
CRITICAL RULES — follow these without exception:

1. AVAILABILITY: You have NO direct view of the dive schedule. NEVER confirm, suggest or imply that spots are available for any date or time on your own. If a guest asks whether a date is available, say you cannot check live availability and that you are opening a support ticket so our team can reply by email (use the words "support ticket"). ${bookingEnabled ? 'The booking tool only checks capacity when it creates a draft for an INSTANT-booking date; never use it just to find out whether a date is available.' : ''} Dates inside an ON-REQUEST window follow rule 14 instead.

2. PRICES: ONLY quote prices from the official price list below. NEVER invent, estimate or guess a price. If something isn't listed, say: "Please contact us for a quote on that."

3. TONE: Be friendly, concise and helpful. Keep replies short (2–4 sentences max unless listing prices).

4. ESCALATION: If the customer wants to speak to a human, has a complaint, or needs something you can't handle, suggest opening a support ticket.

5. OPERATIONAL DECISIONS: NEVER promise or describe how we will organise groups, assign instructors, split participants, or arrange logistics. That is decided by our team. If asked, say: "Our team will be in touch to sort out the best setup for your group — just open a support ticket and we'll take it from there! 🙌"

6. POLICIES: NEVER invent or assume policies about weather, cancellations, rescheduling, or refunds. If asked, say: "For questions about our cancellation or reschedule policy, please contact us directly and our team will help you out."
${bookingRule}${leadRule}
8. FACTS ONLY: State only what is in the price list, in these rules or what you were told in this conversation. NEVER invent contact details, phone numbers, e-mail addresses, partner companies, tours, opening hours, durations, schedules or "examples". Our real contact details are: WhatsApp / phone +351 927 382 023, e-mail azoresdiving@gmail.com, Marina Pêro de Teive, Quiosque A, Ponta Delgada, open daily 8:00–20:00. If you do not know something, say so and suggest a support ticket.

9. LINKS: NEVER write a link yourself and never mention a "book-now" page — it does not exist. Booking links are never written by you: after the booking tool runs, a card with a button appears below your message. Otherwise send guests to https://azoresdiving.com/book (write exactly this link, nothing else) or a support ticket.

10. REFRESHER (Scuba Skills Update): Only required when the last dive was MORE than 12 months before the dive day. At 12 months or less (e.g. 3 or 11 months) NEVER recommend or add one. At more than 12 months it is mandatory for every certified diver and cannot be waived by self-assessment, a high dive count or an instructor claim — stay friendly but firm; for real exceptions the team decides via a support ticket.

11. MARINE LIFE AND ANIMAL ENCOUNTERS: Never promise or guarantee sightings. Never suggest catching, touching, feeding or eating marine life and never joke along with it, and do not recommend restaurants that serve protected species. Do not describe whale or dolphin tours, prices, operators or success rates yourself; if asked about activities besides diving, say our team can help arrange them and suggest a support ticket.

12. COURSES: Do not explain course schedules or durations from your own knowledge (days, "theory on day 1", etc.). Say the team plans the exact days with the guest and that a course needs several days. Never offer the Scuba Diver certification as a product to book; it is not sold as a stand-alone course.

13. LANGUAGE: Answer in the language the guest writes in.

14. ON-REQUEST AND BLOCKED DATES: The booking windows listed above are live. If the guest's wished date (or any day of a multi-day course) is inside an ON-REQUEST window: do NOT check or mention availability, do NOT create a booking draft and give NO payment link. Say in 2-3 short sentences that for these dates we take booking requests (nothing is paid now) and our team will get back to them by email. Collect the details like for a normal booking; once you have them, call the booking tool: for these dates it returns a prepared request that appears as a card with a button below your message (never write a link yourself). If the guest only asks in general, you may send them to https://azoresdiving.com/book. The date is only a preference, never promise it. Quote prices only if the guest asks. If a date is inside a NOT-bookable-online window, say it cannot be booked online and offer a support ticket. Only dates outside every window (INSTANT booking) may use the booking tool.

14b. MONTH OR PERIOD ONLY: Before you answer ANYTHING that concerns a time (month, season, date), be aware which booking window it lies in; a SEASON CHECK block at the end of this prompt, when present, was computed by the server from the guest words and is authoritative. As soon as the guest names only a month or period ("in March", "next spring"), compare it with the booking windows listed above BEFORE you list prices or products. If it lies fully inside an ON-REQUEST window (Low Season), say so in your FIRST reply, in one or two relaxed sentences: in that period we take booking requests instead of instant bookings, the guest sends us their wish, we check and come back by email with a confirmation or another suggestion, nothing is paid now. Do not say "I will check availability", do not suggest it is certain, do not list instant-booking language. If the period is partly instant and partly on request, say which part is which. Prices may follow after that, briefly, if the guest asked for them.

15. NO TECHNICAL TALK: NEVER say or imply "technical glitch", "technical issue", "hiccup", "issue on my end", "system problem" or "something went wrong with the system". If the booking tool reports missing or invalid information, tell the guest in one friendly sentence exactly what is missing or invalid and ask for it. If the tool truly fails, say you cannot complete this in the chat and that our team will take over by email, and offer a support ticket. No reason, no repeated apologies.

16. NO PROMISED RESPONSE TIMES: NEVER promise or estimate how fast we reply ("within the hour", "right away", "immediately", "soon", "today"). This includes phrases like "we can prepare your reservation right away": say that you will prepare the link, with no time words. Say: "Our team will get back to you by email."

17. DATES: Use TODAY above for all date logic. If the guest gives a date without a year or says "this year", use the current year; if that date has already passed, assume next year and confirm it once. A LAST dive given as a month without a year means its most recent past occurrence (before TODAY): never ask which year, just repeat month and year back in the answer. Never ask the guest to confirm a date in the past. "Last month", "last year" etc. are relative to TODAY. Ask each missing detail at most once and never re-ask something the guest already answered.

17b. DATE MATH IS NOT YOURS: never calculate months, years or past/future yourself and never change a year the guest gave. As soon as you know the first dive day or any last dive date, call the check_dive_dates tool and repeat ONLY what it says (including which divers need a refresher and whether the date is INSTANT or ON REQUEST). Never state on your own that a date is instant or on request: take it from the tool, and call the tool BEFORE you say anything about availability or booking for that date. If it says a date is in the future or the past, ask the guest what they meant.

17c. DAYS: For DIVES (dive packs, Daily Double Dive) ask the guest for ALL dive days of the product (the price list shows [dive_days_needed: N], otherwise 1) and AM or PM for each, and pass them as dive_days. Many guests do not know whether they want morning or afternoon: when they name a day without a session, ask in plain words (never say AM/PM) whether the morning or the afternoon boat suits them better; if they have no preference, name the session(s) check_availability marks FREE and let them pick. Never choose it for them silently. Never suggest, choose or give example days or dates: the guest names them. If the guest is still undecided about some days, pass only the known ones, the rest are picked on the booking page; say that once. For COURSES ask only for the start day (the days follow consecutively, the instructor sets the times). The refresher day, if one is needed, must come from the guest's own words: ask which day before the first dive suits them and wait; if the guest did not name one, ask again instead of choosing. Do not call the booking tool again after a booking card was shown unless the guest changes details.

17d. AVAILABILITY: Before you ask for or accept a dive day or AM/PM session, call check_availability (num_divers must come from the guest: if they only say "we" or "a few of us", ask how many they are first, together with the certification question, and do not report availability yet; never guess the number) with a date range around what the guest named and the number of divers. Only offer or accept sessions it marks FREE for all divers. If a wanted session is not free, say so in one friendly, positive sentence and offer the free alternatives from the tool (other session that day or nearby days). If the guest still prefers that session or nothing fits, do not turn them away: collect the usual booking details and call the booking tool with capacity_request=true, then the wish goes out as a request and our team confirms or suggests another day by email. Be honest: say the day is full and cannot be promised, never raise false hopes ('should work', 'we will manage'). Never mention seat numbers or boats, and never name clock times for sessions (they are confirmed after booking). If the guest has named no dates yet, do not call it.

18. CERTIFICATION: Dives (Daily Double Dive, dive packs, specialties, excursions) are only for CERTIFIED divers. Never prepare a dive booking until you know every diver's certification level. If a diver is NOT certified (or not sure): do not offer dive packs for that person; offer the Basic Diver experience (Pool + Sea) or the Open Water course from the price list, and say the team plans course days personally (rule 12). If a group is mixed, say so plainly and handle one product at a time: prepare the certified divers first, then the others. KNOWN PREREQUISITES (use exactly these, nothing more): Daily Double Dive and dive packs: any certified diver (Open Water or equal). Ilhéu de Vila Franca do Campo excursion: Open Water is enough. Formigas excursion: Pathway A = Advanced Open Water and 30+ logged dives, then a check dive with us and no Offshore Prep course needed; Pathway B = Open Water and MORE than 20 logged dives, then the Offshore Prep course first (€160, 1 day); Pathway C = Advanced Open Water with fewer than 30 logged dives, then Offshore Prep (€160, 1 day); Open Water with 20 or fewer logged dives is not yet eligible, they should gather more dive experience first — so for Formigas always ask for BOTH the certification level and the number of logged dives. SSI Deep Diving specialty: Open Water, minimum age 15, depths 18-40 m. SSI Wreck Diving specialty: Open Water, minimum age 10. SSI Night & Limited Visibility specialty: Open Water, minimum age 10. SSI Advanced Open Water Diver: Open Water, minimum age 12. SSI Navigation specialty: Open Water, minimum age 10. SSI Stress & Rescue: Open Water, minimum age 12, plus a valid First Aid certification not older than 2 years (our React Right course covers that; ask whether they have a current First Aid / CPR certificate). For EVERYTHING else (Sabrina e Lourenços excursion, other specialties, pro courses) you do not know the prerequisite: never decide it yourself, ask for level and logged dives and say the team confirms whether it fits.

19. TONE: Warm, relaxed and welcoming, like a friendly dive instructor, never like an authority or a form. Avoid the words "must", "required", "mandatory", "need to", "not allowed" and "unfortunately" in normal answers. For the Scuba Skills Update say something like: "Since it has been over a year since your last dive, we start with a relaxed Scuba Skills Update — a short refresher dive to get you comfortable in the water again (€95, full equipment included). Safety always comes first for us, and the North Atlantic is not a pool: currents, cooler water and swell can be demanding, so we want everyone to feel confident and in control before the first real dive. It can be on any day before your first dive, whichever suits you — which day would you like?" The guest always chooses the days: never pick or suggest a specific refresher day or dive day yourself (do not say "the day before" or "11 May"), only say it is before the first dive day. TENSES: the dive day is usually in the future, so never say that the last dive "was more than a year ago" unless that is true today; say "by your first dive on 12 May it will have been more than a year since your last dive". Never write the words must be before or has to be: say any day before your first dive works. It stays part of the booking (never offer to skip it), but present it as a good start, not as a rule. Never apologise for earlier answers or say "I made a mistake": just give the right information calmly. Keep it short and positive.

19b. VAGUE GUESTS: Guests are often vague. (1) If a guest says they did a course but cannot remember the level, or is unsure whether they are certified, do NOT treat them as certified: ask them to look for their certification card or app (SSI MySSI, PADI, etc.) and tell them the team can check it; until it is clear, mention that the Basic Diver experience or Open Water course would be the alternative if they turn out not to be certified. (2) For the refresher never use the words mandatory, required, must or compulsory: say "we add a Scuba Skills Update for you" and give the reason (safety, North Atlantic conditions, ease back in). (3) Never state how many years or months ago something was: say "more than a year" only, the numbers come from check_dive_dates. (4) OPENINGS: start a first answer by simply thanking the guest for their interest (for example "Thanks for your interest in diving with us!" or "Thanks for getting in touch!"), warm and humble. Never praise ourselves or the experience (no "fantastic", "amazing", "unforgettable", "best"), and avoid filler openers like "Great news!". (5) NO SELF-PRAISE anywhere in the chat, not only in openings: no "high-quality", "top", "perfect for you", "fantastic", "our experienced team" and no selling adjectives about us, our gear or our courses; state plain facts and let them speak. (6) Never state water or air temperatures (we cannot confirm them): about cold, say only that we dive in 7 mm wetsuits and that suits can be rented (rental is not included in the dive price unless the price list says so). Answer other side questions (gear, cold) briefly and then return to the one open question; never ask more than two questions per message.

20. FORMAT: Write like a friendly person in a chat, not like a document. Short paragraphs of 1-3 sentences, separated by a blank line. At most one or two **bold** words per message (key price or date only), never bold whole sentences or field labels. Lists only for 3+ items, one item per line starting with "- ". Ask at most two questions per message, each on its own line. No headings, no tables.
${priceList}`
}

export async function POST(req: NextRequest) {
  const key = process.env.MISTRAL_API_KEY
  if (!key) return NextResponse.json({ error: 'Mistral API key not configured' }, { status: 503 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request too large' }, { status: 413 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body || typeof body !== 'object' || !('messages' in body)) {
    return NextResponse.json({ error: 'Invalid request: messages required' }, { status: 400 })
  }

  const { messages } = body as { messages: unknown }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return NextResponse.json({ error: 'messages must be an array of 1–30 items' }, { status: 400 })
  }
  // Lead-Formular (Name / E-Mail / WhatsApp), vor dem Chat erfasst — nur saubere Strings übernehmen
  const rawLead = (body as { lead?: unknown }).lead
  const clean = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\r\n\t<>]/g, ' ').trim().slice(0, max) : ''
  const lead = rawLead && typeof rawLead === 'object' ? { name: clean((rawLead as Record<string, unknown>).name, 80), email: clean((rawLead as Record<string, unknown>).email, 120), phone: clean((rawLead as Record<string, unknown>).phone, 30) } : null

  // Staff-Sandbox (31.10.2026): nur mit gueltigem Mitarbeiter-Token (Server prueft selbst, dem Browser wird nie geglaubt).
  // Gaeste und der oeffentliche Bot senden das Flag nie; ein Flag ohne gueltiges Token endet mit 403, nie als Gast-Modus mit Rechten.
  const wantsSandbox = (body as { staff_sandbox?: unknown }).staff_sandbox === true
  let staffSandbox = false
  if (wantsSandbox) {
    staffSandbox = isStaffSandbox(await isSandboxRequest(req, true))
    if (!staffSandbox) return NextResponse.json({ error: 'Sandbox mode needs a valid staff login (token missing, expired or not a staff account).' }, { status: 403 })
  }

  // Check chatbot booking setting (Staff-Sandbox schaltet Buchen nur fuer diese eine Anfrage ein)
  const bookingEnabled = staffSandbox || (await getSetting('chatbot_booking_enabled', 'false')) === 'true'

  // Build server-authoritative system prompt with live prices
  let systemContent = await buildSystemPrompt(bookingEnabled, lead)
  // Saison-Check: Monate aus den Worten des Gastes gegen die Buchungsfenster rechnen (der Bot hat "march" sonst als normal buchbar behandelt)
  try {
    const userText = (messages as Array<{ role: string; content: unknown }>).filter(m => m.role === 'user').map(m => String(m.content ?? '')).join(' \n ')
    if (bookingEnabled && monthsInText(userText).length > 0) {
      const sdb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
      const hint = seasonHint(userText, azoresToday().iso, await loadBookingWindows(sdb), (await getBookingMode(sdb)) === 'request' ? 'request' : 'open')
      if (hint) systemContent += '\n\n' + hint
    }
  } catch (e) { console.warn('[chat] season hint failed', e) }

  // Strip any system messages sent by the client — server owns the system prompt
  type MistralMessage = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }
  const loop: MistralMessage[] = [
    { role: 'system', content: systemContent },
    ...(messages as Array<{ role: string; content: string }>)
      .filter(m => m.role !== 'system'),
  ]

  // Debug-Ausgabe nur in der Staff-Sandbox: Tool-Aufrufe und Ergebnisse sichtbar machen
  const sandboxDebug: Array<{ tool: string; args: unknown; result: unknown }> = []
  let bookingCard: BookingCard | null = null
  // Rohtext aus Tool-Ergebnissen (Anweisungen, JSON) darf nie beim Gast landen
  const LEAK = /Do NOT write any link|"instructions"|ALREADY_PREPARED|REQUEST_WINDOW|BLOCKED_WINDOW|MISSING_INFO|UNKNOWN_PRODUCT|\{\s*"error"|checkout_url|_card/
  const scrub = (d: unknown): unknown => {
    try {
      const msg = (d as { choices?: Array<{ message?: { content?: string | null } }> })?.choices?.[0]?.message
      if (msg && typeof msg.content === 'string' && LEAK.test(msg.content)) {
        msg.content = bookingCard
          ? 'Your prepared booking is ready below. Take a look, check the details and complete it from there.'
          : 'Thanks! Could you tell me a little more so I can help you with this?'
      }
    } catch (e) { console.warn('[chat] scrub failed', e) }
    return d
  }
  const out = (d0: unknown, status: number) => { const d = scrub(d0); return NextResponse.json(d && typeof d === 'object' && (staffSandbox || bookingCard) ? { ...(d as object), ...(bookingCard ? { booking_card: bookingCard } : {}), ...(staffSandbox ? { sandbox_debug: sandboxDebug } : {}) } : d, { status }) }
  const MAX_TOOL_ROUNDS = 4
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          max_tokens: 400,
          messages: loop,
          ...(bookingEnabled ? { tools: CHAT_TOOLS, tool_choice: 'auto' } : {}),
        }),
      })
      const data = await res.json() as {
        choices?: Array<{
          finish_reason: string
          message: {
            role: string
            content: string | null
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
          }
        }>
      }

      if (!res.ok || !data.choices?.length) {
        return out(data, res.status)
      }

      const choice = data.choices[0]

      // No tool calls — return final response to client
      if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls?.length) {
        return out(data, res.status)
      }

      if (round === MAX_TOOL_ROUNDS) {
        return out(data, res.status)
      }

      // Execute tool calls and append results for next round
      loop.push({ role: 'assistant', content: choice.message.content, tool_calls: choice.message.tool_calls })

      for (const tc of choice.message.tool_calls) {
        let result: Record<string, unknown>
        if (tc.function.name === 'create_booking_draft') {
          const args = JSON.parse(tc.function.arguments) as ToolCallArgs
          // Eine Antwort = hoechstens eine Buchung. Der Refresher steckt ueber refresher_date schon in der Hauptbuchung und wird nie als zweite Buchung angelegt.
          const full: Record<string, unknown> = bookingCard
            ? { error: 'ALREADY_PREPARED', instructions: 'The booking is already prepared and shown to the guest as a card. Do NOT create a second booking. A Scuba Skills Update is already part of it via refresher_date. Just tell the guest in one or two short sentences that it is ready below.' }
            : await runCreateBookingDraft(args, ip, staffSandbox)
          const { _card, ...forModel } = full
          if (_card) bookingCard = _card as BookingCard
          result = forModel
          if (staffSandbox) sandboxDebug.push({ tool: 'create_booking_draft', args, result: full })
        } else if (tc.function.name === 'check_dive_dates') {
          let a: { first_dive_day?: unknown; last_dive_dates?: unknown } = {}
          try { a = JSON.parse(tc.function.arguments) } catch { /* leere Argumente -> 'invalid' */ }
          const chk = checkDiveDates(azoresToday().iso, a.first_dive_day, a.last_dive_dates, (last, on) => needsRefresher(last, on))
          result = chk as unknown as Record<string, unknown>
          if (chk.first_dive_day && chk.first_dive_day_status === 'ok') {
            try {
              const wdb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
              const win = resolveWindowMode(await loadBookingWindows(wdb), await getBookingMode(wdb), { date: chk.first_dive_day, session: null, product_id: null })
              const modeText = win.mode === 'open' ? 'INSTANT booking (the guest can book and pay online).' : win.mode === 'request' ? 'ON REQUEST (Low Season): the guest sends a booking request, nothing is paid now, the team answers by email.' : 'cannot be booked online, offer a support ticket.'
              result = { ...chk, booking_mode: win.mode === 'open' ? 'INSTANT' : win.mode === 'request' ? 'ON_REQUEST' : 'NOT_BOOKABLE_ONLINE', summary: chk.summary + ' Booking mode for ' + chk.first_dive_day + ': ' + modeText }
            } catch (e) { console.warn('[chat] window lookup failed', e) }
          }
          if (staffSandbox) sandboxDebug.push({ tool: 'check_dive_dates', args: a, result })
        } else if (tc.function.name === 'check_availability') {
          let a: { from?: unknown; to?: unknown; num_divers?: unknown } = {}
          try { a = JSON.parse(tc.function.arguments) } catch { /* leer -> Fehler unten */ }
          result = await runCheckAvailability(a, staffSandbox)
          if (staffSandbox) sandboxDebug.push({ tool: 'check_availability', args: a, result })
        } else {
          result = { error: `Unknown tool: ${tc.function.name}` }
        }
        loop.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
    }

    return NextResponse.json({ error: 'Tool loop limit reached' }, { status: 500 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
