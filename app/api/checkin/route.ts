import { NextRequest, NextResponse } from 'next/server'
import { groupGuests, siblingCardIds } from '@/lib/checkinGroup'

/** Andere Gäste derselben Zahlung für die Check-in-Seite: nur „Guest N“, Link und done — keine Produkt-, Termin- oder Versicherungsdaten der anderen Person. */
async function groupGuestsPublic(supabase: Parameters<typeof groupGuests>[0], bookingId: string) {
  const g = await groupGuests(supabase, bookingId, false).catch(() => [])
  return g.map(x => ({ ...x, product_name: null, booking_date: null, session: null, extras: [] as string[] }))
}
import { insuranceFlagFor, type InsuranceSource } from '@/lib/insurance'
import { addDayCoverToBooking, priceDayCover } from '@/lib/dayCover'
import { sendMedicalClearanceRequired } from '@/lib/email'
import { createClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/errors'
import { createHash } from 'crypto'
import { WAIVER_VERSION, waiverSnapshot } from '@/lib/waiverText'

export const runtime = 'nodejs'

// Service role client — never expose this key to the browser
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

function getServiceClient(): Db {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const TOKEN_RE = /^[a-f0-9]{32}$/i

// Serverseitige Flag-Berechnung aus den rohen Antworten.
// q3, q5, q10 loesen direkt aus; jedes Ja in den Boxen (a-g) ebenfalls.
function computeFlag(answers: Record<string, boolean>): boolean {
  if (answers.q3 || answers.q5 || answers.q10) return true
  return Object.entries(answers).some(([k, v]) => v && /^[a-g]/.test(k))
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normEmail(v: string) { return v.toLowerCase().trim() }

function isMinorFromDob(dob: string | null | undefined): boolean {
  if (!dob) return false
  const d = new Date(dob)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age < 18
}

/**
 * Ein Token ist entweder der Buchungs-Token (alle Plaetze) oder der Einzel-Token
 * eines Platzes (genau dieser). Wer eingeladen wurde, soll nicht durch die Daten
 * der anderen blaettern koennen — deshalb faellt hier die Entscheidung einmal
 * zentral, statt an jeder Abfrage neu.
 */
async function resolveToken(supabase: Db, token: string): Promise<
  { bookingId: string; onlySlot: number | null } | null
> {
  const { data: byBooking } = await supabase
    .from('bookings').select('id').eq('checkin_token', token).maybeSingle()
  if (byBooking) return { bookingId: byBooking.id, onlySlot: null }

  const { data: bySlot } = await supabase
    .from('booking_customers').select('booking_id, slot_index').eq('invite_token', token).maybeSingle()
  if (bySlot) return { bookingId: bySlot.booking_id, onlySlot: bySlot.slot_index }

  return null
}

// ─── GET /api/checkin ──────────────────────────────────────────────────────────
// ?token=xxx           → validate token, return booking + slots
// ?token=xxx&email=xxx → returning-guest prefill (nur für E-Mails dieser Buchung)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // ── Returning guest prefill ──
  //
  // Wichtig: früher gab diese Route zu JEDER beliebigen E-Mail das volle
  // Kundenprofil heraus, sobald der Aufrufer irgendeinen gültigen Token hatte —
  // Name, Telefon, Geburtsdatum, Notfallkontakt. Jeder Kunde mit eigenem
  // Check-in-Link hätte fremde Adressen durchprobieren können.
  // Jetzt wird nur vorausgefüllt, wenn die E-Mail nachweislich zu DIESER
  // Buchung gehört: entweder die Zahler-Adresse aus Stripe, oder ein Kunde,
  // der bereits an einem Slot dieser Buchung hängt.
  if (email) {
    try {
      if (!EMAIL_RE.test(email)) return NextResponse.json({ found: false })

      const { data: booking } = await supabase
        .from('bookings')
        .select('id, checkin_token_expires_at, customer_email, is_test')
        .eq('checkin_token', token)
        .maybeSingle()

      if (!booking) return NextResponse.json({ found: false })
      if (booking.checkin_token_expires_at && new Date(booking.checkin_token_expires_at) < new Date()) {
        return NextResponse.json({ found: false })
      }

      const wanted = normEmail(email)
      let allowed = booking.customer_email
        ? normEmail(booking.customer_email) === wanted
        : false

      if (!allowed) {
        const { data: linked } = await supabase
          .from('booking_customers')
          .select('customers!booking_customers_customer_id_fkey(email)')
          .eq('booking_id', booking.id)
          .not('customer_id', 'is', null)
        allowed = (linked ?? []).some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r: any) => r.customers?.email && normEmail(r.customers.email) === wanted
        )
      }

      if (!allowed) return NextResponse.json({ found: false })

      const { data: customer } = await supabase
        .from('customers')
        .select('name, first_name, last_name, phone, phone_prefix, phone_number, gender, nationality, country_of_residence, dob, experience_level, cert_agency, cert_number, insurance_provider, insurance_policy_number, logged_dives, last_dive_date, emergency_contact_name, emergency_contact_phone')
        .eq('email', wanted)
        .eq('is_test', booking.is_test)
        .maybeSingle()

      if (!customer) return NextResponse.json({ found: false })

      return NextResponse.json({
        found: true,
        customer: {
          name: customer.name ?? '',
          first_name: customer.first_name ?? '',
          last_name: customer.last_name ?? '',
          phone: customer.phone ?? '',
          phone_prefix: customer.phone_prefix ?? '',
          phone_number: customer.phone_number ?? '',
          gender: customer.gender ?? '',
          nationality: customer.nationality ?? '',
          country_of_residence: customer.country_of_residence ?? '',
          dob: customer.dob ?? '',
          experience_level: customer.experience_level ?? 'none',
          cert_agency: customer.cert_agency ?? '',
          cert_number: customer.cert_number ?? '',
          insurance_provider: customer.insurance_provider ?? '',
          insurance_policy_number: customer.insurance_policy_number ?? '',
          last_dive_date: customer.last_dive_date ?? '',
          logged_dives: customer.logged_dives ?? null,
          emergency_contact_name: customer.emergency_contact_name ?? '',
          emergency_contact_phone: customer.emergency_contact_phone ?? '',
        },
      })
    } catch (e) {
      console.error('[checkin GET email lookup]', e)
      return NextResponse.json({ found: false })
    }
  }

  // ── Token validation ──
  try {
    const resolved = await resolveToken(supabase, token)
    if (!resolved) return NextResponse.json({ valid: false, reason: 'not_found' })

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, product_name, booking_date, session, group_size, source, checkin_token_expires_at, status, is_test, insurance_product_id, insurance_choice, customer_email, booking_extras, last_dive_date, terms_accepted_at')
      .eq('id', resolved.bookingId)
      .maybeSingle()

    if (bookingError || !booking) {
      return NextResponse.json({ valid: false, reason: 'not_found' })
    }

    // Kurs mit inkludierter Versicherung (course_prices.insurance_included) → Versicherungsfrage entfällt
    const { data: prodRow } = await supabase
      .from('course_prices').select('insurance_included, category').eq('name', booking.product_name ?? '').maybeSingle()
    const productInsuranceIncluded = Boolean(prodRow?.insurance_included)
    const isEntryCourse = (prodRow as { category?: string | null } | null)?.category === 'entry'

    if (booking.status === 'cancelled' || booking.status === 'no_show') {
      return NextResponse.json({ valid: false, reason: 'cancelled' })
    }

    if (booking.checkin_token_expires_at && new Date(booking.checkin_token_expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: 'expired' })
    }

    const slotQuery = supabase
      .from('booking_customers')
      .select('id, slot_index, checkin_completed_at, customer_id, invite_email, invite_sent_at, guest_name, last_dive_date, customers!booking_customers_customer_id_fkey(name, emergency_contact_name, emergency_contact_phone)')
      .eq('booking_id', booking.id)
      .order('slot_index')

    const { data: allSlots, error: slotsError } = await slotQuery

    // Ein Eingeladener sieht ausschliesslich seinen eigenen Platz. Der
    // Buchungs-Token sieht alle — das ist der Kaeufer.
    const slots = resolved.onlySlot === null
      ? allSlots
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (allSlots ?? []).filter((x: any) => x.slot_index === resolved.onlySlot)

    if (slotsError || !slots) {
      console.error('[checkin GET] slots error:', slotsError)
      return NextResponse.json({ valid: false, reason: 'not_found' })
    }

    if (slots && slots.length > 0 && slots.every((x: { checkin_completed_at: string | null }) => x.checkin_completed_at !== null)) {
      return NextResponse.json({ valid: false, reason: 'all_complete', group_others: resolved.onlySlot === null ? await groupGuestsPublic(supabase, booking.id) : [] })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedSlots = (slots ?? []).map((x: any) => ({
      id: x.id,
      slot_index: x.slot_index,
      checkin_completed_at: x.checkin_completed_at ?? null,
      invite_email: x.invite_email ?? null,
      invite_sent_at: x.invite_sent_at ?? null,
      customer: x.customers ? { name: x.customers.name ?? '' } : null,
      guest_name: x.guest_name ?? null,
      // Vom Front Office erfasst → Check-in fragt nicht erneut. Fallback: Buchungswert (Einzelgast/Altbestand).
      last_dive_date: x.last_dive_date ?? (booking.group_size <= 1 ? (booking.last_dive_date ?? null) : null),
    }))

    // Notfallkontakt des ersten bereits eingecheckten Gastes. Gast 2+ kann ihn
    // per Haken uebernehmen, statt ihn abzutippen — dieselbe Buchung, dieselbe
    // Reisegruppe. Ueber Buchungsgrenzen hinweg gaebe es das nie: der Token
    // gehoert genau zu dieser Buchung.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstDone = (allSlots ?? []).find((x: any) => x.checkin_completed_at !== null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fd = firstDone ? (firstDone as any).customers : null
    const primaryEmergency = fd?.emergency_contact_name
      ? {
          name: fd.emergency_contact_name as string,
          phone: (fd.emergency_contact_phone ?? '') as string,
          guest: (fd.name ?? '') as string,
        }
      : null

    // Angebot „DAN day cover bei uns kaufen“ fürs Check-in-Formular: Preis über die Tage-Staffel der gebuchten Tauchtage
    let dayCoverOffer: { cents: number; days: number } | null = null
    try { const o = await priceDayCover(supabase, booking.id, String(booking.booking_date)); dayCoverOffer = { cents: o.cents, days: o.days } } catch { /* kein Preis → Hinweis ohne Betrag */ }

    // Weitere Karten derselben Person: DAN, das dort gekauft wurde (oder dort gewählt), gilt für die ganze Person
    let sibDan = false
    let sibChoice: 'azd' | 'own' | null = null
    try {
      const sibIds = await siblingCardIds(supabase, booking.id)
      if (sibIds.length > 0) {
        const { data: sibs } = await supabase.from('bookings').select('insurance_product_id, insurance_choice, booking_extras').in('id', sibIds)
        for (const sb of (sibs ?? []) as { insurance_product_id: string | null; insurance_choice: string | null; booking_extras: { insurance?: { total_cents?: number } } | null }[]) {
          if (sb.insurance_product_id || (sb.booking_extras?.insurance?.total_cents ?? 0) > 0 || sb.insurance_choice === 'azd') sibDan = true
          else if (sb.insurance_choice === 'own') sibChoice = 'own'
        }
      }
    } catch { /* ohne Zusatzkarten-Info: Verhalten wie bisher */ }

    return NextResponse.json({
      valid: true,
      is_test: booking.is_test,
      primary_emergency: primaryEmergency,
      day_cover_offer: dayCoverOffer,
      // Bezahlte DAN-Tagesversicherung zählt auch, wenn nur booking_extras sie kennt (ältere Walk-ins
      // haben insurance_product_id nicht gesetzt) — die Frage „eigene Versicherung?" entfällt dann.
      insurance_included: Boolean(booking.insurance_product_id)
        || (((booking.booking_extras as { insurance?: { total_cents?: number } } | null)?.insurance?.total_cents ?? 0) > 0)
        || productInsuranceIncluded || sibDan,
      // Kurs mit SSI-Versicherung im Preis — Gast hat nichts zu tun, kommt aber NICHT in den DAN-Export
      is_entry_course: isEntryCourse,
      // AGB/Storno schon bei der Buchung akzeptiert (Online-Checkout) → der Check-in fragt nicht nochmal
      terms_accepted: Boolean((booking as { terms_accepted_at?: string | null }).terms_accepted_at),
      insurance_ssi_included: productInsuranceIncluded && !sibDan && !booking.insurance_product_id
        && !((((booking.booking_extras as { insurance?: { total_cents?: number } } | null)?.insurance?.total_cents ?? 0) > 0)),
      insurance_choice: (booking.insurance_choice === 'azd' || booking.insurance_choice === 'own') ? booking.insurance_choice : sibDan ? 'azd' : sibChoice,
      booking: {
        product_name: booking.product_name,
        booking_date: booking.booking_date,
        session: booking.session,
        group_size: booking.group_size,
        source: booking.source,
      },
      slots: formattedSlots,
      // Weitere Buchungen derselben Zahlung (Split) — nur für den Buchungs-Token
      group_others: resolved.onlySlot === null ? await groupGuestsPublic(supabase, booking.id) : [],
      // Nur der Kaeufer darf einladen — ein Eingeladener nicht weiterreichen.
      can_delegate: resolved.onlySlot === null,
      only_slot: resolved.onlySlot,
      payer_email: resolved.onlySlot === null ? (booking.customer_email ?? null) : null,
      // Name des Zahlers (aus Stripe / Walk-in) — Vorbelegung für Slot 0, wenn der Gast neu ist
      payer_name: resolved.onlySlot === null ? (booking.customer_name ?? null) : null,
    })
  } catch (e) {
    console.error('[checkin GET validate]', e)
    return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 500 })
  }
}

