/**
 * Eine Quelle für die Stornobedingungen.
 *
 * Der Wortlaut steht in components/pages/Terms.tsx, viersprachig. Hier steht
 * nur, WELCHE FASSUNG gerade gilt — und die Kurzform der Stufen, die im
 * Buchungsformular und im Check-in direkt neben der Checkbox erscheint.
 *
 * Ändert sich der Text der AGB, muss POLICY_VERSION mitwandern. Sonst liegt in
 * der Datenbank eine Zustimmung, von der niemand mehr weiss, wozu sie gegeben
 * wurde — und genau das macht eine Zustimmung wertlos.
 *
 * Versionshistorie:
 *   2026-09   Erste veröffentlichte Fassung. Stornostaffel 72/48. Abschnitt 6
 *             erlaubt Ablehnung ohne Brevet, nennt aber keine finanzielle Folge.
 *   2026-09b  Abschnitt 6 ergänzt: fehlendes/ungültiges Brevet am Tauchtag gilt
 *             als No-Show gemäss Abschnitt 4 — voller Betrag fällig, keine
 *             Erstattung. Abschnitt 4 erhält in allen vier Sprachen einen
 *             Querverweis auf Abschnitt 6. Stornostaffel unverändert.
 *             Zustimmungen mit Version 2026-09 beziehen sich auf die Fassung
 *             ohne diese Zertifikatsregel; die neue Fassung gilt für Buchungen
 *             ab Datum der Versionierung.
 *   2026-10   Abschnitt 4 und 8 (alle vier Sprachen): Tagesversicherung heisst
 *             jetzt ausdrücklich DAN-Tagesversicherung; nicht erstattbar, sobald
 *             AZD die Police bei DAN gekauft hat (Online-Checkout: bei
 *             Bestätigung der Buchung; Check-in oder Tauchcenter: sofort), vorher
 *             voll erstattbar; ausgenommen auch von Abschnitt 5; kaufbar im
 *             Online-Checkout, beim Online-Check-in oder bei Ankunft im
 *             Tauchcenter. Stornostaffel unverändert.
 *   2026-10b  Abschnitt 4 (alle vier Sprachen): Satz „vor dem Kauf der Police
 *             voll erstattet" entfernt — die AGB regeln nur noch: nach dem Kauf
 *             der Police keine Erstattung.
 */

export const POLICY_VERSION = '2026-10b'
export const POLICY_UPDATED = 'October 2026'
export const TERMS_PATH = '/terms'

export interface PolicyRow {
  window: string
  outcome: string
}

/** Kurzform für Buchungsformular und Check-in. Der verbindliche Text steht in den AGB. */
export const CANCELLATION_SUMMARY: PolicyRow[] = [
  { window: 'More than 72 hours before your dive', outcome: 'Full refund' },
  { window: '48 to 72 hours before', outcome: '50 % refund' },
  { window: 'Less than 48 hours, or no-show', outcome: 'No refund' },
]

/** Bei uns gekaufte DAN-Tagesversicherung ist ab dem Kauf der Police vom Storno ausgenommen (AGB §4, §8). */
export const INSURANCE_NON_REFUNDABLE =
  'DAN day insurance is non-refundable once we have bought the policy from DAN — for online bookings that happens as soon as your booking is confirmed.'

/** Sagt AZD ab, gibt es Ersatztermin oder volle Rückerstattung. */
export const CANCELLATION_BY_US =
  'If we cancel the dive — weather, sea state or safety — you are offered another date or a full refund.'
