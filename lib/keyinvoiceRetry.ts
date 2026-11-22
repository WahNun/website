/* eslint-disable @typescript-eslint/no-explicit-any */
import { getStripe, modeForSessionId } from '@/lib/stripe'
import { reportError } from '@/lib/errors'
import { createBookingInvoice } from '@/lib/keyinvoice'
import { buildKiLines, assertLinesMatchPayment } from '@/lib/keyinvoiceLines'
import { issueRefundDocument, logInvoiceMail } from '@/lib/keyinvoiceLedger'

export interface RetryDocRow {
  id: string
  kind: string | null
  stripe_session_id: string | null
  booking_id: string | null
  is_test: boolean
  payment_intent: string | null
  stripe_refund_id: string | null
  refund_id: string | null
  amount_cents: number | null
}

export interface RetryResult { id: string; success: boolean; full_doc_number?: string; error?: string }

export const RETRY_SELECT = 'id, kind, stripe_session_id, booking_id, is_test, payment_intent, stripe_refund_id, refund_id, amount_cents'

/**
 * Fehlgeschlagenen Beleg (Rechnung, Gutschrift, Annullierung) erneut versuchen.
 * Rechnungen werden aus den bezahlten Stripe-Positionen NEU aufgebaut (gleiche Logik und Summenprüfung wie der Webhook).
 */
export async function retryKeyinvoiceDocument(db: any, row: RetryDocRow): Promise<RetryResult> {
  const fail = async (message: string): Promise<RetryResult> => {
    await db.from('keyinvoice_documents').update({ error: message, updated_at: new Date().toISOString() }).eq('id', row.id)
    await reportError('pay', new Error(`KeyInvoice retry failed: ${message}`), { route: 'keyinvoiceRetry', doc_row: row.id, kind: row.kind })
    return { id: row.id, success: false, error: message }
  }

  if (row.is_test) return { id: row.id, success: false, error: 'Test row — never invoiced' }
  if (process.env.KEYINVOICE_ENABLED !== 'true') return { id: row.id, success: false, error: 'KEYINVOICE_ENABLED is not true' }

  try {
    // Gutschrift / Annullierung: über das Beleg-Verzeichnis (idempotent, gleiche Regeln wie beim ersten Versuch)
    if (row.kind === 'credit_note' || row.kind === 'void') {
      if (!row.booking_id || row.amount_cents == null) return await fail('Credit note row has no booking or amount — issue it manually in KeyInvoice')
      const { data: b } = await db.from('bookings').select('customer_name, customer_email').eq('id', row.booking_id).maybeSingle()
      const r = await issueRefundDocument(db, {
        bookingId: row.booking_id, paymentIntent: row.payment_intent, stripeRefundId: row.stripe_refund_id, refundId: row.refund_id,
        amountCents: row.amount_cents, isTest: false, fallbackCustomer: { name: b?.customer_name ?? '', email: b?.customer_email ?? '' },
      })
      if (r.status === 'failed') return { id: row.id, success: false, error: r.error }
      return { id: row.id, success: true, full_doc_number: r.docNumber }
    }

    if (!row.stripe_session_id) return await fail('Walk-in invoice — cannot be retried here. Create it again from the Front Office (Payments).')

    await db.from('keyinvoice_documents').update({ error: null, updated_at: new Date().toISOString() }).eq('id', row.id)
    const cs = await getStripe(modeForSessionId(row.stripe_session_id)).checkout.sessions.retrieve(row.stripe_session_id)
    const built = await buildKiLines(cs)
    assertLinesMatchPayment(built)

    const { data: bk } = await db.from('bookings').select('id, customer_nif, customer_name').eq('stripe_session_id', row.stripe_session_id).maybeSingle()
    const email = cs.customer_details?.email ?? cs.customer_email ?? ''
    const stripeNif = cs.customer_details?.tax_ids?.find(t => t.type === 'pt_nif' || t.type === 'eu_vat')?.value
    const nif = stripeNif ?? bk?.customer_nif ?? undefined
    // NIF aus der Buchung (Front Office) → auch der Buchungsname, damit Name und NIF zusammenpassen (wie im Webhook)
    const name = !stripeNif && nif && bk?.customer_name?.trim() ? bk.customer_name.trim() : (cs.customer_details?.name ?? 'Consumidor Final')
    const addr = cs.customer_details?.address
    const address = [addr?.line1, addr?.line2].filter(Boolean).join(', ') || undefined
    const postalCode = addr?.postal_code ?? undefined
    const locality = addr?.city ?? undefined
    const countryCode = addr?.country ?? 'PT'

    const result = await createBookingInvoice({
      stripeSessionId: row.stripe_session_id,
      customer: { name, email, nif, address, postalCode, locality, countryCode },
      lines: built.lines,
    })
    await db.from('keyinvoice_documents').update({
      doc_num: result.doc.DocNum, full_doc_number: result.doc.FullDocNumber,
      at_status: result.atStatus?.ATStatus ?? null, at_checked_at: result.atStatus ? new Date().toISOString() : null,
      pdf_sent_at: result.pdfSent ? new Date().toISOString() : null,
      payment_intent: typeof cs.payment_intent === 'string' ? cs.payment_intent : (cs.payment_intent?.id ?? null),
      amount_cents: cs.amount_total ?? null,
      customer: { name, email, nif, address, postalCode, locality, countryCode },
      error: null, updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    await logInvoiceMail(db, { bookingId: row.booking_id ?? bk?.id, kind: 'invoice', docNumber: result.doc.FullDocNumber, amountCents: cs.amount_total ?? null, email, pdfSent: result.pdfSent })
    return { id: row.id, success: true, full_doc_number: result.doc.FullDocNumber }
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e))
  }
}
