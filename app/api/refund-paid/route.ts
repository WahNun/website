import { recomputePaymentState } from '@/lib/paymentState'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { sendRefundEmail } from '@/lib/email'
import { getStripe, assertStripeMode } from '@/lib/stripe'
import { REFUND_METHODS } from '@/lib/refunds'
import { auditStaff, auditEur } from '@/lib/auditServer'
import { issueRefundDocument } from '@/lib/keyinvoiceLedger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/refund-paid  (staff only) — Finances → Refunds → „Authorize Refund".
 * Body: { refund_id, notes? }
 * Die EINZIGE Stelle, an der Refund-Geld fließt und der Gast gemailt wird:
 *   stripe → stripe.refunds.create(amount der Zeile), dann Zeile paid + Mail. Status/Gutschrift reconciled der Webhook.
 *   cash/bank/revolut/mb_way/other → Finance hat ausgezahlt: Zeile paid + Mail.
 * Antwort enthält Mail-Ergebnis bzw. Fehlertext.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  const user = auth.user

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  let body: { refund_id?: string; notes?: string | null; override_method?: string | null; override_reason?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.refund_id) return NextResponse.json({ ok: false, error: 'refund_id required' }, { status: 400 })

  const { data: rRow } = await supabase.from('booking_refunds').select('*').eq('id', body.refund_id).maybeSingle()
  if (!rRow) return NextResponse.json({ ok: false, error: 'Refund request not found' }, { status: 404 })
  if (rRow.status !== 'requested') return NextResponse.json({ ok: false, error: `Refund is already ${rRow.status}` }, { status: 409 })

  // Override der Auszahlungsart (z. B. Karten-Buchung per Revolut/Bank zurueck): nur die freigebende Person (Admin), nur mit Begruendung.
  const overrideMethod = body.override_method ? String(body.override_method).toLowerCase() : null
  const overrideReason = (body.override_reason ?? '').trim()
  if (overrideMethod && overrideMethod !== rRow.method) {
    if (auth.role !== 'admin') return NextResponse.json({ ok: false, error: `Forbidden — only an admin can change the payout method (your role: ${auth.role || 'none'})` }, { status: 403 })
    if (!(REFUND_METHODS as readonly string[]).includes(overrideMethod)) return NextResponse.json({ ok: false, error: `Unknown payout method "${overrideMethod}"` }, { status: 400 })
    if (overrideReason.length < 10) return NextResponse.json({ ok: false, error: 'Override needs a reason (at least 10 characters) — why not refund the original way?' }, { status: 400 })
  }
  const r = overrideMethod && overrideMethod !== rRow.method ? { ...rRow, method: overrideMethod } : rRow
  const overridden = r.method !== rRow.method
  // Wer darf freigeben (Entscheidung 30.10.): Bargeld auch das Front Office, alles andere (Stripe, Bank, Revolut, MB WAY) nur Admin.
  if (r.method === 'cash' ? !['admin', 'front_office'].includes(auth.role) : auth.role !== 'admin') {
    return NextResponse.json({ ok: false, error: r.method === 'cash' ? `Forbidden — your role (${auth.role || 'none'}) may not hand out cash refunds` : `Forbidden — only an admin can authorize ${r.method} refunds (your role: ${auth.role || 'none'})` }, { status: 403 })
  }

  const { data: b } = await supabase.from('bookings')
    .select('id, amount, customer_email, customer_name, product_name, is_test, stripe_payment_intent')
    .eq('id', r.booking_id).maybeSingle()
  if (!b) return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })

  // ── Stripe: Geld JETZT anstoßen ──
  let stripeRefundId: string | null = null
  if (r.method === 'stripe') {
    if (!b.stripe_payment_intent) return NextResponse.json({ ok: false, error: 'Refund method is Stripe but booking has no Stripe payment' }, { status: 409 })
    try { assertStripeMode(b.is_test ? 'test' : 'live') } catch { return NextResponse.json({ ok: false, error: 'Stripe is not configured for this mode' }, { status: 503 }) }
    try {
      const refund = await getStripe(b.is_test ? 'test' : 'live').refunds.create({
        payment_intent: b.stripe_payment_intent,
        amount: r.amount,
        reason: 'requested_by_customer',
        metadata: { booking_id: b.id, refund_id: r.id, approved_by: user.email ?? user.id },
      })
      if (refund.status === 'failed' || refund.status === 'canceled') {
        return NextResponse.json({ ok: false, error: `Stripe refund ${refund.status}${refund.failure_reason ? ` (${refund.failure_reason})` : ''}` }, { status: 502 })
      }
      stripeRefundId = refund.id
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await auditStaff(supabase, user, 'refund_failed', 'booking', b.id, `Refund authorization FAILED at Stripe: ${msg} (${auditEur(r.amount)} via ${r.method})`, { refund_id: r.id, amount_cents: r.amount, method: r.method, error: msg })
      await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'refund_failed', changed_by_email: user.email ?? null, description: `⚠️ Stripe refund failed on authorization: ${msg}` })
      return NextResponse.json({ ok: false, error: `Stripe: ${msg}` }, { status: 502 })
    }
  }

  const now = new Date().toISOString()
  const { error: updErr } = await supabase.from('booking_refunds').update({
    status: 'paid', paid_at: now, authorized_by: user.id, authorized_by_email: user.email ?? null,
    stripe_refund_id: stripeRefundId, ...(body.notes ? { notes: body.notes } : {}),
    ...(overridden ? { method: r.method } : {}),
    // Zielkonto nach der Auszahlung: verschlüsselte Daten löschen, nur die maskierte Fassung bleibt
    payout_details: null,
  }).eq('id', r.id)
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  if (overridden) {
    await auditStaff(supabase, user, 'refund_method_override', 'booking', b.id,
      `Refund payout method OVERRIDDEN: ${rRow.method} → ${r.method} for ${auditEur(r.amount)} — reason: ${overrideReason}`,
      { refund_id: r.id, amount_cents: r.amount, from: rRow.method, to: r.method, reason: overrideReason, requested_by: rRow.requested_by_email ?? null })
    await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'refund_method_override', changed_by_email: user.email ?? null, description: `⚠️ Refund payout method overridden by ${user.email ?? 'admin'}: ${rRow.method} → ${r.method} (${(r.amount / 100).toFixed(2)} EUR) — ${overrideReason}` })
  }
  await auditStaff(supabase, user, 'refund_authorized', 'booking', b.id,
    `Refund authorized & paid: ${auditEur(r.amount)} via ${r.method}${stripeRefundId ? ` (${stripeRefundId})` : ''} — "${r.description ?? ''}"`,
    { refund_id: r.id, amount_cents: r.amount, method: r.method, stripe_refund_id: stripeRefundId, requested_by: r.requested_by_email ?? null })

  // Buchung: refund_paid_at erst, wenn kein Antrag mehr offen ist
  const { count: openCount } = await supabase.from('booking_refunds').select('id', { count: 'exact', head: true }).eq('booking_id', b.id).eq('status', 'requested')
  await supabase.from('bookings').update({ ...(openCount ? {} : { refund_paid_at: now }), updated_at: now }).eq('id', b.id)
  await recomputePaymentState(supabase, b.id)

  await supabase.from('booking_changelog').insert({
    booking_id: b.id, action: 'refund_paid', changed_by_email: user.email ?? null,
    description: `✅ Refund authorized & paid: ${(r.amount / 100).toFixed(2)} EUR via ${r.method} — "${r.description}"${stripeRefundId ? ` (${stripeRefundId})` : ''}`,
  })

  // KeyInvoice: Auszahlung OHNE Stripe-Event (cash/bank/revolut/mb_way/other) → Gutschrift bzw. Annullierung hier auslösen.
  // Stripe-Refunds übernimmt der Webhook (charge.refunded) mit demselben Beleg-Verzeichnis (idempotent).
  let inv: { invoice?: { status: string; kind?: string; doc?: string; error?: string } } = {}
  if (r.method !== 'stripe' && !b.is_test) {
    const doc = await issueRefundDocument(supabase, {
      bookingId: b.id, paymentIntent: b.stripe_payment_intent ?? null, refundId: r.id, amountCents: r.amount, isTest: false,
      fallbackCustomer: { name: b.customer_name ?? '', email: b.customer_email ?? '' }, description: 'Refund',
      fullRefundHint: r.amount >= (b.amount ?? 0),
    })
    inv = { invoice: { status: doc.status, kind: doc.kind, doc: doc.docNumber, error: doc.error ?? doc.reason } }
    if (doc.status === 'done') {
      await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'invoice_refund_doc', changed_by_email: user.email ?? null, description: `🧾 KeyInvoice: ${doc.kind === 'void' ? 'invoice voided' : 'credit note issued'} ${doc.docNumber ?? ''} (${(r.amount / 100).toFixed(2)} EUR, payout via ${r.method})` })
      await auditStaff(supabase, user, 'invoice_refund_doc', 'booking', b.id, `KeyInvoice ${doc.kind === 'void' ? 'void' : 'credit note'} ${doc.docNumber ?? ''} for ${auditEur(r.amount)}`, { refund_id: r.id, doc: doc.docNumber ?? null, kind: doc.kind ?? null })
    } else if (doc.status === 'failed') {
      await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'invoice_refund_doc_failed', changed_by_email: user.email ?? null, description: `⚠️ KeyInvoice credit note FAILED for ${(r.amount / 100).toFixed(2)} EUR: ${doc.error} — issue it manually` })
      await auditStaff(supabase, user, 'invoice_failed', 'booking', b.id, `KeyInvoice credit note FAILED for ${auditEur(r.amount)}: ${doc.error}`, { refund_id: r.id, error: doc.error ?? null })
    }
  }
  const invOut = inv

  if (!b.customer_email) return NextResponse.json({ ok: true, mail: 'none', error: 'no customer email on booking', amount_cents: r.amount, method: r.method, ...invOut, ...(stripeRefundId ? { stripe_refund_id: stripeRefundId } : {}) })

  try {
    const { count: paidCount } = await supabase.from('booking_refunds').select('id', { count: 'exact', head: true }).eq('booking_id', b.id).eq('status', 'paid')
    const { data: paidRows } = await supabase.from('booking_refunds').select('amount').eq('booking_id', b.id).eq('status', 'paid')
    const totalRefunded = (paidRows ?? []).reduce((a: number, x: { amount: number }) => a + x.amount, 0)
    const mail = await sendRefundEmail({
      customerName: b.customer_name ?? '',
      customerEmail: b.customer_email,
      productName: b.product_name ?? 'your booking',
      amountCents: r.amount,
      isPartial: totalRefunded < (b.amount ?? 0),
      isTest: b.is_test ?? false,
      method: r.method,
      bookingId: b.id,
      description: r.description,
    })
    if (!mail.ok) throw new Error(mail.error ?? 'send failed')
    await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'email_sent', description: `📧 Refund email sent to ${b.customer_email} (${(r.amount / 100).toFixed(2)} EUR via ${r.method}${(paidCount ?? 0) > 1 ? `, total refunded ${(totalRefunded / 100).toFixed(2)} EUR` : ''})` })
    return NextResponse.json({ ok: true, mail: 'refund', amount_cents: r.amount, method: r.method, ...invOut, ...(stripeRefundId ? { stripe_refund_id: stripeRefundId } : {}) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('booking_changelog').insert({ booking_id: b.id, action: 'email_failed', description: `⚠️ Refund email failed: ${msg}` })
    return NextResponse.json({ ok: true, mail: 'none', error: msg, amount_cents: r.amount, method: r.method, ...invOut, ...(stripeRefundId ? { stripe_refund_id: stripeRefundId } : {}) })
  }
}
