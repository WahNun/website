import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { DAN_1DAY_COST_CENTS } from '@/lib/dayCover'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function verifyAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user }, error } = await getServiceClient().auth.getUser(token)
  if (error || !user) return null
  // Audit AZD-007: Export enthält PII — nur Team-Rollen (Front Office macht den DAN-Upload mit, Lucas 24.10.)
  const { data: profile } = await getServiceClient().from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'front_office'].includes(profile?.role ?? '')) return null
  return user
}

// ─── Country → Language mapping ───────────────────────────────────────────────

const COUNTRY_LANG: Record<string, string> = {
  'portugal': 'pt_PT', 'germany': 'de_DE', 'united-kingdom': 'en_GB',
  'united-states': 'en_US', 'france': 'fr_FR', 'spain': 'es_ES',
  'italy': 'it_IT', 'netherlands': 'nl_NL', 'belgium': 'nl_BE',
  'switzerland': 'de_CH', 'austria': 'de_AT', 'denmark': 'da_DK',
  'sweden': 'sv_SE', 'norway': 'nb_NO', 'finland': 'fi_FI',
  'ireland': 'en_IE', 'poland': 'pl_PL', 'czech-republic': 'cs_CZ',
  'hungary': 'hu_HU', 'slovakia': 'sk_SK', 'slovenia': 'sl_SI',
  'croatia': 'hr_HR', 'greece': 'el_GR', 'romania': 'ro_RO',
  'bulgaria': 'bg_BG', 'luxembourg': 'fr_LU', 'iceland': 'is_IS',
  'israel': 'he_IL', 'brazil': 'pt_BR', 'argentina': 'es_AR',
  'mexico': 'es_MX', 'canada': 'en_CA', 'australia': 'en_AU',
  'new-zealand': 'en_NZ', 'south-africa': 'en_ZA', 'japan': 'ja_JP',
  'china': 'zh_CN', 'india': 'en_IN', 'russia': 'ru_RU', 'turkey': 'tr_TR',
  'egypt': 'ar_EG', 'morocco': 'fr_MA', 'angola': 'pt_AO',
  'mozambique': 'pt_MZ', 'cape-verde': 'pt_CV',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** YYYY-MM-DD → DD/MM/YYYY */
function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const DAN_HEADERS = [
  'Plan (name)',
  'Policy Start Date (dd/MM/yyy)',
  'First Name',
  'Last Name',
  'Gender (M or F)',
  'Date of birth (dd/MM/yyyy)',
  'Language code (es. it_IT)',
  'Country of residence (country name)',
  'Passport number',
  'Email',
  'Send also to',
  'Contact Prefix (es. +39)',
  'Contact Phone Number',
]

interface PendingRow {
  // identisch zu dan_export_rows()
  booking_customer_id: string
  session_date: string
  first_name: string
  last_name: string
  gender: string
  dob: string
  email: string
  country_of_residence: string
  phone_prefix: string
  phone_number: string
}

function buildXls(rows: PendingRow[]): Uint8Array {
  const data = [
    DAN_HEADERS,
    ...rows.map(r => [
      '1 Day Short Term',
      fmtDate(r.session_date),
      r.first_name,
      r.last_name,
      r.gender,
      fmtDate(r.dob),
      COUNTRY_LANG[r.country_of_residence] ?? 'en_GB',
      r.country_of_residence,
      '',                            // Passport — leer
      r.email,
      'azoresdiving@gmail.com',      // Send also to — immer
      r.phone_prefix,
      r.phone_number,
    ]),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  // Spaltenbreiten
  ws['!cols'] = DAN_HEADERS.map(() => ({ wch: 24 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Batch')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer)
}

// GET /api/admin/dan-export          → { pending_rows, session_dates, customers }
// GET /api/admin/dan-export?test=1   → same but test bookings
// GET /api/admin/dan-export?dl=1     → XLS download
// GET /api/admin/dan-export?dl=1&test=1 → XLS download (test mode)
export async function GET(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const isTest = searchParams.get('test') === '1'
  const isDownload = searchParams.get('dl') === '1'

  const supabase = getServiceClient()
  const { data: rows, error } = await supabase.rpc('dan_export_rows', { p_test: isTest })
  if (error) {
    console.error('[dan-export] RPC error:', error)
    return NextResponse.json({ error: 'Could not load DAN export data' }, { status: 500 })
  }

  const safeRows = (rows ?? []) as Array<{
    booking_customer_id: string
    session_date: string
    first_name: string
    last_name: string
    gender: string
    dob: string
    email: string
    country_of_residence: string
    phone_prefix: string
    phone_number: string
  }>

  // ── Plausibilität: Einkauf bei DAN (Zeilen × 4,13 €) darf nie über dem liegen, was dem Gast berechnet wurde ──
  // Vergleich pro Taucher: Export-Tage × 1-Tages-Einkauf vs. booking_extras.insurance.per_diver_cents (bzw. Kauf am Steg/Check-in).
  // Stimmt es nicht (z. B. Tage nachgetragen ohne Neuberechnung), bleibt der Taucher aus der Datei, bis die Buchung korrigiert ist.
  const bcIds = [...new Set(safeRows.map(r => r.booking_customer_id))]
  const { data: bcRows } = bcIds.length
    ? await supabase.from('booking_customers').select('id, booking_id, slot_index, guest_name, bookings!booking_customers_booking_id_is_test_fkey(id, customer_name, product_name, insurance_product_id, booking_extras)').in('id', bcIds)
    : { data: [] as unknown[] }
  type BcRow = { id: string; booking_id: string; slot_index: number; guest_name: string | null; bookings: { id: string; customer_name: string | null; product_name: string | null; insurance_product_id: string | null; booking_extras: { insurance?: { per_diver_cents?: number; total_cents?: number; guests?: number } | null } | null } | null }
  const byBc = new Map((bcRows as BcRow[] | null ?? []).map(r => [r.id, r]))
  // Berechneter Preis: booking_extras.insurance (Warenkorb) oder insurance_product_id. Kursschüler mit SSI-Versicherung haben
  // insurance_source = 'ssi' und kommen gar nicht erst aus dan_export_rows().
  const { data: priceRows } = await supabase.from('course_prices').select('id, price_cents')
  const priceById = new Map((priceRows ?? []).map((p: { id: string; price_cents: number }) => [p.id, p.price_cents]))
  const daysByBc = new Map<string, number>()
  for (const r of safeRows) daysByBc.set(r.booking_customer_id, (daysByBc.get(r.booking_customer_id) ?? 0) + 1)
  const blocked: { booking_customer_id: string; booking_id: string; name: string; days: number; cost_cents: number; charged_cents: number; reason: string }[] = []
  for (const [bcId, days] of daysByBc) {
    const bc = byBc.get(bcId)
    const b = bc?.bookings ?? null
    const ins = b?.booking_extras?.insurance ?? null
    const charged = (ins?.per_diver_cents ?? 0) || (b?.insurance_product_id ? (priceById.get(b.insurance_product_id) ?? 0) : 0)
    const cost = days * DAN_1DAY_COST_CENTS
    if (charged <= 0 || cost > charged) {
      blocked.push({
        booking_customer_id: bcId, booking_id: bc?.booking_id ?? '', name: bc?.guest_name || bc?.bookings?.customer_name || 'Guest', days, cost_cents: cost, charged_cents: charged,
        reason: charged <= 0 ? 'no insurance price on the booking — add DAN cover via the booking' : `DAN cost €${(cost / 100).toFixed(2)} for ${days} day(s) exceeds the €${(charged / 100).toFixed(2)} charged — recalculate insurance in the booking (Sessions tab)`,
      })
    }
  }
  const blockedIds = new Set(blocked.map(b => b.booking_customer_id))
  const okRows = safeRows.filter(r => !blockedIds.has(r.booking_customer_id))

  if (isDownload) {
    // DAN-Batch: exakt die 13 Spalten der DAN-Vorlage, echtes .xls (BIFF8) — .xlsx und Text lehnt das Portal ab.
    // Pakete = eine „1 Day Short Term“-Police pro Tauchtag (Entscheidung 16.09., siehe dan-versicherung-automatisierung.md).
    // DAN nimmt max. 50 Zeilen pro Datei — darüber in Tranchen, der Stempel gilt nur für die Zeilen der Datei.
    const MAX_ROWS = 50
    const fileRows = okRows.slice(0, MAX_ROWS)
    const xls = buildXls(fileRows)
    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = isTest ? `DAN_Batch_TEST_${dateStr}.xls` : `DAN_Batch_${dateStr}.xls`

    // Batch-Kennung + Zeilenliste gehen mit, damit „Mark as submitted“ genau DIESE Datei stempelt (nicht „alles Offene“)
    const batchId = crypto.randomUUID()
    const rowKeys = fileRows.map(r => `${r.booking_customer_id}|${r.session_date}`).join(',')
    return new NextResponse(Buffer.from(xls), {
      headers: {
        'X-Dan-Batch': batchId,
        'X-Dan-Rows': rowKeys,
        'X-Dan-Remaining': String(Math.max(0, okRows.length - fileRows.length)),
        'Access-Control-Expose-Headers': 'X-Dan-Batch, X-Dan-Rows, X-Dan-Remaining, Content-Disposition',
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // Stats response

  return NextResponse.json({
    pending_rows: okRows.length,
    session_dates: [...new Set(okRows.map(r => r.session_date))].sort(),
    customers: new Set(okRows.map(r => r.booking_customer_id)).size,
    blocked,
  })
}

// POST /api/admin/dan-export?mark=1  { batch_id, rows: ["<booking_customer_id>|<YYYY-MM-DD>", …], test? }  → { marked }
// Stempelt genau die Zeilen der heruntergeladenen Datei als an DAN gemeldet — pro (Taucher, Tauchtag).
export async function POST(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  if (searchParams.get('mark') !== '1') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  let body: { batch_id?: string; rows?: string[]; test?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const batchId = typeof body.batch_id === 'string' && /^[0-9a-f-]{36}$/.test(body.batch_id) ? body.batch_id : null
  const rows = Array.isArray(body.rows) ? body.rows.filter(r => typeof r === 'string' && /^[0-9a-f-]{36}\|\d{4}-\d{2}-\d{2}$/.test(r)) : []
  if (!batchId || rows.length === 0) {
    return NextResponse.json({ error: 'Download the file first — marking needs the batch id and the rows of that file' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const now = new Date().toISOString()
  const inserts = rows.map(r => { const [bc, d] = r.split('|'); return { booking_customer_id: bc, session_date: d, batch_id: batchId, submitted_at: now, submitted_by: user.email ?? null, is_test: body.test === true } })
  const { error: insErr } = await supabase.from('dan_submissions').upsert(inserts, { onConflict: 'booking_customer_id,session_date', ignoreDuplicates: true })
  if (insErr) {
    console.error('[dan-export] dan_submissions insert error:', insErr)
    return NextResponse.json({ error: `Could not mark rows: ${insErr.message}` }, { status: 500 })
  }
  // Gästeakte zeigt weiterhin „DAN submitted“ (erste Meldung)
  const ids = [...new Set(inserts.map(i => i.booking_customer_id))]
  await supabase.from('booking_customers').update({ dan_submitted_at: now }).in('id', ids).is('dan_submitted_at', null)

  return NextResponse.json({ marked: inserts.length, divers: ids.length, batch_id: batchId })
}
