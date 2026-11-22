import type { MouseEvent } from 'react'

/**
 * Datumsauswahl schließen und die Seite dorthin bringen, wo es logisch weitergeht (Lucas 25./26.10.):
 * zum nächsten Schritt unterhalb der Zeile (nächste data-pickrow bzw. data-step, z. B. Equipment / Versicherung),
 * oben im Viewport. Gibt es keinen, wird die Zeile selbst wieder in die Bildschirmmitte geholt.
 * Die Zeile trägt data-pickrow, Folge-Abschnitte data-pickrow oder data-step.
 */
/**
 * Höhe der oben klebenden Navigation + kleiner Abstand: Sprungziele sollen darunter landen, nicht dahinter
 * (Handy ca. 90 px, Desktop ca. 120 px — feste 88 px verdeckten auf dem Desktop die Überschrift).
 */
export function headerOffset(extra = 12): number {
  try {
    let bottom = 0
    document.querySelectorAll<HTMLElement>('nav, header').forEach(el => {
      const cs = getComputedStyle(el)
      if (cs.position !== 'sticky' && cs.position !== 'fixed') return
      const r = el.getBoundingClientRect()
      if (r.height > 0 && r.height < 300 && r.top <= 1) bottom = Math.max(bottom, r.bottom)
    })
    return Math.round((bottom || 88) + extra)
  } catch { return 100 }
}

/** Element unter die klebende Navigation scrollen (Überschrift bleibt sichtbar) */
export function scrollBelowHeader(el: HTMLElement | null | undefined) {
  if (!el) return
  el.style.scrollMarginTop = `${headerOffset()}px`
  el.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

export function closePicker(e: MouseEvent<HTMLElement>, close: () => void) {
  const row = (e.currentTarget as HTMLElement).closest('[data-pickrow]') as HTMLElement | null
  close()
  if (!row) return
  setTimeout(() => {
    try {
      const all = Array.from(document.querySelectorAll<HTMLElement>('[data-pickrow],[data-step]'))
      const next = all.find(el => el !== row && !row.contains(el) && (row.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
      if (next) {
        scrollBelowHeader(next)
      } else row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch (err) { console.warn('[picker] scroll after close failed', err) }
  }, 60)
}