// ─── POST /api/checkin ─────────────────────────────────────────────────────────

interface CheckinBody {
  token: string
  slot_index: number
  customer: {
    email: string
    first_name?: string
    last_name?: string
    name: string
    phone_prefix?: string
    phone_number?: string
    phone: string
    gender?: string
    dob: string
    nationality: string
    country_of_residence?: string
    experience_level: string
    cert_agency?: string | null
    cert_number?: string | null
    insurance_source?: InsuranceSource | null
    insurance_provider?: string | null
    insurance_policy_number?: string | null
    last_dive_date?: string | null
    logged_dives?: number | null
    emergency_contact_name: string
    emergency_contact_phone: string
    wetsuit_size?: string | null
    bcd_size?: string | null
    boot_size?: string | null
    guardian_name?: string | null
    guardian_relationship?: string | null
    guardian_consent_at?: string | null
  }
  medical: { flagged: boolean; reasons: string[]; acknowledged_at?: string | null }
  medical_answers?: Record<string, boolean> | null
  medical_form_version?: string | null
  waiver_signed: boolean
  /** Was der Gast in diesem Moment bestätigt hat (Version des angezeigten Wortlauts + Häkchen) — Server prüft und archiviert */
  consents?: { waiver_version?: string; waiver?: boolean; gdpr_art9?: boolean; diver_code?: boolean }
  /** Gast kauft die DAN-Tagesversicherung bei uns (Checkbox im Check-in) — Preis rechnet der Server, Zahlung vor Ort */
  buy_day_cover?: boolean
  /** Zustimmung zu den Stornobedingungen — pro Person, nicht pro Buchung. */
  policy_accepted?: boolean
  policy_version?: string | null
  signature_data_url: string | null
}

