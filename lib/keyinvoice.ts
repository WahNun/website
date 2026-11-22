/**
 * Keyinvoice API 5 — Client for Azores Diving
 *
 * Endpoint:  https://pt.keyinvoice.com/API5.php  (single RPC endpoint)
 * Auth:      Apikey header → authenticate → Sid header for all subsequent calls
 * Session:   Cached in Supabase (keyinvoice_session, Singleton id=1).
 *            Re-auth only when < 300 s left — Keyinvoice rejects auth if > 300 s remain.
 *
 * Docs:      https://pt.keyinvoice.com/DocumentacaoAPI5.php
 *
 * Key series (AT-registered only):
 *   113 = Fatura-Recibo  (DocType 34) — standard paid-at-booking
 *   117 = Credit Note    (DocType 7)  — partial refunds (Gutschrift)
 */

import { createClient } from '@supabase/supabase-js'
import { sendMail, replyToAddress } from '@/lib/email'

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.KEYINVOICE_BASE_URL ?? 'https://pt.keyinvoice.com/API5.php'
const API_KEY  = process.env.KEYINVOICE_API_KEY!
const VAT_RATE = 0.16  // Açores

// DocSeries with AT validation code (Serie IDs from Keyinvoice backoffice)
export const KI_SERIES = {
  FATURA_RECIBO: 113, // JJ6JS4DS — main booking invoice
  CREDIT_NOTE:   117, // JJSVPJ27 — partial refunds
} as const

// DocType codes
export const KI_DOCTYPE = {
  FATURA_RECIBO: 34,
  CREDIT_NOTE:   7,
} as const

// ─── Supabase Admin Client ────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class KeyinvoiceError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0,
    public readonly raw?: unknown,
  ) {
    super(message)
    this.name = 'KeyinvoiceError'
  }
}

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Returns a valid Keyinvoice session ID (Sid).
 * Reads from Supabase singleton; re-authenticates only when < 300 s remain.
 * Handles concurrent Vercel function instances gracefully:
 *   if another instance already refreshed, we reuse its Sid.
 */
export async function getSid(): Promise<string> {
  if (!process.env.KEYINVOICE_API_KEY || process.env.KEYINVOICE_ENABLED !== 'true') {
    throw new KeyinvoiceError('Keyinvoice is off — KEYINVOICE_API_KEY or KEYINVOICE_ENABLED is not set. No invoice was sent.')
  }
  const supabase = getSupabase()

  // 1. Read cached session
  const { data: session } = await supabase
    .from('keyinvoice_session')
    .select('sid, expires_at')
    .eq('id', 1)
    .maybeSingle()

  if (session) {
    const secondsLeft = (new Date(session.expires_at).getTime() - Date.now()) / 1000
    if (secondsLeft > 300) {
      return session.sid
    }
  }

  // 2. Re-authenticate
  const authRes = await kiFetch(BASE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Apikey: API_KEY },
    body:    JSON.stringify({ method: 'authenticate' }),
  }, 'authenticate')

  if (!authRes.ok) {
    throw new KeyinvoiceError(`authenticate HTTP ${authRes.status}`)
  }

  const authData = await authRes.json()

  if (authData.Status === 0) {
    // "Session already active" — another instance just refreshed.
    // Re-read the fresh session from Supabase.
    const { data: fresh } = await supabase
      .from('keyinvoice_session')
      .select('sid')
      .eq('id', 1)
      .maybeSingle()

    if (fresh?.sid) return fresh.sid

    throw new KeyinvoiceError(
      authData.ErrorMessage ?? 'authenticate failed',
      0,
      authData,
    )
  }

  const newSid: string = authData.Data?.Sid ?? authData.Sid
  if (!newSid) throw new KeyinvoiceError('authenticate: no Sid in response', 0, authData)

  const expiresAt = new Date(Date.now() + 3_600_000).toISOString()

  // 3. Persist session singleton (upsert)
  await supabase.from('keyinvoice_session').upsert(
    { id: 1, sid: newSid, expires_at: expiresAt, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  )

  return newSid
}

// ─── fetch mit Wiederholung bei Netzwerkfehlern ──────────────────────────────

