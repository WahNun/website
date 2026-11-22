/**
 * Validierung EINER Buchungsposition im Online-Checkout (Produkt + Tauchtage + Gäste + Extras + Versicherung).
 *
 * Herausgezogen aus app/api/checkout/route.ts (24.10.), damit der Online-Split (Lucas 24.10.: pro Person
 * eigenes Produkt und eigene Tage) dieselben Regeln pro Gast anwendet wie die Gruppenbuchung für alle.
 * Preise kommen IMMER aus course_prices — nie vom Client.
 */
import { assertSessionsBookable, getCourseAvailability, type BookingSessionKey as SessionKey } from '@/lib/availability'
import { depositUnitCents } from '@/lib/onlineDeposit'
import { INSTRUCTOR_PRODUCT_TYPES, asksLastDive, isSkillsUpdate, isProgramProduct, REFRESHER_PRODUCT_ID, productTypeFor } from '@/lib/productType'
import { needsRefresher, computeInsuranceBlocks, insuranceCostCents, primaryInsurancePlanId } from '@/lib/insurance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const COURSE_CATEGORIES = ['entry', 'specialty', 'ecology', 'pro']

/** Regel: Bootstage = letzte boatDays Sessions. 0 → keine. null → undefined (= Aufrufer behandelt alle als Boot). */
export function boatSessionKeysFor(sessions: { date: string; session: string }[], boatDays: number | null | undefined): Set<string> | undefined {
  if (boatDays === null || boatDays === undefined) return undefined
  const n = Math.min(Math.max(boatDays, 0), sessions.length)
  return new Set(sessions.slice(sessions.length - n).map(x => `${x.date}_${x.session}`))
}

export interface GuestInput {
  product_id: string
  sessions: { date: string; session: SessionKey }[]
  size: number
  last_dive_dates?: (string | null)[]
  refresher_date?: string
  addons?: { product_id: string; quantity: number }[]
  custom_items?: { label: string; amount_cents: number }[]
  insurance_requested?: boolean
  insurance_choice?: 'azd' | 'own'
  /** Eine frühere Karte derselben Person trägt schon das DAN-Paket (Gesamtsumme steht dort) — hier nichts berechnen */
  insurance_has_earlier_azd?: boolean
  /** Tage späterer Karten derselben Person mit DAN: die Summe wird einmal über alle Tage der Person gerechnet */
  insurance_later_dates?: string[]
  /** Tage, die ein früheres Produkt derselben Person über enthaltene Versicherung (SSI) deckt */
  insurance_covered_dates?: string[]
  last_day_on_island?: string
  /** Zusatzprodukt derselben Person (Online-Split): das Scuba Skills Update steckt schon in der ersten Buchung dieser Person */
  skip_refresher?: boolean
}

export type ValidatedAddon = { product_id: string; quantity: number; name: string; price_cents: number }

export interface ValidatedGuest {
  product: { id: string; name: string; category: string | null; price_cents: number; stripe_price_id: string | null; boat_days: number | null; insurance_included: boolean | null }
  isCourseProduct: boolean
  sessions: { date: string; session: SessionKey }[]
  size: number
  validatedAddons: ValidatedAddon[]
  customItems: { label: string; amount_cents: number }[]
  lastDiveRequired: boolean
  lastDiveDates: string[]
  refresherCount: number
  refresherDate: string
  insuranceTotalPerDiver: number
  insuranceProductId: string | null
  insuranceChoice: 'azd' | 'own' | null
  /** Gesamtbetrag dieser Position in Cent (Produkt × Gäste + Versicherung × Gäste + Add-ons + Custom) */
  totalCents: number
  /** Sessions, für die ein Platz-Hold gesetzt wird (Boot; Kurse nur ihre Bootstage) */
  holdSessions: { date: string; session: SessionKey }[]
  /** Letzter Tag auf der Insel (Kurse optional, Divemaster/Dive Guide Pflicht) — wird bei Anfragen im Changelog vermerkt */
  lastDayOnIsland: string | null
}

