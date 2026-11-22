/* eslint-disable @typescript-eslint/no-explicit-any */
import { reportError } from '@/lib/errors'
import { createCreditNote, setDocumentVoid, KI_DOCTYPE, KI_SERIES } from '@/lib/keyinvoice'

/**
 * Beleg-Verzeichnis für Rückerstattungen (Tabelle keyinvoice_documents, kind = credit_note | void).
 *
 * Eine Stelle für ALLE Wege, auf denen Geld zurückgeht:
 *   - Stripe-Refund (Webhook charge.refunded)         → Schlüssel stripe_refund_id (+ refund_id aus der Metadata)
 *   - Auszahlung cash/bank/revolut/mb_way (Finances)  → Schlüssel refund_id (booking_refunds.id)
 *
 * Garantien:
 *   - idempotent: pro Refund höchstens ein Beleg (unique index + Zeile VOR dem KeyInvoice-Aufruf)
 *   - Summe aller gültigen Gutschriften einer Rechnung ≤ Rechnungsbetrag
 *   - Annullierung (Void) nur, wenn derselbe Tag + noch keine Gutschrift + dieser Refund deckt die ganze Rechnung;
 *     scheitert der Void, wird stattdessen eine Gutschrift über den Betrag ausgestellt
 *   - jeder Fehler landet in keyinvoice_documents.error UND in error_events (sichtbar); nichts wird still geschluckt
 *   - wirft nie
 */

type Db = any

/**
 * Buchungs-Log (booking_changelog): "Beleg ausgestellt" (nur Rechnung; Gutschriften loggen die Aufrufer selbst)
 * und IMMER ob/wohin das PDF per E-Mail ging. Wirft nie.
 */
export async function logInvoiceMail(db: Db, p: {
  bookingId: string | null | undefined
  kind: 'invoice' | 'credit_note'
  docNumber: string
  amountCents?: number | null
  email: string
  pdfSent: boolean
}): Promise<void> {
  if (!p.bookingId) return
  try {
    const rows: Array<{ booking_id: string; action: string; description: string }> = []
    if (p.kind === 'invoice') {
      const amt = p.amountCents != null ? ` (${(p.amountCents / 100).toFixed(2)} EUR)` : ''
      rows.push({ booking_id: p.bookingId, action: 'invoice_issued', description: `🧾 KeyInvoice: invoice issued ${p.docNumber}${amt}` })
    }
    const label = p.kind === 'invoice' ? 'Invoice' : 'Credit note'
    rows.push(p.pdfSent
      ? { booking_id: p.bookingId, action: 'invoice_email_sent', description: `📧 ${label} PDF ${p.docNumber} emailed to ${p.email || '(no address)'}` }
      : { booking_id: p.bookingId, action: 'invoice_email_failed', description: `⚠️ ${label} PDF ${p.docNumber} was NOT emailed${p.email ? ` to ${p.email}` : ' (no email address)'} — send it manually from KeyInvoice` })
    await db.from('booking_changelog').insert(rows)
  } catch (e) {
    console.error('[keyinvoice] logInvoiceMail failed:', e)
  }
}

export interface IssueRefundDocParams {
  bookingId: string
  paymentIntent?: string | null
  stripeRefundId?: string | null
  refundId?: string | null
  amountCents: number
  isTest: boolean
  fallbackCustomer: { name: string; email: string }
  /** Text auf der Gutschrift-Zeile */
  description?: string
  /** Wenn die Rechnung keinen amount_cents trägt (Altfälle): deckt dieser Refund die ganze Zahlung? */
  fullRefundHint?: boolean
}

export interface IssueRefundDocResult {
  status: 'done' | 'skipped' | 'failed'
  kind?: 'credit_note' | 'void'
  docNumber?: string
  reason?: string
  error?: string
}

const lisbonDay = (d: Date | string) => new Date(d).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })

async function findParentCandidates(db: Db, p: IssueRefundDocParams): Promise<any[]> {
  const base = () => db.from('keyinvoice_documents').select('*')
    .eq('kind', 'invoice').eq('is_test', false).not('full_doc_number', 'is', null).is('voided_at', null)
    .order('created_at', { ascending: true })
  if (p.paymentIntent) {
    const { data } = await base().eq('payment_intent', p.paymentIntent)
    if (data?.length) return data
  }
  const { data: bk } = await db.from('bookings').select('id, parent_booking_id').eq('id', p.bookingId).maybeSingle()
  const ids = [p.bookingId, bk?.parent_booking_id].filter(Boolean) as string[]
  const { data } = await base().in('booking_id', ids)
  return data ?? []
}