/**
 * Live-Test 29.10.: Rechnung und Gutschrift scheiterten zweimal mit "fetch failed" (Netzwerkfehler,
 * keine HTTP-Antwort). Wir wiederholen NUR, wenn die Verbindung gar nicht zustande kam/abbrach
 * UND der Aufruf gefahrlos wiederholbar ist. Dokument-erzeugende Methoden (insertDocument,
 * insertClient, setDocumentVoid) werden nie automatisch wiederholt, sonst droht ein doppeltes,
 * bei der AT gemeldetes Dokument. Fuer die gibt es den Retry-Button in Finances.
 */
const NON_RETRYABLE_METHODS = new Set(['insertDocument', 'insertClient', 'setDocumentVoid'])

async function kiFetch(url: string, init: RequestInit, method: string): Promise<Response> {
  const maxAttempts = NON_RETRYABLE_METHODS.has(method) ? 1 : 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
    } catch (err) {
      lastErr = err
      const cause = (err as { cause?: { code?: string; message?: string } })?.cause
      console.error(`[keyinvoice] fetch fehlgeschlagen (method=${method}, Versuch ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err, cause?.code ?? cause?.message ?? '')
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 600 * attempt))
    }
  }
  throw lastErr
}

// ─── Core Request Helper ─────────────────────────────────────────────────────

async function kiRequest<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const sid = await getSid()

  const res = await kiFetch(BASE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Sid: sid },
    body:    JSON.stringify(body),
  }, String(body.method))

  if (!res.ok) {
    throw new KeyinvoiceError(`Keyinvoice HTTP ${res.status} for method=${body.method}`)
  }

  const data = await res.json()

  if (data.Status === 0) {
    throw new KeyinvoiceError(
      data.ErrorMessage ?? `method=${body.method} failed`,
      0,
      data,
    )
  }

  return data.Data as T
}

// ─── Price Mode Detection ─────────────────────────────────────────────────────

let _pricesIncludeVAT: boolean | null = null

/**
 * Returns true if the API user's config sends prices including VAT (brutto).
 * Stripe amounts are always brutto — we must match Keyinvoice's expectation.
 * Result is cached for the process lifetime.
 */
export async function pricesIncludeVAT(): Promise<boolean> {
  if (_pricesIncludeVAT !== null) return _pricesIncludeVAT
  const data = await kiRequest<{ PricesWithVAT: boolean | 0 | 1 }>({
    method: 'verifyUserInsertionPricesWithVAT',
  })
  _pricesIncludeVAT = Boolean(data.PricesWithVAT)
  return _pricesIncludeVAT
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KiDocLine {
  /** Keyinvoice IdProduct — must exist in catalog */
  IdProduct:    string | number
  /** Product display name (optional override) */
  ProductName?: string
  Qty:          number
  /** Unit price. Brutto or netto depending on API user config (see pricesIncludeVAT()). */
  Price:        number
  /** Tax override — leave undefined to use the product's default (16 %) */
  IdTax?:       number
  /** Line discount in % */
  Discount?:    number
}

export interface KiCustomer {
  /** Keyinvoice client ID — use when client already exists */
  IdClient?:    number
  /** NIF (Portuguese tax ID) */
  VATIN?:       string
  Name?:        string
  Address?:     string
  PostalCode?:  string
  Locality?:    string
  /** ISO-2 country code, default 'PT' */
  CountryCode?: string
  Email?:       string
}

export interface InsertDocumentParams {
  docType:        number
  docSeries?:     number
  customer:       KiCustomer
  lines:          KiDocLine[]
  /** ISO date YYYY-MM-DD, defaults to today */
  docDate?:       string
  docReference?:  string
  comments?:      string
}

export interface KiDocumentRef {
  DocType:       number
  DocSeries:     number
  DocNum:        number
  FullDocNumber: string
}

// ─── insertDocument ───────────────────────────────────────────────────────────

export async function insertDocument(params: InsertDocumentParams): Promise<KiDocumentRef> {
  const today = new Date().toISOString().slice(0, 10)

  const body: Record<string, unknown> = {
    method:   'insertDocument',
    DocType:  params.docType,
    DocLines: params.lines.map(l => ({
      IdProduct:   l.IdProduct,
      ...(l.ProductName ? { ProductName: l.ProductName } : {}),
      Qty:         l.Qty,
      ColorsSizes: '',    // required field, empty for services
      Price:       l.Price,
      ...(l.IdTax    !== undefined ? { IdTax:    l.IdTax    } : {}),
      ...(l.Discount !== undefined ? { Discount: l.Discount } : {}),
    })),
    DocDate: params.docDate ?? today,
    ...(params.docSeries    ? { DocSeries:    params.docSeries    } : {}),
    ...(params.docReference ? { DocReference: params.docReference } : {}),
    ...(params.comments     ? { Comments:     params.comments     } : {}),
  }

  const c = params.customer
  if (c.IdClient) {
    body.IdClient = c.IdClient
  } else {
    body.Name        = c.Name        ?? 'Consumidor Final'
    body.Address     = c.Address     ?? ''
    body.PostalCode  = c.PostalCode  ?? ''
    body.Locality    = c.Locality    ?? ''
    body.CountryCode = c.CountryCode ?? 'PT'
    if (c.VATIN) body.VATIN = c.VATIN
  }

  return kiRequest<KiDocumentRef>(body)
}

// ─── registerInvoiceAT ────────────────────────────────────────────────────────

export async function registerInvoiceAT(doc: KiDocumentRef): Promise<{ Message: string }> {
  return kiRequest<{ Message: string }>({
    method:    'registerInvoiceAT',
    DocType:   doc.DocType,
    DocSeries: doc.DocSeries,
    DocNum:    doc.DocNum,
  })
}

// ─── checkInvoiceComAT ────────────────────────────────────────────────────────

export interface ATStatus {
  ATStatus:   string   // e.g. 'Comunicado', 'Pendente'
  ATCode?:    string
  ATMessage?: string
}

export async function checkInvoiceComAT(doc: KiDocumentRef): Promise<ATStatus> {
  const raw = await kiRequest<unknown>({
    method:    'checkInvoiceComAT',
    DocType:   doc.DocType,
    DocSeries: doc.DocSeries,
    DocNum:    doc.DocNum,
  })
  // Feldnamen der Antwort sind nicht dokumentiert abgesichert -> Rohantwort loggen und tolerant lesen.
  console.log('[keyinvoice] checkInvoiceComAT raw:', JSON.stringify(raw ?? null))
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const key = ['ATStatus', 'Status', 'Estado', 'State', 'Message', 'ATMessage'].find(k => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
  const text = key
    ? String(obj[key])
    : typeof raw === 'string' && raw
      ? raw
      : raw == null ? '(empty response)' : JSON.stringify(raw).slice(0, 200)
  return {
    ATStatus:  text,
    ATCode:    obj.ATCode != null ? String(obj.ATCode) : undefined,
    ATMessage: obj.ATMessage != null ? String(obj.ATMessage) : undefined,
  }
}

// ─── registerAndCheckAT ───────────────────────────────────────────────────────

/**
 * KeyInvoice meldet Dokumente beim Anlegen teils selbst an. Dann antwortet
 * registerInvoiceAT mit "Documento já comunicado" — das ist kein Fehler,
 * der Status-Check muss trotzdem laufen.
 */
async function registerAndCheckAT(doc: KiDocumentRef): Promise<ATStatus> {
  try {
    await registerInvoiceAT(doc)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/j[aá] comunicado/i.test(msg)) throw err
  }
  return checkInvoiceComAT(doc)
}

// ─── sendDocumentPDF2Email ────────────────────────────────────────────────────

export async function sendDocumentPDF2Email(
  doc: KiDocumentRef,
  email: string,
): Promise<{ Message: string }> {
  return kiRequest<{ Message: string }>({
    method:    'sendDocumentPDF2Email',
    DocType:   doc.DocType,
    DocSeries: doc.DocSeries,
    DocNum:    doc.DocNum,
    Email:     email,
  })
}

// ─── getDocumentPDF ───────────────────────────────────────────────────────────

/**
 * Holt das PDF eines Keyinvoice-Dokuments als Base64-String.
 * Response: { Status:1, Data:{ DocumentBinary: "<base64>" } }
 */
export async function getDocumentPDF(doc: KiDocumentRef): Promise<{ DocumentBinary: string }> {
  return kiRequest<{ DocumentBinary: string }>({
    method:    'getDocumentPDF',
    DocType:   doc.DocType,
    DocSeries: doc.DocSeries,
    DocNum:    doc.DocNum,
    Format:    'A4',
  })
}

// ─── sendInvoicePdfEmail ──────────────────────────────────────────────────────

/**
 * Lädt das Keyinvoice-PDF herunter und sendet es via unserem eigenen
 * Email-System (Resend/Gmail) — selbes Design wie alle anderen AZD-Mails.
 * Das PDF selbst generiert Keyinvoice (AT-konform, mit deren Druckvorlage).
 */
async function sendInvoicePdfEmail(opts: {
  doc:          KiDocumentRef
  customerName: string
  email:        string
  isCredit?:    boolean
}): Promise<void> {
  const pdfResult = await getDocumentPDF(opts.doc)
  const pdfBuffer = Buffer.from(pdfResult.DocumentBinary, 'base64')

  const docLabel = opts.isCredit ? 'credit note' : 'invoice'
  const docLabelPt = opts.isCredit ? 'Nota de Crédito' : 'Fatura-Recibo'
  const fn = opts.doc.FullDocNumber
  const firstName = opts.customerName.trim().split(' ')[0]
  const subject = `Your ${docLabel} — ${fn}`
  const filename = `${docLabelPt.replace(/\s/g, '-')}-${fn.replace(/[\s/]/g, '-')}.pdf`

  const text = [
    `Hi ${firstName},`,
    ``,
    `Please find attached your ${docLabel} ${fn} from Azores Diving.`,
    ``,
    `Questions? Just reply to this email.`,
    ``,
    `See you underwater,`,
    `Azoresdiving Team`,
    ``,
    `Marina Pêro de Teive, Quiosque A · 9500-771 Ponta Delgada, São Miguel, Azores`,
    `+351 927 382 023 · azoresdiving@gmail.com · Daily 8:00–20:00`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Azoresdiving</title></head>
<body bgcolor="#04101F" style="margin:0;padding:0;background-color:#04101F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#04101F"><tr><td align="center" style="padding:40px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td bgcolor="#0A1F3D" style="border-radius:12px;padding:40px 36px;">
        <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#35D0FF;">${opts.isCredit ? 'Credit Note' : 'Invoice'}</p>
        <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#E8F1FB;line-height:1.2;">${fn}<span style="color:#35D0FF;">.</span></h1>
        <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#E8F1FB;">Hi ${firstName},</p>
        <p style="margin:0 0 28px 0;font-size:16px;line-height:1.75;color:#E8F1FB;">
          Please find attached your ${docLabel} from Azores Diving.
        </p>
        <hr style="border:none;border-top:1px solid rgba(53,208,255,0.15);margin:28px 0;">
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#CFE2F4;">
          Any questions? Just reply to this email.
        </p>
        <p style="margin:0;font-size:14px;color:#7FA6C9;line-height:1.8;">
          See you underwater,<br>
          <strong style="color:#E8F1FB;">Azoresdiving Team</strong><br>
          <a href="https://www.azoresdiving.com" style="color:#35D0FF;text-decoration:none;">azoresdiving.com</a>
        </p>
      </td></tr>
      <tr><td align="center" style="padding-top:32px;">
        <img src="https://www.azoresdiving.com/logo.png" alt="Azoresdiving" width="110" style="display:block;max-width:110px;margin:0 auto 16px;">
        <p style="margin:0;font-size:11px;color:#4A6A8A;line-height:1.9;letter-spacing:0.03em;">
          Marina P&ecirc;ro de Teive, Quiosque A &middot; 9500-771 Ponta Delgada, S&atilde;o Miguel, Azores<br>
          +351 927 382 023 &middot; azoresdiving@gmail.com<br>Daily 8:00&ndash;20:00
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`

  await sendMail({
    to:          opts.email,
    subject,
    text,
    html,
    kind:        opts.isCredit ? 'credit_note_pdf' : 'invoice_pdf',
    replyTo:     replyToAddress(),
    attachments: [{
      filename,
      contentType: 'application/pdf',
      data:        pdfBuffer,
    }],
  })
}

// ─── clientExists ─────────────────────────────────────────────────────────────

export interface KiClientResult {
  IdClient: number
  Name:     string
  VATIN?:   string
}

/** Looks up a Keyinvoice client by NIF. Returns null if not found. */
export async function clientExists(vatin: string): Promise<KiClientResult | null> {
  try {
    return await kiRequest<KiClientResult>({ method: 'clientExists', VATIN: vatin })
  } catch (err) {
    // KeyInvoice antwortet bei unbekannter NIF portugiesisch: "O Cliente indicado não existe"
    if (err instanceof KeyinvoiceError && /not found|n[aã]o existe|n[aã]o encontrad/i.test(err.message)) {
      return null
    }
    throw err
  }
}

// ─── insertClient ─────────────────────────────────────────────────────────────

/**
 * Legt einen Kunden mit NIF an. insertDocument ignoriert VATIN, wenn kein IdClient mitgegeben wird — die Rechnung
 * lief dann still als "Consumidor Final". Fehler werden NICHT verschluckt (sichtbar im Ledger / KeyInvoice-Kasten).
 */
export async function insertClient(c: {
  name: string; vatin: string; email?: string; address?: string; postalCode?: string; locality?: string; countryCode?: string
}): Promise<number> {
  const data = await kiRequest<unknown>({
    method:      'insertClient',
    Name:        c.name,
    VATIN:       c.vatin,
    Address:     c.address ?? '',
    PostalCode:  c.postalCode ?? '',
    Locality:    c.locality ?? '',
    CountryCode: c.countryCode ?? 'PT',
    ...(c.email ? { Email: c.email } : {}),
  })
  console.log('[keyinvoice] insertClient raw:', JSON.stringify(data ?? null))
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const id = typeof data === 'number' ? data : Number(obj.IdClient ?? obj.Id ?? NaN)
  if (Number.isFinite(id) && id > 0) return id
  // Antwort ohne ID → über die NIF nachschlagen
  const again = await clientExists(c.vatin)
  if (again?.IdClient) return again.IdClient
  throw new KeyinvoiceError(`insertClient lieferte keine IdClient (Antwort: ${JSON.stringify(data ?? null).slice(0, 200)})`)
}

// ─── Full Booking Invoice Flow ────────────────────────────────────────────────

export interface CreateBookingInvoiceParams {
  /** Stripe checkout.session.id — stored as DocReference for cross-referencing */
  stripeSessionId: string
  customer: {
    name:         string
    email:        string
    /** Portuguese NIF — optional; if present, named invoice is issued */
    nif?:         string
    address?:     string
    postalCode?:  string
    locality?:    string
    countryCode?: string
  }
  lines: KiDocLine[]
  /** W-8: Draft-ID aus Stripe-Metadata — wenn gesetzt, werden Lines aus draft_items gebaut */
  draftId?: string
}

export interface CreateBookingInvoiceResult {
  doc:      KiDocumentRef
  atStatus: ATStatus | null
  pdfSent:  boolean
}

// ─── W-8: Draft-Lines Builder ─────────────────────────────────────────────────

/**
 * Baut KiDocLine[] aus draft_items für die gegebene draft_id.
 * Items ohne keyinvoice_product_id werden übersprungen und geloggt (non-fatal).
 * Gibt leeres Array zurück wenn keine draft_items gefunden werden.
 */
async function buildLinesFromDraft(draftId: string): Promise<KiDocLine[]> {
  const supabase = getSupabase()

  const { data: draftItems, error: diErr } = await supabase
    .from('draft_items')
    .select('id, product_id, quantity, price_cents')
    .eq('draft_id', draftId)

  if (diErr) {
    console.error('[keyinvoice] W-8: draft_items Fehler:', diErr)
    return []
  }

  if (!draftItems?.length) return []

  const productIds = draftItems
    .map((i: { product_id: string | null }) => i.product_id)
    .filter((id: string | null): id is string => !!id)

  const { data: prices } = await supabase
    .from('course_prices')
    .select('id, keyinvoice_product_id, name')
    .in('id', productIds)

  const priceMap = new Map(
    (prices ?? []).map((p: { id: string; keyinvoice_product_id: string | null; name: string | null }) => [p.id, p]),
  )

  const withVAT = await pricesIncludeVAT()

  const lines: KiDocLine[] = []

  for (const item of draftItems) {
    if (!item.product_id) continue

    const cp = priceMap.get(item.product_id)
    if (!cp?.keyinvoice_product_id) {
      console.warn(
        '[keyinvoice] W-8: kein keyinvoice_product_id für product_id:', item.product_id,
        '— übersprungen',
      )
      continue
    }

    const qty        = (item.quantity as number | null) ?? 1
    const unitBrutto = ((item.price_cents as number | null) ?? 0) / 100
    const unitPrice  = withVAT
      ? unitBrutto
      : parseFloat((unitBrutto / (1 + VAT_RATE)).toFixed(6))

    lines.push({
      IdProduct:   cp.keyinvoice_product_id,
      ...(cp.name ? { ProductName: cp.name } : {}),
      Qty:         qty,
      Price:       unitPrice,
    })
  }

  return lines
}

/**
 * Full invoice flow for a completed Stripe booking:
 *   insertDocument → registerInvoiceAT → checkInvoiceComAT → sendDocumentPDF2Email
 *
 * Uses Fatura-Recibo (DocType 34, Serie 113) — the standard for paid-at-booking services.
 *
 * Call this from the Stripe webhook handler AFTER persisting to keyinvoice_documents.
 * Always return 200 to Stripe before calling this (async).
 */
export async function createBookingInvoice(
  params: CreateBookingInvoiceParams,
): Promise<CreateBookingInvoiceResult> {
  // Resolve customer
  let customer: KiCustomer

  if (params.customer.nif) {
    const existing = await clientExists(params.customer.nif)
    if (existing) {
      customer = { IdClient: existing.IdClient }
    } else {
      // Neukunde: erst anlegen, dann per IdClient referenzieren — sonst fällt die NIF auf der Rechnung weg.
      const idClient = await insertClient({
        name: params.customer.name, vatin: params.customer.nif, email: params.customer.email || undefined,
        address: params.customer.address, postalCode: params.customer.postalCode, locality: params.customer.locality,
        countryCode: params.customer.countryCode,
      })
      customer = { IdClient: idClient }
    }
  } else {
    customer = {
      Name:        params.customer.name,
      Address:     params.customer.address     ?? '',
      PostalCode:  params.customer.postalCode  ?? '',
      Locality:    params.customer.locality    ?? '',
      CountryCode: params.customer.countryCode ?? 'PT',
    }
  }

  // W-8: Zeilen aus draft_items aufbauen wenn draft_id vorhanden
  let lines = params.lines
  if (params.draftId) {
    const draftLines = await buildLinesFromDraft(params.draftId)
    if (draftLines.length > 0) {
      lines = draftLines
    } else {
      console.warn(
        '[keyinvoice] W-8: draft_items leer oder alle übersprungen — Fallback auf Stripe line_items',
      )
    }
  }

  if (lines.length === 0) {
    throw new KeyinvoiceError('Keine fakturierbaren Positionen gefunden')
  }

  // 1. Insert document
  const doc = await insertDocument({
    docType:      KI_DOCTYPE.FATURA_RECIBO,
    docSeries:    KI_SERIES.FATURA_RECIBO,
    customer,
    lines,
    docReference: params.stripeSessionId,
  })

  // 2. Register with AT (non-fatal on failure)
  let atStatus: ATStatus | null = null
  try {
    atStatus = await registerAndCheckAT(doc)
  } catch (err) {
    console.error('[keyinvoice] AT registration error:', err)
  }

  // 3. Rechnung herunterladen und via eigenem Email-System versenden (non-fatal)
  let pdfSent = false
  try {
    await sendInvoicePdfEmail({
      doc,
      customerName: params.customer.name,
      email:        params.customer.email,
    })
    pdfSent = true
  } catch (err) {
    console.error('[keyinvoice] Invoice PDF email error:', err)
  }

  return { doc, atStatus, pdfSent }
}

// ─── Credit Note (Gutschrift / Nota de Crédito) ───────────────────────────────

export interface CreateCreditNoteParams {
  /** booking_id for cross-referencing */
  bookingId: string
  customer: {
    name:         string
    email:        string
    /** Portuguese NIF — optional */
    nif?:         string
    address?:     string
    postalCode?:  string
    locality?:    string
    countryCode?: string
  }
  /** Amount to credit back in cents (e.g. 5000 = €50.00) */
  amountCents: number
  /** Description shown on the credit note line */
  description: string
  /** Full document number of the original Fatura-Recibo, e.g. 'FR 113/42' */
  originalDocReference?: string
}

export interface CreateCreditNoteResult {
  doc:      KiDocumentRef
  atStatus: ATStatus | null
  pdfSent:  boolean
}

/**
 * Issues a Credit Note (Nota de Crédito) in Keyinvoice.
 * Used for partial refunds (Teilrückerstattung).
 *
 * Flow: insertDocument (DocType 7, Serie 117)
 *       → registerInvoiceAT → checkInvoiceComAT → sendDocumentPDF2Email
 *
 * Non-fatal: AT registration and PDF send failures are logged but do not
 * abort the credit note — the Stripe refund has already gone through.
 */
export async function createCreditNote(
  params: CreateCreditNoteParams,
): Promise<CreateCreditNoteResult> {
  const amountEur = params.amountCents / 100

  // Resolve customer
  let customer: KiCustomer
  if (params.customer.nif) {
    const existing = await clientExists(params.customer.nif)
    if (existing) {
      customer = { IdClient: existing.IdClient }
    } else {
      // Neukunde: erst anlegen, dann per IdClient referenzieren — sonst fällt die NIF auf der Rechnung weg.
      const idClient = await insertClient({
        name: params.customer.name, vatin: params.customer.nif, email: params.customer.email || undefined,
        address: params.customer.address, postalCode: params.customer.postalCode, locality: params.customer.locality,
        countryCode: params.customer.countryCode,
      })
      customer = { IdClient: idClient }
    }
  } else {
    customer = {
      Name:        params.customer.name,
      Address:     params.customer.address     ?? '',
      PostalCode:  params.customer.postalCode  ?? '',
      Locality:    params.customer.locality    ?? '',
      CountryCode: params.customer.countryCode ?? 'PT',
    }
  }

  const lines: KiDocLine[] = [{
    IdProduct:   'PS',        // „Prestação de serviços" — existiert im KeyInvoice-Katalog (Export 23.10.2026); Code 1 gab es nicht
    ProductName: params.description,
    Qty:         1,
    // Stripe-Betrag ist brutto. Das Produkt 'PS' nimmt den Preis immer als NETTO (auch wenn
    // verifyUserInsertionPricesWithVAT 'brutto' meldet, das gilt nur fuer die Rechnungsprodukte).
    // Live-Test 29.10.: 62,00 -> Gutschrift 71,92, 3,00 -> 3,48. Daher immer durch (1+MwSt) teilen.
    Price:       parseFloat((amountEur / (1 + VAT_RATE)).toFixed(6)),
  }]

  // 1. Insert credit note
  const doc = await insertDocument({
    docType:      KI_DOCTYPE.CREDIT_NOTE,
    docSeries:    KI_SERIES.CREDIT_NOTE,
    customer,
    lines,
    docReference: params.originalDocReference ?? `booking:${params.bookingId}`,
    comments:     params.originalDocReference
      ? `Refund — original invoice ${params.originalDocReference}`
      : `Refund — booking ${params.bookingId}`,
  })

  // 2. Register with AT (non-fatal)
  let atStatus: ATStatus | null = null
  try {
    atStatus = await registerAndCheckAT(doc)
  } catch (err) {
    console.error('[keyinvoice] Credit note AT registration error:', err)
  }

  // 3. Gutschrift herunterladen und via eigenem Email-System versenden (non-fatal)
  let pdfSent = false
  try {
    await sendInvoicePdfEmail({
      doc,
      customerName: params.customer.name,
      email:        params.customer.email,
      isCredit:     true,
    })
    pdfSent = true
  } catch (err) {
    console.error('[keyinvoice] Credit note PDF email error:', err)
  }

  return { doc, atStatus, pdfSent }
}

// ─── Document Void (Annullierung — nur am selben Tag erlaubt) ────────────────

/**
 * Annulliert ein Keyinvoice-Dokument (setDocumentVoid).
 * Nur am selben Tag wie die Ausstellung erlaubt — danach Nota de Crédito verwenden.
 */
export async function setDocumentVoid(params: {
  DocType:   number
  DocSeries: number
  DocNum:    number
  /** CreditReason — Pflicht (ohne: "Motivo inválido"); steht auf dem ggf. erzeugten Storno-Beleg */
  reason?:   string
}): Promise<unknown> {
  // Laut API-Doku (setDocumentVoid): Parameter DocType*, DocNum*, DocSeries, CreditSeries, CreditDate, CreditReason.
  // CreditSeries = unsere Gutschrift-Serie, falls KeyInvoice statt einer echten Annullierung einen Storno (Nota de Crédito) erzeugt.
  const data = await kiRequest<unknown>({
    method:       'setDocumentVoid',
    DocType:      params.DocType,
    DocSeries:    params.DocSeries,
    DocNum:       params.DocNum,
    CreditSeries: KI_SERIES.CREDIT_NOTE,
    CreditReason: params.reason ?? 'Refund',
  })
  console.log('[keyinvoice] setDocumentVoid raw:', JSON.stringify(data ?? null))
  return data
}