export type GuestValidation =
  | { ok: true; g: ValidatedGuest }
  | { ok: false; status: number; body: Record<string, unknown> }

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): GuestValidation => ({ ok: false, status, body: { error, ...extra } })

export async function validateGuest(supabase: Db, input: GuestInput, opts: {
  staffOverride: boolean; label?: string
  /** Low Season (Buchungsfenster 'request'): Tag ist ohnehin eine Anfrage — ein fehlender Instructor im Dienstplan sperrt dann nicht (Lucas 31.10.) */
  requestDay?: (date: string, productId: string) => boolean
}): Promise<GuestValidation> {
  const L = opts.label ? `${opts.label}: ` : ''
  const { product_id } = input
  if (!product_id) return fail(400, `${L}Missing product`)

  const sessions = input.sessions ?? []
  if (sessions.length === 0) return fail(400, `${L}No dive days selected`)
  for (const s of sessions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return fail(400, `${L}Invalid date`)
    if (s.session !== 'am' && s.session !== 'pm' && s.session !== 'night' && s.session !== 'tbd') return fail(400, `${L}Invalid session`)
  }
  const seen = new Set(sessions.map(s => `${s.date}_${s.session}`))
  if (seen.size !== sessions.length) return fail(400, `${L}Duplicate dive day selected`)

  const size = Number(input.size)
  if (!Number.isInteger(size) || size < 1 || size > 20) return fail(400, `${L}Invalid group size`)

  const { data: product, error: priceError } = await supabase
    .from('course_prices')
    .select('id, name, category, price_cents, is_placeholder, stripe_price_id, sessions_included, duration_days_min, boat_days, insurance_included')
    .eq('id', product_id)
    .single()
  if (priceError || !product) return fail(404, `${L}Unknown product`)
  if (product.is_placeholder || !product.price_cents || product.price_cents <= 0) return fail(400, `${L}Product is not bookable online`)

  const isCourseProduct = COURSE_CATEGORIES.includes(product.category ?? '')
  if (!isCourseProduct && sessions.some(x => x.session === 'tbd')) return fail(400, `${L}Please choose morning or afternoon for each dive day`)
  const nightProduct = product.id === 'night-dive'
  // Divemaster / Dive Guide: nur Wunsch-Starttag, immer Anfrage — das Team plant die Wochen (lib/productType)
  const programProduct = isProgramProduct(product.id)
  if (!nightProduct && sessions.some(x => x.session === 'night')) return fail(400, `${L}Night session is only available for the Night Dive product`)
  if (nightProduct && sessions.some(x => x.session !== 'night')) return fail(400, `${L}Night Dive is an evening session — pick a date, no AM/PM`)

  const required = programProduct ? 1 : isCourseProduct ? (product.duration_days_min ?? 1) : (product.sessions_included ?? 1)
  if (sessions.length !== required) {
    const unit = isCourseProduct ? 'course day' : 'dive day'
    return fail(400, `${L}${product.name} requires ${required} ${unit}${required === 1 ? '' : 's'} — please select ${required}.`)
  }

  const lastDayInput = (input.last_day_on_island ?? '').trim()
  if (lastDayInput && !/^\d{4}-\d{2}-\d{2}$/.test(lastDayInput)) return fail(400, `${L}Invalid last day on the island`)
  if (programProduct && !opts.staffOverride && !lastDayInput) {
    return fail(400, `${L}Please pick your last day on the island — we plan ${product.name} around it.`)
  }
  if (input.last_day_on_island && isCourseProduct) {
    const lastDay = sessions[sessions.length - 1].date
    if (lastDay > input.last_day_on_island) {
      return fail(400, `${L}The course ends on ${lastDay}, after your last day on the island (${input.last_day_on_island}). Please choose an earlier start date.`)
    }
  }

  // Verfügbarkeit serverseitig; Staff-Override nur: nicht in der Vergangenheit.
  // Pro-Programme: immer Anfrage, das Team plant Instructor und Tage — nur der Starttag darf nicht in der Vergangenheit liegen.
  if (opts.staffOverride || programProduct) {
    const todayAz = new Date(new Date().toLocaleString('en-US', { timeZone: 'Atlantic/Azores' })).toISOString().slice(0, 10)
    const past = sessions.find(x => x.date < todayAz)
    if (past) return fail(400, `${L}${past.date} is in the past`)
  } else {
    const check = await assertSessionsBookable(sessions, size, isCourseProduct ? boatSessionKeysFor(sessions, product.boat_days) : undefined)
    if (!check.ok) return fail(409, `${L}${check.error}`)
  }

  // Instructor-Kapazität für Kurse/Try Scuba
  if (!opts.staffOverride && !programProduct && INSTRUCTOR_PRODUCT_TYPES.includes(productTypeFor(product.name, product.category))) {
    const dates = sessions.map(x => x.date).sort()
    const days = await getCourseAvailability(dates[0], dates[dates.length - 1])
    const byDate = new Map(days.map(d => [d.date, d]))
    for (const x of sessions) {
      const d = byDate.get(x.date)
      if (!d) continue
      if (d.reason === 'past_cutoff') return fail(409, `${L}${x.date} is past the booking cutoff`)
      if (d.reason === 'no_roster' && opts.requestDay?.(x.date, product.id)) continue
      const remaining = d.capacity === null ? Infinity : d.capacity - d.booked_students
      if (!d.bookable || remaining < size) {
        return fail(409, `${L}Instructor capacity on ${x.date} is ${remaining <= 0 ? 'full' : `limited to ${remaining} more student(s)`} — please send us a request and we will plan it for you.`, { request_only: true })
      }
    }
  }

  // Refresher-Tag (Scuba Skills Update)
  const refresherDate = (input.refresher_date ?? '').trim()
  if (refresherDate) {
    const firstDive = [...sessions].map(x => x.date).sort()[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(refresherDate)) return fail(400, `${L}Invalid refresher date`)
    if (refresherDate >= firstDive) return fail(400, `${L}The Scuba Skills Update must take place before your first dive day`)
    if (refresherDate < new Date().toISOString().slice(0, 10)) return fail(400, `${L}Refresher date is in the past`)
  }

  // Add-ons: Preise vom Server
  const validatedAddons: ValidatedAddon[] = []
  if (input.addons && input.addons.length > 0) {
    const addonIds = input.addons.map(a => a.product_id)
    const { data: addonRows } = await supabase.from('course_prices').select('id, name, kind, price_cents, is_placeholder').in('id', addonIds)
    const addonMap = new Map((addonRows ?? []).map((r: { id: string; name: string; kind: string; price_cents: number; is_placeholder: boolean }) => [r.id, r]))
    for (const requested of input.addons) {
      const row = addonMap.get(requested.product_id) as { id: string; name: string; kind: string; price_cents: number; is_placeholder: boolean } | undefined
      if (!row || row.kind !== 'addon' || row.is_placeholder || !row.price_cents || row.price_cents <= 0) return fail(400, `${L}Invalid or unknown addon: ${requested.product_id}`)
      const qty = Number(requested.quantity)
      if (!Number.isInteger(qty) || qty < 1 || qty > 400) return fail(400, `${L}Invalid addon quantity for ${row.name}`)
      validatedAddons.push({ product_id: row.id, quantity: qty, name: row.name, price_cents: row.price_cents })
    }
  }

  // Letzter Tauchgang: Pflicht pro Gast bei Vorzertifikat; > 12 Monate → SSU
  const lastDiveRequired = asksLastDive(product.name, product.category)
  const lastDiveDates: string[] = (input.last_dive_dates ?? []).map(d => (d ?? '').trim())
  let refresherCount = 0
  // Staff-Pfad (Verkürzung/Walk-in): fehlende Last-Dive-Daten sind kein Blocker — der Refresher wird dort eh übersprungen (Test 4, 28.10.)
  const lastDiveIncomplete = lastDiveDates.length !== size || lastDiveDates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))
  if (lastDiveRequired && !(opts.staffOverride && lastDiveIncomplete)) {
    if (lastDiveIncomplete) {
      return fail(400, `${L}Please enter the date of the last dive for each of the ${size} diver${size === 1 ? '' : 's'}.`)
    }
    const today = new Date().toISOString().slice(0, 10)
    if (lastDiveDates.some(d => d > today)) return fail(400, `${L}Last dive date cannot be in the future.`)
    // Spätester gebuchter Tauchtag (Lucas 25.10.): > 12 Monate nicht im Wasser = Refresher, egal für wann gebucht
    const latestDiveDay = [...sessions].map(x => x.date).sort().slice(-1)[0]
    refresherCount = input.skip_refresher || isSkillsUpdate(product.name) || programProduct ? 0 : lastDiveDates.filter(d => needsRefresher(d, latestDiveDay)).length
    if (refresherCount > 0 && !refresherDate) return fail(400, `${L}Please pick a day for the Scuba Skills Update (before your first dive).`)
    if (!opts.staffOverride && refresherCount > 0 && refresherDate) {
      const [day] = await getCourseAvailability(refresherDate, refresherDate)
      const remaining = !day ? Infinity : day.capacity === null ? Infinity : day.capacity - day.booked_students
      const lowSeasonNoRoster = day?.reason === 'no_roster' && Boolean(opts.requestDay?.(refresherDate, product.id))
      if (day && (day.reason === 'past_cutoff' || (!lowSeasonNoRoster && (!day.bookable || remaining < refresherCount)))) {
        return fail(409, `${L}Instructor capacity for the Scuba Skills Update on ${refresherDate} is ${remaining <= 0 || !day.bookable ? 'full' : `limited to ${remaining} student(s)`} — pick another day or send us a request.`, { request_only: true })
      }
    }
    if (refresherCount > 0) {
      const { data: rp, error: rpErr } = await supabase.from('course_prices').select('id, name, price_cents').eq('id', REFRESHER_PRODUCT_ID).maybeSingle()
      if (rpErr || !rp?.price_cents) return fail(500, `${L}Refresher product (${REFRESHER_PRODUCT_ID}) missing in course_prices${rpErr ? `: ${rpErr.message}` : ''}`)
      validatedAddons.push({ product_id: rp.id, quantity: refresherCount, name: rp.name, price_cents: rp.price_cents })
    }
  }

  // Versicherung: Server rechnet selbst; im Kurspreis enthalten → nie als Posten
  let insuranceTotalPerDiver = 0
  let insuranceProductId: string | null = null
  const insuranceChoice: 'azd' | 'own' | null = input.insurance_choice === 'azd' || input.insurance_choice === 'own' ? input.insurance_choice : null
  if (input.insurance_requested && !product.insurance_included) {
    // Der Tag des Scuba Skills Update ist ein Wassertag → mitversichern (bei Einzelgast; Gruppen mit SSU laufen online im Split)
    // DAN einmal über ALLE Tage der Person (alle Karten mit DAN), günstigster Plan je zusammenhängendem Block.
    // Die Summe trägt die erste DAN-Karte der Person; spätere Karten berechnen nichts (unabhängig von der Eingabereihenfolge).
    if (!input.insurance_has_earlier_azd) {
      const ssiCovered = new Set(input.insurance_covered_dates ?? [])
      const ownDates = [...new Set([...sessions.map(s => s.date), ...(size === 1 && refresherCount > 0 && refresherDate ? [refresherDate] : []), ...(input.insurance_later_dates ?? [])])].filter(d => !ssiCovered.has(d))
      const blocks = computeInsuranceBlocks(ownDates)
      if (blocks.length > 0) {
        const planIds = [...new Set(blocks.map(b => b.planId))]
        const { data: insPlans } = await supabase.from('course_prices').select('id, price_cents').in('id', planIds).eq('category', 'insurance')
        const planPriceMap = new Map((insPlans ?? []).map((p: { id: string; price_cents: number }) => [p.id, p.price_cents]))
        insuranceTotalPerDiver = insuranceCostCents(ownDates, id => (planPriceMap.get(id) as number | undefined) ?? 0)
        if (insuranceTotalPerDiver > 0) insuranceProductId = primaryInsurancePlanId(blocks)
      }
    }
  }

  const customItems = (input.custom_items ?? []).filter(c =>
    typeof c.label === 'string' && c.label.trim().length > 0 && typeof c.amount_cents === 'number' && c.amount_cents > 0,
  ).map(c => ({ label: c.label.trim(), amount_cents: c.amount_cents }))

  const totalCents = product.price_cents * size
    + insuranceTotalPerDiver * size
    + validatedAddons.reduce((a, x) => a + x.price_cents * x.quantity, 0)
    + customItems.reduce((a, x) => a + x.amount_cents, 0)

  const boatKeys: Set<string> | null = isCourseProduct ? (boatSessionKeysFor(sessions, product.boat_days) ?? null) : null
  const holdSessions = sessions.filter(x => x.session !== 'tbd' && (boatKeys === null || boatKeys.has(`${x.date}_${x.session}`)))

  return {
    ok: true,
    g: {
      product, isCourseProduct, sessions, size, validatedAddons, customItems,
      lastDiveRequired, lastDiveDates, refresherCount, refresherDate,
      insuranceTotalPerDiver, insuranceProductId, insuranceChoice, totalCents, holdSessions,
      lastDayOnIsland: lastDayInput || null,
    },
  }
}

