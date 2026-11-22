import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe, modeForSessionId } from '@/lib/stripe'
import { pricesIncludeVAT, KeyinvoiceError, type KiDocLine } from '@/lib/keyinvoice'

const VAT_RATE = 0.16 // Açores

export interface KiLinesResult {
  lines: KiDocLine[]
  /** Positionen, die keinem KeyInvoice-Artikel zugeordnet werden konnten (Name) */
  skipped: string[]
  /** Summe der Rechnungszeilen in Cent, auf Brutto umgerechnet (so wie der Gast zahlt) */
  sumCents: number
  /** Betrag, den Stripe tatsächlich eingezogen hat (cs.amount_total) */
  expectedCents: number
}

/**
 * Liest die bezahlten Stripe-Line-Items und mappt sie auf KeyInvoice-Zeilen (course_prices.keyinvoice_product_id).
 * Mapping: stripe_price_id → course_prices, sonst product.metadata.course_price_id (price_data-Positionen, Normalweg).
 * Versicherungs-Fallback (cs.metadata.insurance_product_id) greift nur für Positionen, die als „Insurance“ beschriftet sind.
 * Nichts wird mehr still übersprungen: unzugeordnete Positionen stehen in `skipped`.
 */
export async function buildKiLines(cs: Stripe.Checkout.Session): Promise<KiLinesResult> {
  const itemsPage = await getStripe(modeForSessionId(cs.id)).checkout.sessions.listLineItems(cs.id, { limit: 100, expand: ['data.price.product'] })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const stripePriceIds = itemsPage.data.map(item => (item.price as Stripe.Price)?.id).filter((id): id is string => !!id)
  const { data: prices } = stripePriceIds.length
    ? await supabase.from('course_prices').select('stripe_price_id, keyinvoice_product_id, price_cents').in('stripe_price_id', stripePriceIds)
    : { data: [] as { stripe_price_id: string; keyinvoice_product_id: string | null; price_cents: number }[] }
  const priceMap = new Map((prices ?? []).map(p => [p.stripe_price_id, p]))

  const cpIds = itemsPage.data
    .map(item => { const prod = (item.price as Stripe.Price | null)?.product; return typeof prod === 'object' && prod && 'metadata' in prod ? (prod.metadata?.course_price_id ?? '') : '' })
    .filter(Boolean)
  const { data: cpRows } = cpIds.length
    ? await supabase.from('course_prices').select('id, keyinvoice_product_id, price_cents').in('id', cpIds)
    : { data: [] as { id: string; keyinvoice_product_id: string | null; price_cents: number }[] }
  const byCourseId = new Map((cpRows ?? []).map(p => [p.id, p]))

  let insuranceKiId: string | null = null
  const insuranceProdId = cs.metadata?.insurance_product_id
  if (insuranceProdId) {
    const { data: insProd } = await supabase.from('course_prices').select('keyinvoice_product_id').eq('id', insuranceProdId).maybeSingle()
    insuranceKiId = insProd?.keyinvoice_product_id ?? null
  }

  const withVAT = await pricesIncludeVAT()

  const lines: KiDocLine[] = []
  const skipped: string[] = []
  let sumCents = 0

  for (const item of itemsPage.data) {
    const stripePrice = item.price as Stripe.Price | null
    const label = item.description || stripePrice?.id || '(unnamed item)'
    if (!stripePrice?.id) { skipped.push(label); continue }

    let kiId: string | null = priceMap.get(stripePrice.id)?.keyinvoice_product_id ?? null
    if (!kiId) {
      const prod = stripePrice.product
      const cid = typeof prod === 'object' && prod && 'metadata' in prod ? prod.metadata?.course_price_id : undefined
      kiId = (cid ? byCourseId.get(cid)?.keyinvoice_product_id : null) ?? null
    }
    if (!kiId && insuranceKiId && /insurance/i.test(item.description ?? '')) kiId = insuranceKiId
    if (!kiId) {
      console.warn('[keyinvoice] Kein keyinvoice_product_id für Position:', label, stripePrice.id)
      skipped.push(label)
      continue
    }

    const qty = item.quantity ?? 1
    const unitBrutto = (item.amount_total ?? 0) / qty / 100
    const unitPrice = withVAT ? unitBrutto : parseFloat((unitBrutto / (1 + VAT_RATE)).toFixed(6))
    lines.push({ IdProduct: kiId, Qty: qty, Price: unitPrice })
    sumCents += item.amount_total ?? 0
  }

  return { lines, skipped, sumCents, expectedCents: cs.amount_total ?? 0 }
}

/**
 * Wirft, wenn die Rechnung nicht exakt dem entsprechen würde, was der Gast bezahlt hat.
 * Eine fehlende (später nachholbare) Rechnung ist besser als eine falsche, fortlaufend nummerierte.
 */
export function assertLinesMatchPayment(r: KiLinesResult): void {
  if (r.lines.length === 0) throw new KeyinvoiceError('Keine fakturierbaren Positionen gefunden')
  if (r.skipped.length > 0) throw new KeyinvoiceError(`Positionen ohne KeyInvoice-Artikel: ${r.skipped.join('; ')} — Rechnung NICHT erstellt`)
  if (r.sumCents !== r.expectedCents) {
    throw new KeyinvoiceError(`Rechnungssumme ${(r.sumCents / 100).toFixed(2)} € ≠ bezahlt ${(r.expectedCents / 100).toFixed(2)} € — Rechnung NICHT erstellt`)
  }
}
