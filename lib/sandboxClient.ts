/** /book?sandbox=1 — nur für eingeloggte Mitarbeiter gedacht; der Server prüft das Token selbst. */
export function isSandboxBooking(): boolean {
  if (typeof window === 'undefined') return false
  try { return new URLSearchParams(window.location.search).get('sandbox') === '1' } catch { return false }
}