/** booking_extras (strukturierte Extras für die FO-Übersicht) — JSON-String, max. 500 Zeichen (Stripe-Metadaten). */
export function extrasJsonFor(g: ValidatedGuest, limit = 500): string | undefined {
  const extras: Record<string, unknown> = {}
  if (g.insuranceTotalPerDiver > 0 && g.insuranceProductId) {
    extras.insurance = { product_id: g.insuranceProductId, name: 'DAN Dive Insurance', per_diver_cents: g.insuranceTotalPerDiver, guests: g.size, total_cents: g.insuranceTotalPerDiver * g.size }
  }
  const equipItems = g.validatedAddons.filter(a => a.product_id.startsWith('rental-'))
  const addonItems = g.validatedAddons.filter(a => !a.product_id.startsWith('rental-'))
  if (equipItems.length > 0) extras.equipment = equipItems.map(a => ({ product_id: a.product_id, name: a.name, quantity: a.quantity, unit_price_cents: a.price_cents, total_cents: a.price_cents * a.quantity }))
  if (addonItems.length > 0) extras.addons = addonItems.map(a => ({ product_id: a.product_id, name: a.name, quantity: a.quantity, unit_price_cents: a.price_cents, total_cents: a.price_cents * a.quantity }))
  if (g.customItems.length > 0) extras.custom = g.customItems
  if (Object.keys(extras).length === 0) return undefined
  const json = JSON.stringify(extras)
  return json.length <= limit ? json : undefined
}

