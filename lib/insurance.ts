/**
 * Tauchversicherung — eine Quelle für Buchungsformular, Check-in und Panel.
 *
 * Der Nachweis (PDF, Karte, App) laesst sich online nicht pruefen. Wer eine
 * eigene Police angibt, erzeugt deshalb ein Flag, das der Empfang bei Ankunft
 * aufloest. Wer die Tagesversicherung bei uns kauft, hat nichts vorzulegen.
 */

export const INSURANCE_PROVIDERS = [
  'DAN Europe',
  'DAN World',
  'Aqua Med',
  'DiveAssure',
  'PADI / DSAT',
  'Dive Master Insurance',
] as const

/** own = eigene Police (Nachweis), azd_day = DAN-Tagesversicherung über uns (→ DAN-Export), ssi = im Kurspreis enthaltene SSI-Versicherung (kein DAN), none = keine */
export type InsuranceSource = 'own' | 'azd_day' | 'ssi' | 'none'

/** Ein Nachweis steht nur dann aus, wenn der Gast eine eigene Police behauptet. */
export function insuranceFlagFor(source: InsuranceSource): boolean {
  return source === 'own'
}

export const INSURANCE_LABEL: Record<InsuranceSource, string> = {
  own: 'Own policy — proof to check',
  azd_day: 'DAN day cover bought with us',
  ssi: 'SSI insurance included in the course',
  none: 'No insurance',
}

/**
 * Auffrischung faellig?
 *
 * Wer laenger als zwoelf Monate nicht getaucht ist, geht nicht ohne
 * Auffrischung ins Wasser. Kein Ermessen der Crew — die Regel entscheidet das
 * Datum, und zwar bevor der Gast am Steg steht.
 */
export const REFRESHER_MONTHS = 12

/**
 * `on` = Tag, an dem getaucht wird (YYYY-MM-DD oder Date). Ohne Angabe: heute.
 * Der Check laeuft gegen den spaetesten gebuchten Tauchtag, nicht gegen den Buchungstag: wer heute 11 Monate Pause hat
 * und in drei Monaten taucht, ist am Tauchtag bei 14 (Lucas 25.10.).
 */
export function needsRefresher(lastDiveDate: string | null | undefined, on: Date | string | null = new Date()): boolean {
  if (!lastDiveDate) return false
  const last = new Date(lastDiveDate + 'T12:00:00')
  if (Number.isNaN(last.getTime())) return false
  const ref = on == null ? new Date() : typeof on === 'string' ? new Date(on + 'T12:00:00') : on
  if (Number.isNaN(ref.getTime())) return needsRefresher(lastDiveDate)
  const cutoff = new Date(ref)
  cutoff.setMonth(cutoff.getMonth() - REFRESHER_MONTHS)
  return last < cutoff
}

export function monthsSince(lastDiveDate: string | null | undefined, on: Date = new Date()): number | null {
  if (!lastDiveDate) return null
  const last = new Date(lastDiveDate + 'T12:00:00')
  if (Number.isNaN(last.getTime())) return null
  return Math.max(0, Math.round((on.getTime() - last.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
}

// ─── DAN Block-Versicherung ───────────────────────────────────────────────────

export interface InsuranceBlock {
  /** Produkt-ID aus course_prices (z.B. 'insurance-3d') */
  planId: string
  /** Anzahl Einheiten (>1 nur bei insurance-1d für Mehrtagebuchungen ohne Folgetag) */
  units: number
  /** Anzahl Tauchtage die dieser Block abdeckt */
  days: number
}

/**
 * Teilt eine Menge von Tauchtagen in konsekutive Blöcke auf und wählt
 * pro Block den für den Gast günstigsten DAN-Tarif.
 *
 * DAN-Mehrtagespläne gelten NUR für aufeinanderfolgende Kalendertage —
 * deshalb darf ein 5-Tage-Plan nicht auf gestreute Tage angewendet werden.
 *
 * Tarifwahl pro Block (Tage → Plan → Gaspreis):
 *   1 → 1d×1 → €10    2 → 1d×2 → €20
 *   3 → 3d×1 → €23    4-5 → 5d×1 → €30
 *   6-7 → 7d×1 → €38  8-10 → 10d×1 → €48
 *
 * @param dates  Unikate Tauchtage als YYYY-MM-DD strings (Duplikate werden ignoriert)
 */
export function computeInsuranceBlocks(dates: string[]): InsuranceBlock[] {
  if (dates.length === 0) return []

  const sorted = [...new Set(dates)].sort()

  // In konsekutive Blöcke aufteilen
  const blocks: string[][] = []
  let current: string[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00Z')
    const curr = new Date(sorted[i] + 'T12:00:00Z')
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000)
    if (diffDays === 1) {
      current.push(sorted[i])
    } else {
      blocks.push(current)
      current = [sorted[i]]
    }
  }
  blocks.push(current)

  // Pro Block günstigsten Plan wählen
  return blocks.map(block => {
    const n = block.length
    if (n <= 2) return { planId: 'insurance-1d', units: n, days: n }
    if (n === 3) return { planId: 'insurance-3d', units: 1, days: n }
    if (n <= 5) return { planId: 'insurance-5d', units: 1, days: n }
    if (n <= 7) return { planId: 'insurance-7d', units: 1, days: n }
    return { planId: 'insurance-10d', units: 1, days: n }
  })
}

/**
 * Kanonische Produkt-ID für eine Buchung mit DAN-Versicherung.
 * Wird als Marker in bookings.insurance_product_id gespeichert; Existenz != null
 * bedeutet "DAN-Versicherung bezahlt". Bei mehreren Blöcken gilt der erste.
 */
export function primaryInsurancePlanId(blocks: InsuranceBlock[]): string | null {
  return blocks.length > 0 ? blocks[0].planId : null
}


/** Gesamtpreis (Cent) der günstigsten Pläne für diese Tage. */
export function insuranceCostCents(dates: string[], priceOf: (planId: string) => number): number {
  return computeInsuranceBlocks(dates).reduce((a, b) => a + priceOf(b.planId) * b.units, 0)
}

/**
 * Aufpreis für die Tage `own`, wenn `prior` (frühere Karten derselben Person) schon versichert ist:
 * Kosten(prior ∪ own) − Kosten(prior). So entsteht über alle Karten ein einziges Paket
 * (z. B. 3 Tage am Stück = 3-Tage-Plan) statt Einzeltage pro Karte.
 */
export function insuranceIncrementCents(prior: string[], own: string[], priceOf: (planId: string) => number): number {
  const union = [...new Set([...prior, ...own])]
  return Math.max(0, insuranceCostCents(union, priceOf) - insuranceCostCents([...new Set(prior)], priceOf))
}
