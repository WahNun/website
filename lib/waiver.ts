/** Waiver-Unterschrift liegt im privaten Bucket "waivers". customers.waiver_pdf_url speichert den Pfad (neu) oder eine alte volle URL.
 *  Für Anzeige im Dashboard: Link auf die Auth-geschützte Route, die auf eine 2-Minuten-Signed-URL weiterleitet. */
export function waiverHref(v: string | null | undefined): string | null {
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return `/api/dashboard/waiver-signature?path=${encodeURIComponent(v)}`
}
