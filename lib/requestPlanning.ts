/**
 * Request-Planner (Lucas 28.10.2026): Zuordnung von Wunschtagen zu gewählten Tauchtagen.
 * Reine Funktionen — identisch im Server (/api/booking-request/consolidate), in der Vorschau und im Fairness-Score.
 *
 * Regeln:
 *  - Eine Anfrage mit k Tauchtagen bekommt die k aufeinanderfolgenden gewählten Slots, die ihren Wunschtagen am nächsten
 *    liegen. Weniger Slots als k → sie bekommt alle gewählten (= Kürzung, entscheidet der Aufrufer).
 *  - notEarlier (Default an): kein gewählter Slot darf vor dem jeweiligen Wunschtag liegen (Anreise unbekannt).
 *  - Kapazität: Slots haben freie Plätze; ist der nächste Tag voll, nimmt die Anfrage den zweitnächsten. Große Gruppen
 *    werden zuerst verteilt. Passt nirgends → bester Slot trotzdem, aber `over = true` (Vorschau zeigt rot, Approve lehnt ab).
 *  - MIN_DIVERS_PER_DAY: unter dieser Zahl lohnt ein Tag nicht — Vorschau warnt gelb, kein harter Stopp.
 */
export type Slot = { date: string; session: string }
export type PlanRequest = { id: string; sessions: Slot[]; divers: number; night: boolean }
export type PlanOptions = { notEarlier?: boolean; capacityLeft?: Map<string, number>; minDivers?: number }
export type Assignment = { id: string; target: Slot[]; shiftDays: number; over: boolean; incompatible: boolean; lost: number }

export const MIN_DIVERS_PER_DAY = 4
export const slotKey = (x: Slot) => `${x.date}_${x.session}`

const DAY = 86400_000
const t = (d: string) => new Date(d + 'T12:00:00Z').getTime()

/** Alle Fenster aus k aufeinanderfolgenden Slots, nach Verschiebung sortiert. */
function windows(asked: Slot[], slots: Slot[], notEarlier: boolean): { target: Slot[]; shiftDays: number }[] {
  const wish = [...asked].sort((a, b) => a.date.localeCompare(b.date))
  const k = Math.min(wish.length, slots.length)
  if (k === 0) return []
  const out: { target: Slot[]; shiftDays: number }[] = []
  for (let i = 0; i + k <= slots.length; i++) {
    let cost = 0, earlier = false
    for (let j = 0; j < k; j++) {
      const diff = Math.round((t(slots[i + j].date) - t(wish[j].date)) / DAY)
      if (diff < 0) earlier = true
      cost += Math.abs(diff)
    }
    if (notEarlier && earlier) continue
    out.push({ target: slots.slice(i, i + k), shiftDays: cost })
  }
  return out.sort((a, b) => a.shiftDays - b.shiftDays)
}

export function assignSlots(asked: Slot[], picked: Slot[], opts: { notEarlier?: boolean } = {}): { target: Slot[]; shiftDays: number } {
  const slots = [...picked].sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session))
  const w = windows(asked, slots, opts.notEarlier ?? true)
  if (w.length) return w[0]
  // notEarlier lässt nichts zu → bester Slot trotzdem (Aufrufer sieht die Verschiebung im Score)
  const any = windows(asked, slots, false)
  return any[0] ?? { target: [], shiftDays: 0 }
}

/** Gemeinsame Verteilung mehrerer Anfragen auf die gewählten Slots unter Kapazität. */
export function planAssignments(requests: PlanRequest[], picked: Slot[], opts: PlanOptions = {}): Assignment[] {
  const notEarlier = opts.notEarlier ?? true
  const slots = [...picked].sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session))
  const left = new Map<string, number>(opts.capacityLeft ?? [])
  const order = [...requests].sort((a, b) => b.divers - a.divers || a.sessions[0]?.date.localeCompare(b.sessions[0]?.date ?? '') || 0)
  const out: Assignment[] = []
  for (const r of order) {
    const compatible = slots.filter(x => (x.session === 'night') === r.night)
    if (compatible.length === 0 || r.sessions.length === 0) { out.push({ id: r.id, target: [], shiftDays: 0, over: false, incompatible: true, lost: 0 }); continue }
    let cands = windows(r.sessions, compatible, notEarlier)
    if (cands.length === 0) cands = windows(r.sessions, compatible, false)
    const fits = (w: { target: Slot[] }) => w.target.every(x => !left.has(slotKey(x)) || (left.get(slotKey(x)) ?? 0) >= r.divers)
    const chosen = cands.find(fits) ?? cands[0]
    const over = !fits(chosen)
    for (const x of chosen.target) if (left.has(slotKey(x))) left.set(slotKey(x), (left.get(slotKey(x)) ?? 0) - r.divers)
    out.push({ id: r.id, target: chosen.target, shiftDays: chosen.shiftDays, over, incompatible: false, lost: Math.max(0, r.sessions.length - chosen.target.length) })
  }
  return out
}

/** Taucher je gewähltem Slot nach der Verteilung (für die Vorschau). */
export function slotLoads(requests: PlanRequest[], plan: Assignment[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of plan) {
    const r = requests.find(x => x.id === a.id)
    if (!r) continue
    for (const x of a.target) m.set(slotKey(x), (m.get(slotKey(x)) ?? 0) + r.divers)
  }
  return m
}