/**
 * Buchungs-Metadaten einer Position — exakt die Felder, die lib/booking.ts createBookingFromSession liest.
 * Für die Gruppenbuchung landen sie in Stripe; für den Split in checkout_specs (ohne 500-Zeichen-Limit).
 */
export function bookingMetadataFor(g: ValidatedGuest, extrasLimit = 500): Record<string, string> {
  const extrasJson = extrasJsonFor(g, extrasLimit)
  return {
    product_id: g.product.id,
    product_name: g.product.name,
    product_type: productTypeFor(g.product.name, g.product.category),
    booking_date: g.sessions[0].date,
    session: g.sessions[0].session,
    group_size: String(g.size),
    sessions: g.sessions.map(x => `${x.date}:${x.session}`).join(','),
    ...(g.isCourseProduct && g.product.boat_days !== null && g.product.boat_days !== undefined ? {
      boat_days: String(g.product.boat_days),
      boat_sessions: [...(boatSessionKeysFor(g.sessions, g.product.boat_days) ?? [])].map(k => k.replace('_', ':')).join(','),
    } : {}),
    ...(g.insuranceTotalPerDiver > 0 ? {
      insurance_amount: String(g.insuranceTotalPerDiver * g.size),
      insurance_product_id: g.insuranceProductId ?? '',
      insurance_choice: 'azd',
    } : {}),
    ...(g.insuranceChoice === 'own' ? { insurance_choice: 'own' } : {}),
    ...(g.lastDiveRequired ? { last_dive_dates: g.lastDiveDates.join(','), refresher_count: String(g.refresherCount) } : {}),
    ...(g.refresherCount > 0 && g.refresherDate ? { refresher_date: g.refresherDate } : {}),
    ...(extrasJson ? { booking_extras_json: extrasJson } : {}),
    total_cents: String(g.totalCents),
  }
}