export async function POST(req: NextRequest) {
  let body: CheckinBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, slot_index, customer, medical, waiver_signed, signature_data_url } = body

  // eIDAS-Anforderung: IP-Adresse des Unterzeichners im Audit-Trail
  const clientIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || null

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
  }
  if (slot_index == null || !Number.isInteger(slot_index) || slot_index < 0) {
    return NextResponse.json({ success: false, error: 'Invalid slot' }, { status: 400 })
  }
  if (!customer || !waiver_signed) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
  }
  const consents = body.consents
  if (!consents || consents.waiver !== true || consents.gdpr_art9 !== true || consents.diver_code !== true) {
    return NextResponse.json({ success: false, error: 'The waiver, the health-data consent and the Responsible Diver Code must all be accepted (400)' }, { status: 400 })
  }
  if (consents.waiver_version !== WAIVER_VERSION) {
    // Seite war beim Absenden veraltet (Wortlaut inzwischen geändert) — Gast muss die aktuelle Fassung sehen und bestätigen
    return NextResponse.json({ success: false, error: 'The waiver was updated while this page was open. Please reload the page and confirm again (409)' }, { status: 409 })
  }
  if (!customer.email || !EMAIL_RE.test(customer.email)) {
    return NextResponse.json({ success: false, error: 'Valid email required' }, { status: 400 })
  }
  if (!customer.name?.trim()) {
    return NextResponse.json({ success: false, error: 'Name required' }, { status: 400 })
  }

  // Serverseitig aus den uebermittelten Antworten neu berechnen — dem Client nicht vertrauen.
  const flagged = body.medical_answers != null
    ? computeFlag(body.medical_answers)
    : Boolean(medical?.flagged)
  const reasons = Array.isArray(medical?.reasons) ? medical.reasons : []

  const supabase = getServiceClient()

  // ── 1. Token serverseitig neu prüfen ──
  // Token auflösen: Buchungs-Token (alle Slots) ODER Einzel-Token (genau ein Slot).
  // Eingeladene kommen mit invite_token; der Bucher mit checkin_token.
  let booking: { id: string; checkin_token_expires_at: string | null; group_size: number; status: string; is_test: boolean; customer_email: string | null; booking_date: string | null } | null = null
  let restrictedToSlot: number | null = null

  {
    const { data: byBookingToken } = await supabase
      .from('bookings')
      .select('id, checkin_token_expires_at, group_size, status, is_test, customer_email, booking_date, product_name')
      .eq('checkin_token', token)
      .maybeSingle()

    if (byBookingToken) {
      booking = byBookingToken
    } else {
      const { data: byInvite } = await supabase
        .from('booking_customers')
        .select('booking_id, slot_index')
        .eq('invite_token', token)
        .maybeSingle()

      if (!byInvite) {
        return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
      }

      restrictedToSlot = byInvite.slot_index as number

      if (slot_index !== restrictedToSlot) {
        return NextResponse.json({ success: false, error: 'Token does not permit this slot' }, { status: 403 })
      }

      const { data: b } = await supabase
        .from('bookings')
        .select('id, checkin_token_expires_at, group_size, status, is_test, customer_email, booking_date, product_name')
        .eq('id', byInvite.booking_id)
        .maybeSingle()

      if (!b) {
        return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
      }
      booking = b
    }
  }

  if (!booking) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
  }
  if (booking.status === 'cancelled' || booking.status === 'no_show') {
    return NextResponse.json({ success: false, error: 'Booking is no longer active' }, { status: 400 })
  }
  if (booking.checkin_token_expires_at && new Date(booking.checkin_token_expires_at) < new Date()) {
    return NextResponse.json({ success: false, error: 'Token expired' }, { status: 400 })
  }

  const { data: slotRow, error: slotError } = await supabase
    .from('booking_customers')
    .select('id, checkin_started_at, checkin_completed_at, insurance_source')
    .eq('booking_id', booking.id)
    .eq('slot_index', slot_index)
    .maybeSingle()

  if (slotError || !slotRow) {
    return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 400 })
  }
  if (slotRow.checkin_completed_at) {
    return NextResponse.json({ success: false, error: 'Slot already completed' }, { status: 409 })
  }

  // ── 2. Kunde anlegen oder ergänzen ──
  // is_test wird von der Buchung geerbt: ein Sandbox-Kauf darf niemals einen
  // echten Kundendatensatz anfassen, und umgekehrt.
  const email = normEmail(customer.email)
  const isTest = booking.is_test
  const certAgency = (customer.cert_agency ?? '').trim() || null
  const certNumber = (customer.cert_number ?? '').trim() || null
  // Serverseitig entscheiden, nicht dem Formular glauben: DAN gekauft → azd_day; Kurs mit SSI-Versicherung → ssi; sonst Formularwert
  const { data: prodIns } = await supabase.from('course_prices').select('insurance_included').eq('name', (booking as { product_name?: string | null }).product_name ?? '').maybeSingle()
  const { data: bIns } = await supabase.from('bookings').select('insurance_product_id, booking_extras').eq('id', booking.id).maybeSingle()
  const danBought = Boolean(bIns?.insurance_product_id) || (((bIns?.booking_extras as { insurance?: { total_cents?: number } } | null)?.insurance?.total_cents ?? 0) > 0)
  const insuranceSource: InsuranceSource = body.buy_day_cover === true || danBought
    ? 'azd_day'
    : prodIns?.insurance_included
      ? 'ssi'
      : customer.insurance_source === 'own' || customer.insurance_source === 'azd_day' ? customer.insurance_source : 'none'
  const insuranceProvider = (customer.insurance_provider ?? '').trim() || null
  const insurancePolicy = (customer.insurance_policy_number ?? '').trim() || null

  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id, name, first_name, last_name, phone, phone_prefix, phone_number, gender, nationality, country_of_residence, dob, experience_level, cert_agency, cert_number, insurance_provider, insurance_policy_number, logged_dives, last_dive_date, emergency_contact_name, emergency_contact_phone')
    .eq('email', email)
    .eq('is_test', isTest)
    .maybeSingle()

  // ── Fremde Kundendatensätze dürfen nicht übernommen werden ──
  //
  // Ohne diese Prüfung reicht ein gültiger Check-in-Link, um an fremde Daten zu
  // kommen: man trägt die E-Mail eines früheren Gastes ein, der Check-in hängt
  // dessen bestehenden Kundendatensatz an den eigenen Slot — und ab da gibt das
  // Prefill sein Profil heraus (Geburtsdatum, Telefon, Notfallkontakt) und der
  // Waiver wird auf seinen Namen geschrieben.
  //
  // Regel: ein bestehender Datensatz darf nur übernommen werden, wenn die
  // E-Mail die Zahler-Adresse dieser Buchung ist ODER der Datensatz noch an
  // keiner anderen Buchung hängt. Alles andere geht an den Empfang — dort steht
  // der Gast ohnehin persönlich vor einem und kann sich ausweisen.
  if (existingCustomer) {
    const isPayer = booking.customer_email
      ? normEmail(booking.customer_email) === email
      : false

    if (!isPayer) {
      const { data: otherLinks } = await supabase
        .from('booking_customers')
        .select('booking_id')
        .eq('customer_id', existingCustomer.id)
        .neq('booking_id', booking.id)
        .limit(1)

      if (otherLinks && otherLinks.length > 0) {
        return NextResponse.json({
          success: false,
          error_code: 'email_already_registered',
          error: 'Diese E-Mail-Adresse ist bereits bei uns registriert. Bitte melde dich kurz beim Team — wir schalten den Check-in für dich frei.',
        }, { status: 409 })
      }
    }
  }

  let customerId: string

  if (existingCustomer) {
    // Nur leere Felder auffüllen — bestehende Angaben nie überschreiben
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (!existingCustomer.name && customer.name) updates.name = customer.name
    if (!existingCustomer.first_name && customer.first_name) updates.first_name = customer.first_name
    if (!existingCustomer.last_name && customer.last_name) updates.last_name = customer.last_name
    if (!existingCustomer.phone && customer.phone) updates.phone = customer.phone
    if (!existingCustomer.phone_prefix && customer.phone_prefix) updates.phone_prefix = customer.phone_prefix
    if (!existingCustomer.phone_number && customer.phone_number) updates.phone_number = customer.phone_number
    if (!existingCustomer.gender && customer.gender) updates.gender = customer.gender
    if (!existingCustomer.nationality && customer.nationality) updates.nationality = customer.nationality
    if (!existingCustomer.country_of_residence && customer.country_of_residence) updates.country_of_residence = customer.country_of_residence
    if (!existingCustomer.dob && customer.dob) updates.dob = customer.dob
    if (!existingCustomer.experience_level && customer.experience_level) updates.experience_level = customer.experience_level
    if (!existingCustomer.cert_agency && certAgency) updates.cert_agency = certAgency
    if (!existingCustomer.cert_number && certNumber) updates.cert_number = certNumber
    if (!existingCustomer.insurance_provider && insuranceProvider) updates.insurance_provider = insuranceProvider
    if (!existingCustomer.insurance_policy_number && insurancePolicy) updates.insurance_policy_number = insurancePolicy
    // Tauchhistorie ist die Ausnahme von „nur leere Felder fuellen": sie
    // veraendert sich mit jedem Besuch, und der neuere Wert ist der richtige.
    if (customer.logged_dives != null) updates.logged_dives = customer.logged_dives
    if (customer.last_dive_date) updates.last_dive_date = customer.last_dive_date
    if (!existingCustomer.emergency_contact_name && customer.emergency_contact_name) updates.emergency_contact_name = customer.emergency_contact_name
    if (!existingCustomer.emergency_contact_phone && customer.emergency_contact_phone) updates.emergency_contact_phone = customer.emergency_contact_phone

    const { error: updateErr } = await supabase.from('customers').update(updates).eq('id', existingCustomer.id)
    if (updateErr) console.warn('[checkin POST] customer update warning:', updateErr)
    customerId = existingCustomer.id
  } else {
    const { data: newCustomer, error: insertErr } = await supabase
      .from('customers')
      .insert({
        email,
        name: customer.name,
        first_name: customer.first_name?.trim() || null,
        last_name: customer.last_name?.trim() || null,
        phone: customer.phone || null,
        phone_prefix: customer.phone_prefix?.trim() || null,
        phone_number: customer.phone_number?.trim() || null,
        gender: customer.gender || null,
        dob: customer.dob || null,
        nationality: customer.nationality || null,
        country_of_residence: customer.country_of_residence || null,
        experience_level: customer.experience_level || 'none',
        cert_agency: certAgency,
        cert_number: certNumber,
        insurance_provider: insuranceProvider,
        insurance_policy_number: insurancePolicy,
        logged_dives: customer.logged_dives ?? null,
        last_dive_date: customer.last_dive_date || null,
        emergency_contact_name: customer.emergency_contact_name || null,
        emergency_contact_phone: customer.emergency_contact_phone || null,
        is_test: isTest,
      })
      .select('id')
      .single()

    if (insertErr || !newCustomer) {
      console.error('[checkin POST] customer insert error:', insertErr)
      const ref = await reportError('chk', insertErr ?? new Error('customer insert returned no row'), {
        route: '/api/checkin', step: 'customer_insert', slot_index, booking_id: booking.id,
      })
      return NextResponse.json({ success: false, error: 'Failed to create customer record', ref }, { status: 500 })
    }
    customerId = newCustomer.id
  }

  // ── 3. Unterschrift ablegen (nicht blockierend) ──
  let signatureUrl: string | null = null
  let signatureSha: string | null = null
  if (signature_data_url) {
    try {
      const base64Data = signature_data_url.replace(/^data:image\/png;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      signatureSha = createHash('sha256').update(buffer).digest('hex')
      const path = `${customerId}/${booking.id}_${slot_index}.png`

      const { error: storageErr } = await supabase.storage
        .from('waivers')
        .upload(path, buffer, { contentType: 'image/png', upsert: true })

      if (storageErr) {
        console.warn('[checkin POST] signature storage warning (non-blocking):', storageErr)
        await reportError('chk', new Error(`signature upload failed: ${storageErr.message}`), { route: '/api/checkin', step: 'signature_upload', slot_index, booking_id: booking.id })
      } else {
        signatureUrl = path // Pfad im privaten Bucket; Anzeige über /api/dashboard/waiver-signature
      }
    } catch (e) {
      console.warn('[checkin POST] signature storage exception (non-blocking):', e)
      await reportError('chk', e instanceof Error ? e : new Error(String(e)), { route: '/api/checkin', step: 'signature_upload', slot_index, booking_id: booking.id })
    }
  }

  // ── 3b. Nachweis: Wortlaut + Häkchen + Zeit + IP unveränderlich archivieren (waiver_acceptances, nur anfügen) ──
  const snapshot = waiverSnapshot(Boolean(customer.guardian_consent_at))
  const canonical = JSON.stringify(snapshot) // exakt dieser String wird gehasht und mitgespeichert (jsonb behält die Schlüsselreihenfolge nicht)
  const { error: accErr } = await supabase.from('waiver_acceptances').insert({
    booking_customer_id: slotRow.id,
    customer_id: customerId,
    booking_id: booking.id,
    slot_index,
    waiver_version: WAIVER_VERSION,
    content_sha256: createHash('sha256').update(canonical).digest('hex'),
    content_canonical: canonical,
    content_snapshot: snapshot,
    accepted: { waiver: true, gdpr_art9: true, diver_code: true, guardian_consent_at: customer.guardian_consent_at ?? null, policy_accepted: Boolean(body.policy_accepted) },
    medical_form_version: body.medical_form_version ?? '2022-02-01',
    medical_answers: body.medical_answers ?? {},
    medical_flagged: flagged,
    policy_version: body.policy_accepted ? (body.policy_version ?? null) : null,
    signature_path: signatureUrl,
    signature_sha256: signatureSha,
    client_ip: clientIp,
    user_agent: req.headers.get('user-agent'),
    accept_language: req.headers.get('accept-language'),
    is_test: booking.is_test,
  })
  if (accErr) {
    const ref = await reportError('chk', accErr, { route: '/api/checkin', step: 'waiver_acceptance', slot_index, booking_id: booking.id })
    return NextResponse.json({ success: false, error: `Could not record your confirmation (500): ${accErr.message}`, ref }, { status: 500 })
  }

  // ── 4. Slot abschliessen ──
  // medical_flag_resolved ist NOT NULL — hier stand vorher null, wodurch JEDER
  // Check-in ohne medizinische Auffälligkeit mit 500 abbrach.
  const now = new Date().toISOString()
  // Zustimmung aus der Buchung (Online-Checkout) übernehmen, wenn der Check-in sie nicht erneut einholt
  const { data: termsRow } = await supabase.from('bookings').select('terms_accepted_at, terms_version').eq('id', booking.id).maybeSingle()
  const slotFields = {
      customer_id: customerId,
      // Name genau so, wie er im Check-in getippt wurde – das Kundenprofil kann bei geteilter E-Mail einer anderen Person gehören
      guest_name: (customer.name ?? '').trim() || null,
      checkin_started_at: slotRow.checkin_started_at ?? now,
      checkin_completed_at: now,
      is_minor: isMinorFromDob(customer.dob),
      medical_flag: flagged,
      medical_flag_reason: flagged ? reasons.join('\n') : null,
      medical_flag_resolved: false,
      // Ohne Zustimmung bleibt das Feld leer — dann steht in der Datenbank
      // ehrlich, dass diese Person nicht bestaetigt hat, statt eines Zeitstempels
      // ohne Deckung.
      medical_ack_at: flagged ? (medical?.acknowledged_at ?? now) : null,
      medical_answers: body.medical_answers ?? {},
      medical_form_version: body.medical_form_version ?? '2022-02-01',
      insurance_source: insuranceSource,
      // Ein Nachweis steht nur aus, wenn der Gast eine eigene Police behauptet.
      // Wer die Tagesversicherung bei uns gekauft hat, hat nichts vorzulegen.
      insurance_flag: insuranceFlagFor(insuranceSource),
      policy_accepted_at: body.policy_accepted ? now : (termsRow?.terms_accepted_at ?? null),
      policy_version: body.policy_accepted ? (body.policy_version ?? null) : (termsRow?.terms_version ?? null),
      wetsuit_size: customer.wetsuit_size || null,
      bcd_size: customer.bcd_size || null,
      boot_size: customer.boot_size || null,
      guardian_name: customer.guardian_name || null,
      guardian_relationship: customer.guardian_relationship || null,
      guardian_consent_at: customer.guardian_consent_at || null,
      client_ip_address: clientIp,
      updated_at: now,
  }
  const { error: slotUpdateErr } = await supabase.from('booking_customers').update(slotFields).eq('id', slotRow.id)

  if (slotUpdateErr) {
    console.error('[checkin POST] slot update error:', slotUpdateErr)
    const ref = await reportError('chk', slotUpdateErr, {
      route: '/api/checkin', step: 'slot_update', slot_index, booking_id: booking.id,
    })
    return NextResponse.json({ success: false, error: 'Failed to update slot', ref }, { status: 500 })
  }

  // ── 4b. DAN-Tagesversicherung im Check-in gekauft → Position an der Buchung + offene Zahlung (siehe lib/dayCover.ts) ──
  let dayCover: { cents: number; days: number } | null = null
  if (body.buy_day_cover === true && !(slotRow as { insurance_source?: string | null }).insurance_source?.startsWith('azd')) {
    try {
      dayCover = await addDayCoverToBooking(supabase, { bookingId: booking.id, slotIndex: slot_index, payment: 'pending' })
    } catch (e) {
      console.error('[checkin POST] day cover purchase failed:', e)
      await supabase.from('booking_changelog').insert({ booking_id: booking.id, action: 'insurance_failed', description: `⚠️ Guest ${slot_index + 1} wanted DAN day cover but it could not be added: ${e instanceof Error ? e.message : String(e)} — add it manually in Front Office` })
    }
  }

  // ── 5. Waiver + Medical am Kunden nachziehen ──
  const customerFinalUpdate: Record<string, unknown> = {
    waiver_signed_at: now,
    updated_at: now,
  }
  if (!flagged) customerFinalUpdate.medical_cleared_at = now
  if (signatureUrl) customerFinalUpdate.waiver_pdf_url = signatureUrl

  const { error: finalUpdateErr } = await supabase
    .from('customers')
    .update(customerFinalUpdate)
    .eq('id', customerId)

  if (finalUpdateErr) {
    console.warn('[checkin POST] customer final update warning:', finalUpdateErr)
  }

  // ── 5b. bookings.checkin_completed_at setzen wenn alle Slots done ──
  // booking_customers trägt den Slot-Status; bookings.checkin_completed_at
  // ist der FO-seitige Indikator — wird nur gesetzt wenn ALLE Slots fertig sind.
  try {
    const { data: allSlots } = await supabase
      .from('booking_customers')
      .select('checkin_completed_at')
      .eq('booking_id', booking.id)

    const allDone = allSlots && allSlots.length > 0 && allSlots.every((s: { checkin_completed_at: string | null }) => s.checkin_completed_at !== null)
    if (allDone) {
      await supabase
        .from('bookings')
        .update({ checkin_completed_at: now })
        .eq('id', booking.id)
      // Changelog
      await supabase.from('booking_changelog').insert({
        booking_id: booking.id,
        changed_by_email: null,
        action: 'checkin_completed',
        description: `Check-in completed by guest (all ${allSlots.length} slot(s) done)`,
      })
    }
  } catch (e) {
    console.error('[checkin POST] bookings.checkin_completed_at update failed:', e)
  }

  // ── 5c. Weitere Karten (Zusatzprodukte) DERSELBEN Person: der Check-in gilt mit — kein zweiter Check-in, keine zweite Versicherungsfrage ──
  try {
    const sibIds = await siblingCardIds(supabase, booking.id)
    for (const sid of sibIds) {
      const { data: sib } = await supabase.from('booking_customers').select('id, checkin_started_at, checkin_completed_at').eq('booking_id', sid).eq('slot_index', slot_index).maybeSingle()
      if (!sib || sib.checkin_completed_at) continue
      const { error: sibErr } = await supabase.from('booking_customers').update({ ...slotFields, checkin_started_at: sib.checkin_started_at ?? now }).eq('id', sib.id)
      if (sibErr) { console.error('[checkin POST] Zusatzkarte mitgecheckt fehlgeschlagen:', sibErr); continue }
      const { data: sibSlots } = await supabase.from('booking_customers').select('checkin_completed_at').eq('booking_id', sid)
      if (sibSlots && sibSlots.length > 0 && sibSlots.every((x: { checkin_completed_at: string | null }) => x.checkin_completed_at !== null)) {
        await supabase.from('bookings').update({ checkin_completed_at: now }).eq('id', sid)
      }
      await supabase.from('booking_changelog').insert({ booking_id: sid, action: 'checkin_completed', description: `Check-in completed together with the guest's other booking ${booking.id.slice(0, 8)} (same person)` })
    }
  } catch (e) {
    console.error('[checkin POST] Mit-Check-in der Zusatzkarten fehlgeschlagen:', e)
  }

  // ── 6. Aerztliche Freigabe anfordern ──
  // Bewusst nicht blockierend: scheitert der Versand, bleibt der Check-in
  // gueltig. Der Fehlschlag steht in system_logs, und das Flag auf dem Slot
  // sorgt dafuer, dass der Empfang die Freigabe ohnehin einfordert.
  if (flagged) {
    try {
      const sent = await sendMedicalClearanceRequired({
        to: email,
        customerName: customer.name,
        reasons,
        medical_answers: body.medical_answers ?? {},
        firstDiveDate: booking.booking_date ?? null,
        isTest,
        bookingId: booking.id,
      })
      if (sent.ok) {
        await supabase.from('booking_customers')
          .update({ medical_clearance_mail_at: new Date().toISOString() })
          .eq('id', slotRow.id)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[checkin POST] Mail zur aerztlichen Freigabe fehlgeschlagen:', msg)
      try {
        await supabase.from('system_logs').insert({
          action: 'email_failed',
          entity_type: 'email',
          entity_id: booking.id,
          source: 'azd',
          notes: msg,
          payload_after: { kind: 'medical_clearance_required', to: email },
        })
      } catch {}
    }
  }

  return NextResponse.json({ success: true, customer_id: customerId, medical_flag: flagged, ...(dayCover ? { day_cover: dayCover } : {}) })
}
