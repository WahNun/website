import { auditStaff } from '@/lib/auditServer'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staffAuth'
import { logInvoiceMail } from '@/lib/keyinvoiceLedger'
import { reportError } from '@/lib/errors'
import { createClient } from '@supabase/supabase-js'
import {
  createBookingInvoice,
  pricesIncludeVAT,
  KI_DOCTYPE,
  KI_SERIES,
  type KiDocLine,
} from '@/lib/keyinvoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/walkin-invoice
 *
 * Keyinvoice-Trigger für Walk-in-Buchungen (Zahlung an der Theke).
 * Wird aufgerufen nachdem die Buchung in Supabase angelegt wurde —
 * NICHT über den Stripe-Webhook, der nur bei Online-Zahlungen feuert.
 *
 * Feature-Flag: WALKIN_KEYINVOICE_ENABLED=true muss in Vercel gesetzt sein.
 *
 * Zahlungsmethoden die fakturiert werden: bank, revolut (Karte/MB Way laufen über Stripe + Webhook)
 * Cash: vorerst NICHT. Scharfschalten: WALKIN_KEYINVOICE_CASH=true setzen.
 *
 * Entscheidung 2026-10-10: Keyinvoice für alle Walk-in-Zahlungsarten vorbereitet,
 * Cash vorerst ausgenommen. Scharfschalten über Feature-Flags in Vercel.
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const CASH_METHODS = new Set(['cash'])

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth

  if (process.env.WALKIN_KEYINVOICE_ENABLED !== 'true') {
    console.log('[walkin-invoice] WALKIN_KEYINVOICE_ENABLED nicht gesetzt — übersprungen')
    return NextResponse.json({ skipped: true, reason: 'feature_flag_off' })
  }

  let body: { booking_id: string; payment_method: string; product_id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { booking_id, payment_method, product_id } = body
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  // Cash vorerst ausgenommen (bis WALKIN_KEYINVOICE_CASH=true)
  if (CASH_METHODS.has(payment_method?.toLowerCase() ?? '')) {
    const cashEnabled = process.env.WALKIN_KEYINVOICE_CASH === 'true'
    if (!cashEnabled) {
      console.log('[walkin-invoice] Cash — übersprungen (WALKIN_KEYINVOICE_CASH nicht gesetzt):', booking_id)
      return NextResponse.json({ skipped: true, reason: 'cash_excluded' })
    }
  }

  const supabase = getServiceClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, is_test, customer_email, customer_name, customer_nif, amount, product_name')
    .eq('id', booking_id)
    .maybeSingle()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.is_test) {
    console.log('[walkin-invoice] Test-Buchung — übersprungen:', booking_id)
    return NextResponse.json({ skipped: true, reason: 'test_booking' })
  }

  // Idempotenz
  // (Mehrere Zeilen pro Buchung sind möglich: fehlgeschlagene Versuche, Gutschriften — daher kein maybeSingle auf booking_id.)
  const { data: prior } = await supabase
    .from('keyinvoice_documents')
    .select('id, full_doc_number, error, updated_at')
    .eq('booking_id', booking_id)
    .eq('kind', 'invoice')
    .order('created_at', { ascending: false })
  const issued = (prior ?? []).find(r => r.full_doc_number) // auch eine Rechnung aus dem Stripe-Webhook zählt
  if (issued) {
    return NextResponse.json({ skipped: true, reason: 'already_invoiced', doc: issued.full_doc_number })
  }
  // Doppelklick: ein Versuch läuft noch (weder Nummer noch Fehler, jünger als 2 Minuten)
  const running = (prior ?? []).find(r => !r.error && Date.now() - new Date(r.updated_at).getTime() < 120_000)
  if (running) {
    return NextResponse.json({ skipped: true, reason: 'in_progress' })
  }

  // keyinvoice_product_id ermitteln
  let kiProductId: string | null = null
  let priceCents: number | null = null

  if (product_id) {
    const { data: cp } = await supabase
      .from('course_prices')
      .select('keyinvoice_product_id, price_cents')
      .eq('id', product_id)
      .maybeSingle()
    kiProductId = cp?.keyinvoice_product_id ?? null
    priceCents = cp?.price_cents ?? null
  }

  if (!kiProductId) {
    const { data: cp } = await supabase
      .from('course_prices')
      .select('keyinvoice_product_id, price_cents')
      .ilike('name', `%${booking.product_name}%`)
      .not('keyinvoice_product_id', 'is', null)
      .limit(1)
      .maybeSingle()
    kiProductId = cp?.keyinvoice_product_id ?? null
    priceCents = cp?.price_cents ?? null
  }

  if (!kiProductId) {
    console.warn('[walkin-invoice] Kein keyinvoice_product_id für:', booking.product_name)
    return NextResponse.json({ error: 'No keyinvoice_product_id for product' }, { status: 422 })
  }

  const { data: docRow, error: insertErr } = await supabase
    .from('keyinvoice_documents')
    .insert({
      booking_id: booking.id,
      stripe_session_id: null,
      kind: 'invoice',
      amount_cents: booking.amount ?? null,
      doc_type: KI_DOCTYPE.FATURA_RECIBO,
      doc_series: KI_SERIES.FATURA_RECIBO,
      is_test: false,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[walkin-invoice] DB insert fehlgeschlagen:', insertErr)
    return NextResponse.json({ error: `DB insert failed: ${insertErr.message}` }, { status: 500 })
  }

  const docRowId: string = docRow.id

  try {
    const withVAT = await pricesIncludeVAT()
    const VAT_RATE = 0.16
    const amountCents = booking.amount ?? priceCents ?? 0
    const unitBrutto = amountCents / 100
    const unitPrice = withVAT
      ? unitBrutto
      : parseFloat((unitBrutto / (1 + VAT_RATE)).toFixed(6))

    const lines: KiDocLine[] = [{ IdProduct: kiProductId, Qty: 1, Price: unitPrice }]

    const result = await createBookingInvoice({
      stripeSessionId: `walkin_${booking.id}`,
      customer: {
        name: booking.customer_name ?? 'Consumidor Final',
        email: booking.customer_email ?? '',
        nif: booking.customer_nif ?? undefined, // vom FO erfasst → namentliche Rechnung; leer = Consumidor Final
        countryCode: booking.customer_nif && /^[A-Z]{2}/.test(booking.customer_nif) ? booking.customer_nif.slice(0, 2) : 'PT',
      },
      lines,
    })

    await supabase
      .from('keyinvoice_documents')
      .update({
        customer: {
          name: booking.customer_name ?? 'Consumidor Final', email: booking.customer_email ?? '', nif: booking.customer_nif ?? undefined,
          countryCode: booking.customer_nif && /^[A-Z]{2}/.test(booking.customer_nif) ? booking.customer_nif.slice(0, 2) : 'PT',
        },
        doc_num: result.doc.DocNum,
        full_doc_number: result.doc.FullDocNumber,
        at_status: result.atStatus?.ATStatus ?? null,
        at_checked_at: result.atStatus ? new Date().toISOString() : null,
        pdf_sent_at: result.pdfSent ? new Date().toISOString() : null,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docRowId)

    await logInvoiceMail(supabase, { bookingId: booking.id, kind: 'invoice', docNumber: result.doc.FullDocNumber, amountCents, email: booking.customer_email ?? '', pdfSent: result.pdfSent })
    console.log(`[walkin-invoice] Rechnung erstellt: ${result.doc.FullDocNumber}`)
    await auditStaff(supabase, auth.user, 'invoice_created', 'booking', booking_id, `Invoice created in KeyInvoice: ${result.doc.FullDocNumber}`, { doc: result.doc.FullDocNumber })
    return NextResponse.json({ ok: true, doc: result.doc.FullDocNumber })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[walkin-invoice] Invoice-Erstellung fehlgeschlagen:', booking_id, message)
    await supabase
      .from('keyinvoice_documents')
      .update({ error: message, updated_at: new Date().toISOString() })
      .eq('id', docRowId)
    await auditStaff(supabase, auth.user, 'invoice_failed', 'booking', booking_id, `Invoice creation FAILED: ${message}`, { error: message })
    await reportError('pay', err instanceof Error ? err : new Error(message), { route: '/api/walkin-invoice', booking_id })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
