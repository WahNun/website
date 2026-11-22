/**
 * Minderjährige am Boot: Alter am Tauchtag und das zur Zertifizierungsstufe passende Tiefenlimit.
 * Werte nach SSI-Junior-Regeln (Stand 25.10.2026, Lucas bitte gegen die aktuellen SSI-Standards prüfen).
 * Stufen = `customers.experience_level` aus dem Check-in: none | basic | scuba | ow | advanced | dm | instructor.
 */

export function ageOn(dob: string | null | undefined, on: string | Date | null | undefined): number | null {
  if (!dob) return null
  const b = new Date(`${dob.slice(0, 10)}T12:00:00Z`)
  const d = on ? new Date(typeof on === 'string' ? `${on.slice(0, 10)}T12:00:00Z` : on) : new Date()
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null
  let age = d.getUTCFullYear() - b.getUTCFullYear()
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age -= 1
  return age
}

const LEVEL_LABEL: Record<string, string> = {
  none: 'no certification', basic: 'Basic Diver', scuba: 'Scuba Diver', ow: 'Open Water',
  advanced: 'Advanced Open Water', dm: 'Divemaster', instructor: 'Instructor',
}

/** maxM = null: kein Tauchgang ohne Rücksprache (unter 10 oder Stufe unbekannt). */
export function minorDepthLimit(age: number | null, level: string | null | undefined): { maxM: number | null; text: string } {
  const lvl = (level ?? '').trim()
  if (age === null) return { maxM: null, text: 'age unknown — check date of birth' }
  if (age < 10) return { maxM: null, text: 'under 10 — supervised programmes only, ask the instructor' }
  if (!lvl || !(lvl in LEVEL_LABEL)) return { maxM: null, text: 'certification unknown — check the card' }
  let maxM: number
  if (lvl === 'none' || lvl === 'basic') maxM = 6
  else if (lvl === 'scuba') maxM = 12
  else if (age <= 11) maxM = 12
  else if (lvl === 'ow') maxM = 18
  else maxM = age <= 14 ? 21 : 30 // advanced / dm / instructor
  return { maxM, text: `max ${maxM} m (${LEVEL_LABEL[lvl]}${age <= 11 ? ', with parent/guardian or SSI professional' : ''})` }
}

/** Kurztext für Chips und Flag: „15 y · max 18 m“ */
export function minorShort(dob: string | null | undefined, level: string | null | undefined, on?: string | Date | null): string {
  const age = ageOn(dob, on)
  const lim = minorDepthLimit(age, level)
  return `${age === null ? '? y' : `${age} y`} · ${lim.maxM === null ? 'depth limit: check' : `max ${lim.maxM} m`}`
}