/**
 * Stripe line_items einer Position. `prefix` (z. B. "Guest 2 — ") kennzeichnet Split-Positionen.
 * `opts.deposit` (Lucas 30.10.): 50 % auf jede Position AUSSER Versicherung — die bleibt voll. Jede Position
 * wird einzeln halbiert (kein Sammelposten), damit `course_price_id` erhalten bleibt und KeyInvoice die
 * Rechnung weiter aus den Stripe-Positionen bauen kann. Ohne `opts` byte-identisch zum bisherigen Verhalten.
 */
export function lineItemsFor(g: ValidatedGuest, prefix = '', opts?: { deposit?: boolean }) {
  const deposit = opts?.deposit === true
  const amt = (cents: number) => deposit ? depositUnitCents(cents) : cents
  const sfx = deposit ? ' — 50% deposit' : ''
  const items: Array<Record<string, unknown>> = []
  // product_data.metadata.course_price_id: der Webhook mappt darüber auf keyinvoice_product_id
  // (kein Produkt hat eine stripe_price_id — gefunden 24.10., sonst wäre keine Online-Zahlung fakturierbar).
  // Deposit: ein fester Stripe-Preis lässt sich nicht halbieren → immer price_data.
  if (g.product.stripe_price_id && !prefix && !deposit) {
    items.push({ price: g.product.stripe_price_id, quantity: g.size })
  } else {
    items.push({
      quantity: g.size,
      price_data: {
        currency: 'eur',
        unit_amount: amt(g.product.price_cents),
        product_data: { name: `${prefix}${g.product.name}${sfx}`, description: g.sessions.map(x => `${x.date} ${x.session.toUpperCase()}`).join(' · ').slice(0, 300), metadata: { course_price_id: g.product.id } },
      },
    })
  }
  if (g.insuranceTotalPerDiver > 0) {
    items.push({ quantity: g.size, price_data: { currency: 'eur', unit_amount: g.insuranceTotalPerDiver, product_data: { name: `${prefix}DAN Dive Insurance`, description: 'Non-refundable once issued', metadata: { course_price_id: g.insuranceProductId ?? '' } } } })
  }
  for (const a of g.validatedAddons) {
    items.push({ quantity: a.quantity, price_data: { currency: 'eur', unit_amount: amt(a.price_cents), product_data: { name: `${prefix}${a.name}${sfx}`, metadata: { course_price_id: a.product_id } } } })
  }
  for (const c of g.customItems) {
    items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: amt(c.amount_cents), product_data: { name: `${prefix}${c.label}${sfx}` } } })
  }
  return items
}

/**
 * Betrag, den Stripe bei Deposit für diese Position einzieht — dieselbe Rechnung wie `lineItemsFor(..., { deposit: true })`
 * (Ceil je Position × Menge, Versicherung voll). Kein zweiter Rechenweg: Summe muss dem Stripe-Betrag entsprechen.
 */
export function depositDueCents(g: ValidatedGuest): number {
  return depositUnitCents(g.product.price_cents) * g.size
    + g.insuranceTotalPerDiver * g.size
    + g.validatedAddons.reduce((a, x) => a + depositUnitCents(x.price_cents) * x.quantity, 0)
    + g.customItems.reduce((a, x) => a + depositUnitCents(x.amount_cents), 0)
}
