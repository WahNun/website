/**
 * product_type für die bookings-Tabelle.
 *
 * Die Spalte hat einen CHECK-Constraint:
 *   fun_dive | try_scuba | course | formigas | offshore_prep | other
 * Wer hier etwas anderes eintraegt, bekommt keine Buchung, sondern 23514 — und
 * der Gast, der schon bezahlt hat, sieht einen ewigen Ladekreis. Diese Funktion
 * gibt deshalb ausschliesslich Werte aus dieser Liste zurueck.
 *
 * Eine Quelle für Walk-in (Front Office) und Online-Checkout, damit die beiden
 * Wege nicht auseinanderlaufen.
 */

export const PRODUCT_TYPES = [
  'fun_dive',
  'try_scuba',
  'course',
  'formigas',
  'offshore_prep',
  'other',
] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]

/** Namen aus course_prices, die keiner Kategorie-Regel folgen. */
const BY_NAME: Record<string, ProductType> = {
  'Double Dive': 'fun_dive',
  'Single Dive': 'fun_dive',
  'Night Dive': 'fun_dive',
  'Formigas Expedition': 'formigas',
  'Offshore Prep': 'offshore_prep',
}

/** course_prices.category -> Typ, wenn der Name nichts Genaueres sagt. */
const BY_CATEGORY: Record<string, ProductType> = {
  dives: 'fun_dive',
  entry: 'course',
  specialty: 'course',
  pro: 'course',
  ecology: 'course',
  // Miete, Zuschlaege und Versicherung sind keine Tauchgaenge — sie als
  // fun_dive zu buchen wuerde die Auswertung verfaelschen.
  equipment: 'other',
  extras: 'other',
  insurance: 'other',
}

export function productTypeFor(productName: string | null | undefined, category?: string | null): ProductType {
  const name = (productName ?? '').trim()

  const exact = BY_NAME[name]
  if (exact) return exact

  const n = name.toLowerCase()
  // Alle Basic-Diver-Varianten (Pool only / Pool + Sea / Private) — Namen in course_prices tragen Zusätze in Klammern
  if (n.startsWith('basic diver')) return 'try_scuba'
  if (n.includes('formigas')) return 'formigas'
  if (n.includes('offshore prep')) return 'offshore_prep'
  if (n.includes('try scuba')) return 'try_scuba'
  if (n.includes('dive pack') || n.includes('-dive')) return 'fun_dive'

  const byCategory = category ? BY_CATEGORY[category] : undefined
  if (byCategory) return byCategory

  return 'other'
}

/**
 * Produkttypen, die Instructor-Kapazität belegen (capacity_quota.max_course_students).
 * Try Scuba / Basic Diver binden einen Instructor wie ein Kurs —
 * sie blockieren nur keine Bootsplätze, das ist eine andere Ressource.
 */
export const INSTRUCTOR_PRODUCT_TYPES: readonly ProductType[] = ['course', 'try_scuba']

/** Sicherheitsnetz für Werte, die von aussen kommen (z. B. Stripe-Metadaten). */
export function asProductType(value: string | null | undefined, fallback: ProductType = 'other'): ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value ?? '') ? (value as ProductType) : fallback
}

/** Produkt-ID der Auffrischung in course_prices. Wird automatisch in den Warenkorb gelegt. */
export const REFRESHER_PRODUCT_ID = 'skills-update'

/**
 * Muss vor der Buchung das Datum des letzten Tauchgangs abgefragt werden?
 * Ja für alles, was eine bestehende Zertifizierung voraussetzt (Fun Dives, Specialties,
 * Pro, Ecology, Upgrade → OWD). Nein für Einsteiger ohne Vorzertifikat (Basic Diver, OWD,
 * Scuba Diver, SSI Explorers) und für die Auffrischung selbst.
 */
/** Das Scuba Skills Update selbst (freiwillig als eigenes Produkt gebucht): Last dive wird abgefragt, loest aber KEIN zweites SSU aus. */
export function isSkillsUpdate(productName: string | null | undefined): boolean {
  return (productName ?? '').toLowerCase().includes('scuba skills update')
}

/** Last-dive-Abfrage: Pflicht-Produkte plus das SSU selbst (dort nur zur Info fuer den Instructor). */
export function asksLastDive(productName: string | null | undefined, category?: string | null): boolean {
  return requiresLastDive(productName, category) || isSkillsUpdate(productName)
}

export function requiresLastDive(productName: string | null | undefined, category?: string | null): boolean {
  const n = (productName ?? '').toLowerCase()
  if (n.startsWith('basic diver') || n.includes('try scuba')) return false
  if (n.includes('scuba skills update')) return false
  if (category === 'entry') return n.startsWith('upgrade')
  return ['dives', 'specialty', 'pro', 'ecology'].includes(category ?? '')
}

/**
 * Pro-Programme über mehrere Wochen (Lucas 31.10.): online IMMER als Anfrage, unabhängig von der Saison.
 * Der Gast wählt nur den Wunsch-Starttag und (Pflicht) seinen letzten Tag auf der Insel — das Team plant
 * Instructor, Tage und Versicherung und schickt dann den Zahlungslink. Kein Kapazitäts-Check, kein SSU online.
 */
export const PROGRAM_PRODUCT_IDS = ['divemaster', 'dive-guide'] as const
export function isProgramProduct(id: string | null | undefined): boolean {
  return (PROGRAM_PRODUCT_IDS as readonly string[]).includes(id ?? '')
}
/** Gleiche Regel über den Produktnamen — bookings speichert nur product_name (Instructor-Ticket, alte Buchungen) */
export function isProgramProductName(name: string | null | undefined): boolean {
  return /^(divemaster|dive guide)\b/i.test((name ?? '').trim())
}