export async function issueRefundDocument(db: Db, p: IssueRefundDocParams): Promise<IssueRefundDocResult> {
  if (p.isTest) return { status: 'skipped', reason: 'test' }
  if (process.env.KEYINVOICE_ENABLED !== 'true') return { status: 'skipped', reason: 'flag_off' }
  if (!p.stripeRefundId && !p.refundId) return { status: 'failed', error: 'issueRefundDocument: stripeRefundId or refundId required' }

  let rowId: string | null = null
  const ctx = { booking_id: p.bookingId, stripe_refund_id: p.stripeRefundId ?? null, refund_id: p.refundId ?? null, amount_cents: p.amountCents }
  const fail = async (message: string): Promise<IssueRefundDocResult> => {
    console.error('[keyinvoice] Refund-Beleg fehlgeschlagen:', message, ctx)
    if (rowId) await db.from('keyinvoice_documents').update({ error: message, updated_at: new Date().toISOString() }).eq('id', rowId)
    await reportError('pay', new Error(`KeyInvoice refund document failed: ${message}`), { route: 'keyinvoiceLedger', ...ctx })
    return { status: 'failed', error: message }
  }

  try {
    // 1. Gibt es für diesen Refund schon einen Beleg (oder einen, der gerade läuft)?
    const conds: string[] = []
    if (p.stripeRefundId) conds.push(`stripe_refund_id.eq.${p.stripeRefundId}`)
    if (p.refundId) conds.push(`refund_id.eq.${p.refundId}`)
    const { data: ex } = await db.from('keyinvoice_documents').select('*').or(conds.join(',')).limit(1)
    const existing = ex?.[0] ?? null
    if (existing?.full_doc_number) return { status: 'skipped', reason: 'already_issued', docNumber: existing.full_doc_number, kind: existing.kind }
    if (existing && !existing.error && Date.now() - new Date(existing.updated_at).getTime() < 5 * 60_000) return { status: 'skipped', reason: 'in_progress' }
    rowId = existing?.id ?? null

    // 2. Zu welcher Rechnung gehört der Refund? (erste mit genug Restbetrag)
    const cands = await findParentCandidates(db, p)
    let parent: any = null
    let used = 0
    for (const c of cands) {
      const { data: credits } = await db.from('keyinvoice_documents').select('id, amount_cents')
        .eq('parent_doc_id', c.id).eq('kind', 'credit_note').is('error', null)
      const u = (credits ?? []).filter((x: any) => x.id !== rowId).reduce((a: number, x: any) => a + (x.amount_cents ?? 0), 0)
      if (c.amount_cents == null || c.amount_cents - u >= p.amountCents) { parent = c; used = u; break }
    }

    const nowIso = new Date().toISOString()
    const base: Record<string, unknown> = {
      booking_id: p.bookingId, payment_intent: p.paymentIntent ?? null,
      stripe_refund_id: p.stripeRefundId ?? null, refund_id: p.refundId ?? null,
      amount_cents: p.amountCents, is_test: false, error: null, updated_at: nowIso,
    }

    if (!parent && cands.length === 0) {
      // Keine ausgestellte Rechnung: bar bezahlt (nicht fakturiert), vor dem Go-live bezahlt oder Rechnung steht noch aus.
      // Nur im letzten Fall (offene/fehlgeschlagene Rechnungszeile derselben Buchung) ist das ein Fehler, sonst ist keine Gutschrift nötig.
      const { data: open } = await db.from('keyinvoice_documents').select('id').eq('kind', 'invoice').eq('is_test', false)
        .is('full_doc_number', null).eq('booking_id', p.bookingId).limit(1)
      if (!open?.length) {
        console.warn('[keyinvoice] Refund ohne Rechnung — keine Gutschrift nötig:', ctx)
        return { status: 'skipped', reason: 'no_invoice' }
      }
    }
    if (!parent) {
      const msg = cands.length === 0
        ? 'The invoice for this booking was never issued (see KeyInvoice issues in Finances) — credit note NOT created; fix the invoice first'
        : `Refund ${(p.amountCents / 100).toFixed(2)} € exceeds the remaining invoice balance — credit note NOT created`
      const payload = { ...base, kind: 'credit_note', doc_type: KI_DOCTYPE.CREDIT_NOTE, doc_series: KI_SERIES.CREDIT_NOTE }
      if (rowId) await db.from('keyinvoice_documents').update(payload).eq('id', rowId)
      else {
        const { data: ins, error: iErr } = await db.from('keyinvoice_documents').insert(payload).select('id').single()
        if (iErr?.code === '23505') return { status: 'skipped', reason: 'in_progress' }
        rowId = ins?.id ?? null
      }
      return await fail(msg)
    }

    // 3. Void oder Gutschrift?
    // Contabilista (29.10.2026): Eine Nota de Crédito reicht immer, auch am selben Tag — direktes Annullieren ist keine Pflicht.
    // Daher keine Annullierung mehr (die lieferte kein Gutschrift-PDF und keinen AT-Status), immer createCreditNote.
    let kind = 'credit_note' as 'credit_note' | 'void'

    const rowBase = (k: 'credit_note' | 'void') => ({
      ...base, kind: k, parent_doc_id: parent.id, customer: parent.customer ?? null,
      doc_type: k === 'void' ? parent.doc_type : KI_DOCTYPE.CREDIT_NOTE,
      doc_series: k === 'void' ? parent.doc_series : KI_SERIES.CREDIT_NOTE,
    })
    if (rowId) await db.from('keyinvoice_documents').update(rowBase(kind)).eq('id', rowId)
    else {
      const { data: ins, error: iErr } = await db.from('keyinvoice_documents').insert(rowBase(kind)).select('id').single()
      if (iErr?.code === '23505') return { status: 'skipped', reason: 'in_progress' } // parallele Zustellung war schneller
      if (iErr) return await fail(`keyinvoice_documents insert failed: ${iErr.message}`)
      rowId = ins.id
    }

    // 4a. Annullieren — bei Fehler auf Gutschrift ausweichen
    if (kind === 'void') {
      try {
        const voidRes = await setDocumentVoid({ DocType: parent.doc_type, DocSeries: parent.doc_series, DocNum: parent.doc_num, reason: 'Refund' })
        // Doku: Antwort ist {Voided, Message} (echte Annullierung) ODER eine Beleg-Referenz {FullDocNumber, …} (Storno-Beleg)
        const stornoNo = (voidRes as { FullDocNumber?: string } | null)?.FullDocNumber
        await db.from('keyinvoice_documents').update({ voided_at: nowIso, updated_at: nowIso }).eq('id', parent.id)
        await db.from('keyinvoice_documents').update({
          full_doc_number: stornoNo ?? parent.full_doc_number, doc_num: parent.doc_num, error: null, updated_at: new Date().toISOString(),
        }).eq('id', rowId)
        return { status: 'done', kind: 'void', docNumber: stornoNo ?? parent.full_doc_number }
      } catch (e) {
        console.error('[keyinvoice] Void fehlgeschlagen — weiche auf Gutschrift aus:', e)
        await reportError('pay', e instanceof Error ? e : new Error(String(e)), { route: 'keyinvoiceLedger', step: 'void', ...ctx })
        kind = 'credit_note'
        await db.from('keyinvoice_documents').update(rowBase('credit_note')).eq('id', rowId)
      }
    }

    // 4b. Nota de Crédito
    const c = (parent.customer ?? {}) as Record<string, string | undefined>
    const result = await createCreditNote({
      bookingId: p.bookingId,
      customer: {
        name: (c.name ?? p.fallbackCustomer.name ?? '').trim() || 'Consumidor Final',
        email: c.email || p.fallbackCustomer.email || '',
        nif: c.nif, address: c.address, postalCode: c.postalCode, locality: c.locality, countryCode: c.countryCode,
      },
      amountCents: p.amountCents,
      description: p.description || 'Refund',
      originalDocReference: parent.full_doc_number,
    })
    await db.from('keyinvoice_documents').update({
      doc_num: result.doc.DocNum, full_doc_number: result.doc.FullDocNumber,
      at_status: result.atStatus?.ATStatus ?? null, at_checked_at: result.atStatus ? new Date().toISOString() : null,
      pdf_sent_at: result.pdfSent ? new Date().toISOString() : null, error: null, updated_at: new Date().toISOString(),
    }).eq('id', rowId)
    await logInvoiceMail(db, { bookingId: p.bookingId, kind: 'credit_note', docNumber: result.doc.FullDocNumber, email: c.email || p.fallbackCustomer.email || '', pdfSent: result.pdfSent })
    console.log(`[keyinvoice] Nota de Crédito erstellt: ${result.doc.FullDocNumber} (${(p.amountCents / 100).toFixed(2)} €, zu ${parent.full_doc_number})`)
    return { status: 'done', kind: 'credit_note', docNumber: result.doc.FullDocNumber }
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e))
  }
}
