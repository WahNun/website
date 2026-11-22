import { recomputePaymentState } from '@/lib/paymentState'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, sanitizeKey } from '@/lib/stripe'
import { createBookingFromSession } from '@/lib/booking'
import { reportError } from '@/lib/errors'
import { confirmDraftByStripeSession, expireDraftByStripeSession } from '@/lib/draft-bookings'
import {
  createBookingInvoice,
  KI_DOCTYPE,
  KI_SERIES,
} from '@/lib/keyinvoice'
import { buildKiLines, assertLinesMatchPayment } from '@/lib/keyinvoiceLines'
import { issueRefundDocument, logInvoiceMail } from '@/lib/keyinvoiceLedger'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Stripe liefert Webhooks at-least-once und wiederholt sie bis zu drei Tage lang.
 * Die Idempotenz hängt am unique index auf bookings.stripe_session_id — ein
 * zweiter Zustellversuch läuft in den Conflict und tut nichts.
 *
 * is_test kommt aus event.livemode und nicht aus einer Einstellung: ein
 * Sandbox-Kauf kann so nicht versehentlich als Echtbuchung landen.
 */

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  const secret = sanitizeKey(process.env.STRIPE_WEBHOOK_SECRET).key
  const testSecret = sanitizeKey(process.env.STRIPE_TEST_WEBHOOK_SECRET).key

  if (!sig || (!secret && !testSecret)) {
    console.error('[stripe-webhook] Signatur oder STRIPE_WEBHOOK_SECRET fehlt')
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  const raw = await req.text()

  let event: Stripe.Event
  // Erst Live-, dann Test-Secret: Sandbox-Zahlungen laufen über denselben Endpoint (Test-Webhook, anderes Signing-Secret).
  // Das Event-Objekt selbst sagt danach über livemode, ob es Test ist.
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret || testSecret)
  } catch (e) {
    try {
      if (!testSecret || !secret) throw e
      event = getStripe().webhooks.constructEvent(raw, sig, testSecret)
    } catch (e2) {
      console.error('[stripe-webhook] Signaturprüfung fehlgeschlagen:', e2)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  }

  const supabase = getServiceClient()
  const isTest = !event.livemode

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session
        if (cs.payment_status !== 'paid') break
        await createBookingFromSession(supabase, cs, isTest)
        // W-5: Draft bestätigen — kein Ablauf mehr nötig
        await confirmDraftByStripeSession(cs.id).catch(err => {
          console.warn('[stripe-webhook] draft confirm fehlgeschlagen (best-effort):', cs.id, err)
        })
        // Keyinvoice: nicht-blockierend — Fehler werden protokolliert, geben
        // aber kein 500 zurück (Stripe-Zahlungsfluss läuft unabhängig davon).
        await triggerKeyinvoice(supabase, cs, isTest).catch(err => {
          console.error('[stripe-webhook] Keyinvoice fehlgeschlagen:', cs.id, err)
        })
        break
      }

      case 'checkout.session.async_payment_succeeded': {
        const cs = event.data.object as Stripe.Checkout.Session
        if (cs.payment_status !== 'paid') break // Audit AZD-018: defensiv, gleicher Guard wie completed
        await createBookingFromSession(supabase, cs, isTest)
        await confirmDraftByStripeSession(cs.id).catch(err => {
          console.warn('[stripe-webhook] draft confirm fehlgeschlagen (async, best-effort):', cs.id, err)
        })
        await triggerKeyinvoice(supabase, cs, isTest).catch(err => {
          console.error('[stripe-webhook] Keyinvoice fehlgeschlagen (async):', cs.id, err)
        })
        break
      }

      case 'checkout.session.expired': {
        const cs = event.data.object as Stripe.Checkout.Session
        // W-5: Hold freigeben — Plätze fallen automatisch frei
        await expireDraftByStripeSession(cs.id).catch(err => {
          console.warn('[stripe-webhook] draft expire fehlgeschlagen (best-effort):', cs.id, err)
        })
        // Request-Zahlungslink abgelaufen (Lucas 28.10.): nur loggen + Platzhalter-Zahlung schließen. Kein Statuswechsel,
        // kein Auto-Neulink — der Gast holt sich über /request/<token> selbst einen neuen, Staff über „Resend".
        if (cs.metadata?.fo_booking_id && cs.metadata?.source === 'booking_request') {
          const bookingId = cs.metadata.fo_booking_id
          await supabase.from('booking_payments').update({ status: 'cancelled', notes: `Payment link expired (${cs.id})` })
            .eq('status', 'pending').eq('stripe_payment_intent_id', cs.id).then(({ error }: { error: { message: string } | null }) => {
              if (error) console.warn('[stripe-webhook] request pending row close failed:', error.message)
            })
          await supabase.from('booking_changelog').insert({ booking_id: bookingId, action: 'request_link_expired', description: `⏰ Payment session expired (${cs.id}) — guest can confirm again on their request page` })
        }
        break
      }

      case 'charge.refunded': {
        // Feuert bei JEDEM Refund (auch partial). amount_refunded ist kumulativ.
        // Geld + Gast-Mail laufen über Finances (/api/refund-paid). Hier nur: Stripe-Stand reconcilen,
        // Refunds aus dem Stripe-Dashboard als paid-Zeile nachtragen, Keyinvoice-Gutschrift über Delta. KEINE Mail.
        const charge = event.data.object as Stripe.Charge
        const pi = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id
        if (!pi) break

        const refundedTotal = charge.amount_refunded ?? 0
        const isFull = refundedTotal >= (charge.amount ?? 0)
        const now = new Date().toISOString()

        const { data: rows } = await supabase
          .from('bookings')
          .select('id, parent_booking_id, status, amount, stripe_refunded_cents, refunded_amount_cents, customer_email, customer_name, is_test')
          .eq('stripe_payment_intent', pi)
        if (!rows?.length) break

        // Eine Zahlung kann mehrere Buchungen tragen (Split: Eltern + Kinder). amount_refunded gilt für die ganze Zahlung,
        // NICHT für eine einzelne Buchung — der Stand wird zahlungsweit gespiegelt, die Zuordnung läuft pro Stripe-Refund.
        const prev: number = Math.max(0, ...rows.map(r => r.stripe_refunded_cents ?? 0))
        const delta = refundedTotal - prev // neue Refunds seit dem letzten Event; Retry ⇒ 0 ⇒ nichts
        // Stand erst NACH der Verarbeitung festschreiben (und nie senken): scheitert unten etwas und Stripe liefert erneut,
        // ist das Delta noch da; Belege sind pro Stripe-Refund idempotent (keyinvoice_documents.stripe_refund_id).
        if (delta <= 0) break

        // Neue Refunds ermitteln (jüngste zuerst, bis das Delta aufgebraucht ist) — metadata.booking_id sagt, wem sie gehören
        const { data: list } = await getStripe(event.livemode ? 'live' : 'test').refunds.list({ charge: charge.id, limit: 20 })
        const fresh: Stripe.Refund[] = []
        let left = delta
        for (const r of [...list].sort((x, y) => y.created - x.created)) {
          if (left <= 0) break
          if (r.status === 'failed' || r.status === 'canceled') continue
          fresh.push(r); left -= r.amount
        }

        for (const r of fresh) {
          const finRefundId = r.metadata?.refund_id || null     // booking_refunds.id, gesetzt von /api/refund-paid
          const metaBookingId = r.metadata?.booking_id || null
          // Ziel-Buchung: laut Refund-Metadata, sonst die Eltern-Buchung der Zahlung
          const b = rows.find(x => x.id === metaBookingId) ?? rows.find(x => !x.parent_booking_id) ?? rows[0]

          // Gehört der Refund zu einem in Finances freigegebenen Antrag? (Refund-ID oder Antrags-ID aus der Metadata)
          let matched = false
          if (finRefundId) {
            const { data: m } = await supabase.from('booking_refunds').select('id').eq('id', finRefundId).maybeSingle()
            matched = Boolean(m)
          }
          if (!matched) {
            const { data: m } = await supabase.from('booking_refunds').select('id').eq('stripe_refund_id', r.id).maybeSingle()
            matched = Boolean(m)
          }

          if (!matched) {
            // Direkt im Stripe-Dashboard ausgelöst → als bezahlte Zeile nachtragen, damit Buch und Stripe übereinstimmen
            const { error: insErr } = await supabase.from('booking_refunds').insert({
              booking_id: b.id, amount: r.amount, currency: r.currency ?? 'eur', method: 'stripe', status: 'paid', stripe_refund_id: r.id,
              description: 'Issued directly in Stripe dashboard (not via Finances)', paid_at: now, is_test: isTest,
            })
            // 23505 = ein paralleles Event hat diesen Refund schon gebucht (unique index auf stripe_refund_id) → nicht doppelt zählen
            if (insErr && insErr.code !== '23505') throw new Error(`booking_refunds insert failed: ${insErr.message}`)
            if (!insErr) {
              const committed = (b.refunded_amount_cents ?? 0) + r.amount
              await supabase.from('bookings').update({
                refunded_amount_cents: committed, refunded_at: now, updated_at: now,
              }).eq('id', b.id)
              b.refunded_amount_cents = committed
            }
          }
          // Refund ändert nur den Zahlungsstatus — Buchung/Sessions bleiben, bis jemand storniert
          await recomputePaymentState(supabase, b.id)

          await supabase.from('booking_changelog').insert({
            booking_id: b.id, action: 'refund',
            description: `↩️ Stripe confirmed refund ${(r.amount / 100).toFixed(2)} EUR (${isFull ? 'full' : 'partial'}, Stripe total of the payment ${(refundedTotal / 100).toFixed(2)} EUR)${matched ? '' : ' — issued outside Finances (Stripe dashboard?)'}`,
          })

          if (!isTest && process.env.KEYINVOICE_ENABLED === 'true') {
            const doc = await issueRefundDocument(supabase, {
              bookingId: b.id, paymentIntent: pi, stripeRefundId: r.id, refundId: finRefundId, amountCents: r.amount, isTest,
              fallbackCustomer: { name: b.customer_name ?? '', email: b.customer_email ?? '' },
              description: 'Refund', fullRefundHint: r.amount >= (charge.amount ?? 0),
            })
            if (doc.status === 'done') {
              await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'invoice_refund_doc', description: `🧾 KeyInvoice: ${doc.kind === 'void' ? 'invoice voided' : 'credit note issued'} ${doc.docNumber ?? ''} (${(r.amount / 100).toFixed(2)} EUR)` })
            } else if (doc.status === 'failed') {
              await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'invoice_refund_doc_failed', description: `⚠️ KeyInvoice credit note FAILED for ${(r.amount / 100).toFixed(2)} EUR: ${doc.error} — issue it manually` })
            }
          }
        }
        await supabase.from('bookings').update({ stripe_refunded_cents: Math.max(prev, refundedTotal), updated_at: now }).in('id', rows.map(r => r.id))
        break
      }

      default:
        break
    }
  } catch (e) {
    console.error('[stripe-webhook] Verarbeitung fehlgeschlagen:', event.type, e)
    await reportError('pay', e, { route: '/api/stripe-webhook', event_type: event.type, is_test: isTest })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ─── Keyinvoice Integration ───────────────────────────────────────────────────

/**
 * Erstellt eine Keyinvoice Fatura-Recibo für eine bezahlte Stripe-Session.
 *
 * Ablauf:
 *   1. Idempotenz-Check: existiert bereits ein Eintrag mit full_doc_number → überspringen
 *   2. Row in keyinvoice_documents anlegen (Fehler = Duplikat → überspringen)
 *   3. Stripe-Line-Items holen, auf course_prices.keyinvoice_product_id mappen
 *   4. createBookingInvoice aufrufen
 *   5. keyinvoice_documents mit Ergebnis aktualisieren
 *
 * Alle Keyinvoice-Fehler werden in keyinvoice_documents.error protokolliert —
 * die Funktion selbst wirft nie, der Caller loggt sie und gibt trotzdem 200 zurück.
 */
async function triggerKeyinvoice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cs: Stripe.Checkout.Session,
  isTest: boolean,
): Promise<void> {
  // Keyinvoice hat keinen Sandbox-Modus — jeder Call erzeugt eine echte AT-gemeldete Rechnung.
  // Doppelte Absicherung:
  //   1. Stripe-Testmode-Zahlungen (isTest=true) werden NIEMALS weitergeleitet.
  //   2. Auch für Live-Payments gilt: erst wenn KEYINVOICE_ENABLED=true gesetzt ist,
  //      wird fakturiert. So kann der Live-Checkout getestet werden, ohne echte Rechnungen
  //      zu erzeugen. Einschalten: in Vercel KEYINVOICE_ENABLED=true setzen + redeploy.
  if (isTest) {
    console.log('[keyinvoice] Stripe-Testmode — Keyinvoice übersprungen:', cs.id)
    return
  }
  if (process.env.KEYINVOICE_ENABLED !== 'true') {
    console.log('[keyinvoice] KEYINVOICE_ENABLED nicht gesetzt — übersprungen:', cs.id)
    return
  }

  const stripeSessionId = cs.id

  // 1. Idempotenz: bereits erfolgreich fakturiert?
  const { data: existing } = await supabase
    .from('keyinvoice_documents')
    .select('id, full_doc_number')
    .eq('stripe_session_id', stripeSessionId)
    .maybeSingle()

  if (existing?.full_doc_number) {
    console.log('[keyinvoice] Bereits fakturiert:', stripeSessionId, existing.full_doc_number)
    return
  }

  // 2. Booking-ID ermitteln
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_nif, customer_name')
    .eq('stripe_session_id', stripeSessionId)
    .maybeSingle()

  const bookingId: string | null = booking?.id ?? null
  const bookingNif: string | undefined = booking?.customer_nif ?? undefined
  const bookingName: string | undefined = booking?.customer_name?.trim() || undefined

  // 3. Row anlegen (unique constraint auf stripe_session_id verhindert Doppel)
  const { data: docRow, error: insertErr } = await supabase
    .from('keyinvoice_documents')
    .upsert(
      {
        stripe_session_id: stripeSessionId,
        booking_id: bookingId,
        doc_type: KI_DOCTYPE.FATURA_RECIBO,
        doc_series: KI_SERIES.FATURA_RECIBO,
        is_test: isTest,
        kind: 'invoice',
        payment_intent: typeof cs.payment_intent === 'string' ? cs.payment_intent : (cs.payment_intent?.id ?? null),
        amount_cents: cs.amount_total ?? null,
      },
      { onConflict: 'stripe_session_id', ignoreDuplicates: false },
    )
    .select('id')
    .single()

  if (insertErr) {
    console.error('[keyinvoice] keyinvoice_documents insert fehlgeschlagen:', insertErr)
    return
  }

  const docRowId: string = docRow.id

  try {
    // 4. Lines aufbauen
    //    W-8: Wenn draft_id vorhanden, baut createBookingInvoice die Lines intern
    //    aus draft_items. buildKiLines dient als Fallback (kein Draft vorhanden).
    // 25.10.: Immer aus den bezahlten Stripe-Positionen bauen. Der Chatbot legt keine draft_items an, der
    // Draft-Pfad lieferte deshalb nie Zeilen ('Keine fakturierbaren Positionen'); außerdem wären Draft-Preise
    // Client-Daten statt dem tatsächlich bezahlten Betrag. draft_id wird bewusst nicht mehr an die Rechnung gereicht.
    const built = await buildKiLines(cs)
    assertLinesMatchPayment(built) // Summe = bezahlter Betrag, nichts übersprungen — sonst KEINE Rechnung (Fehler sichtbar)
    const lines = built.lines

    // 5. Kundendaten aus Checkout-Session
    const email = cs.customer_details?.email ?? cs.customer_email ?? ''
    const stripeName = cs.customer_details?.name ?? 'Consumidor Final'

    // NIF aus tax_id_collection (pt_nif), falls aktiviert
    // Fallback: vom Front Office erfasste Steuernummer (Deposit-/Payment-Link-Buchungen)
    const nif = cs.customer_details?.tax_ids
      ?.find(t => t.type === 'pt_nif' || t.type === 'eu_vat')
      ?.value ?? bookingNif
    // Die NIF gehört zum Buchungskunden (Front Office), der Stripe-Name zum Karteninhaber — kommt die NIF aus der Buchung, steht
    // auch der Buchungsname auf der Rechnung, damit Name und NIF zusammenpassen.
    const stripeHasNif = !!cs.customer_details?.tax_ids?.some(t => t.type === 'pt_nif' || t.type === 'eu_vat')
    const name = !stripeHasNif && bookingNif && bookingName ? bookingName : stripeName

    // Adresse aus Stripe Billing Details (optional)
    const addr = cs.customer_details?.address
    const address     = [addr?.line1, addr?.line2].filter(Boolean).join(', ') || undefined
    const postalCode  = addr?.postal_code ?? undefined
    const locality    = addr?.city ?? undefined
    const countryCode = addr?.country ?? 'PT'

    // 6. Invoice erstellen
    const result = await createBookingInvoice({
      stripeSessionId,
      customer: { name, email, nif, address, postalCode, locality, countryCode },
      lines,
    })

    // 7. Erfolg in keyinvoice_documents schreiben
    await supabase
      .from('keyinvoice_documents')
      .update({
        doc_num:        result.doc.DocNum,
        full_doc_number: result.doc.FullDocNumber,
        at_status:      result.atStatus?.ATStatus ?? null,
        at_checked_at:  result.atStatus ? new Date().toISOString() : null,
        pdf_sent_at:    result.pdfSent  ? new Date().toISOString() : null,
        customer:       { name, email, nif, address, postalCode, locality, countryCode },
        error:          null,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', docRowId)

    await logInvoiceMail(supabase, { bookingId, kind: 'invoice', docNumber: result.doc.FullDocNumber, amountCents: cs.amount_total ?? null, email, pdfSent: result.pdfSent })

    console.log(
      `[keyinvoice] Rechnung erstellt: ${result.doc.FullDocNumber} ` +
      `AT=${result.atStatus?.ATStatus ?? 'n/a'} PDF=${result.pdfSent}`,
    )
  } catch (err) {
    // Fehler protokollieren — Stripe bekommt trotzdem 200
    const message = err instanceof Error ? err.message : String(err)
    console.error('[keyinvoice] Invoice-Erstellung fehlgeschlagen:', stripeSessionId, message)

    await supabase
      .from('keyinvoice_documents')
      .update({
        error:      message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docRowId)
    // Sichtbar machen (Members → Errors): die Zahlung ist durch, die Rechnung fehlt
    await reportError('pay', err instanceof Error ? err : new Error(message), { route: '/api/stripe-webhook', step: 'keyinvoice_invoice', stripe_session_id: stripeSessionId, booking_id: bookingId })
  }
}
