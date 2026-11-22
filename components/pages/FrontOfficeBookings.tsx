'use client'
import { waiverHref } from '@/lib/waiver'
import { depositApproxCents } from '@/lib/onlineDeposit'
import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase, s } from './_shared'
import { useStaffNames } from '@/lib/useStaffNames'
import { auditFromClient } from '@/lib/auditClient'
import { GuestFile, type GuestFileDiver } from '../dashboard/GuestFile'
import SessionPicker, { type Picked, type SessionKey } from '@/components/booking/SessionPicker'
import SlotAssigner from '@/components/booking/SlotAssigner'
import { computeInsuranceBlocks } from '@/lib/insurance'
import { isProgramProduct } from '@/lib/productType'
import { ReasonField, PayoutFields, emptyPayout, payoutString, type PayoutValue } from '@/components/booking/RefundFields'
import { composeReason, reasonError, payoutError, reasonComplete } from '@/lib/refundReasons'
import { useSimulation } from '@/lib/useSimulation'
import { sessionRank } from '@/lib/availability'
import { PAYMENT_STATE_LABEL, PAYMENT_STATE_COLOR, type PaymentState } from '@/lib/paymentState'
import { assignSlots, planAssignments, slotLoads, slotKey, MIN_DIVERS_PER_DAY, type PlanRequest } from '@/lib/requestPlanning'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string
  booking_date: string
  session: string | null
  product_name: string | null
  customer_name: string | null
  customer_email: string | null
  group_size: number
  status: string
  /** Zahlungsstatus aus dem Ledger (getrennt vom Lebenszyklus `status`) */
  payment_state?: PaymentState | null
  amount: number | null
  currency: string | null
  payment_method: string | null
  stripe_payment_intent: string | null
  stripe_session_id: string | null
  staff_notes: string | null
  is_test: boolean
  created_at: string
  refunded_at: string | null
  refunded_amount_cents?: number | null
  refund_paid_at?: string | null
  paid_at: string | null
  checkin_token: string | null
  checkin_completed_at: string | null
  source: string | null
  sessions: string | null
  price_cents: number | null
  sessions_expected: number | null
  insurance_choice?: 'azd' | 'own' | null
  parent_booking_id: string | null
  booking_extras: Record<string, unknown> | null
  /** Request-Booking (Low Season): requested → approved → converted | declined | expired; null = normale Buchung */
  request_state?: 'requested' | 'approved' | 'converted' | 'declined' | 'expired' | null
  request_payment_mode?: 'full' | 'deposit' | null
  approved_until?: string | null
  approved_by_email?: string | null
  declined_reason?: string | null
  request_token?: string | null
}

interface CourseProduct {
  id: string
  name: string
  category: string
  price_cents: number
  sessions_included?: number | null
  duration_days_min?: number | null
  boat_days?: number | null
}

interface BookingPayment {
  id: string
  booking_id: string
  amount: number
  currency: string
  status: 'pending' | 'paid' | 'refunded'
  method: string
  stripe_payment_intent_id: string | null
  due_at: string | null
  paid_at: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
}

interface BookingSession {
  id: string
  booking_id: string
  session_date: string
  session: string
  boat_id: string | null
  seats: number
  status: string
  is_boat_day: boolean
  notes: string | null
}

interface ChangelogEntry {
  id: string
  booking_id: string
  changed_by_email: string | null
  changed_at: string
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  description: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Lebenszyklus: pending → confirmed → completed | no_show | cancelled. Geld steht in payment_state (eigenes Badge).
const STATUS_BG: Record<string, string> = {
  confirmed: 'rgba(243,239,230,.16)',
  completed: 'rgba(74,222,128,.14)',
  no_show:   'rgba(138,143,153,.18)',
  cancelled: 'rgba(255,100,100,.16)',
  pending:   'rgba(255,208,128,.14)',
}
const STATUS_CLR: Record<string, string> = {
  confirmed: '#f3efe6',
  completed: '#4ade80',
  no_show:   '#8a8f99',
  cancelled: '#ff6464',
  pending:   '#ffd080',
}
// ─── Request planner (Low Season, Lucas 28.10.2026) ──────────────────────────
// Offene Anfragen nach Kalenderwoche: Taucher je Tag/Schicht, Häkchen → auf EINEN Tauchtag legen → gesammelt freigeben.
type PlannerRow = { id: string; product_name: string | null; customer_email: string | null; customer_name: string | null; group_size: number; amount: number | null; request_state: string | null; approved_until: string | null; created_at: string; is_test: boolean; sessions: { date: string; session: string }[]; movable: boolean; why: string }
function isoWeek(date: string): string {
  const d = new Date(date + 'T12:00:00Z'); const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(y, 0, 4)); const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
  return `${y}-W${String(week).padStart(2, '0')}`
}
function RequestPlanner({ showTest, onChanged, onOpen, selectedId }: { showTest: boolean; onChanged: () => void; onOpen: (id: string) => void; selectedId: string | null }) {
  const [rows, setRows] = useState<PlannerRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [targetSlots, setTargetSlots] = useState<Picked[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deposit, setDeposit] = useState(false)
  const mode: 'full' | 'deposit' = deposit ? 'deposit' : 'full'
  const [notEarlier, setNotEarlier] = useState(true)
  // Kapazität der gewählten Tage (booked/capacity) für die Verteilung und die Warnungen
  const [capacity, setCapacity] = useState<Map<string, { booked: number; capacity: number }>>(new Map())
  useEffect(() => {
    if (targetSlots.length === 0) { setCapacity(new Map()); return }
    const dates = targetSlots.map(x => x.date).sort()
    let alive = true
    fetch(`/api/availability?from=${dates[0]}&to=${dates[dates.length - 1]}${showTest ? '&sandbox=1' : ''}`).then(r => r.json()).then(d => {
      if (!alive) return
      const m = new Map<string, { booked: number; capacity: number }>()
      for (const a of (d?.sessions ?? []) as { date: string; session: string; booked: number; capacity: number }[]) m.set(slotKey({ date: a.date, session: a.session }), { booked: a.booked, capacity: a.capacity })
      setCapacity(m)
    }).catch(() => { if (alive) setCapacity(new Map()) })
    return () => { alive = false }
  }, [targetSlots, showTest])
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [kidsOf, setKidsOf] = useState<Set<string>>(new Set())
  // Vorschau: was würde „Move" tun (Kürzungen!) — gleiche Route mit preview:true
  type MovePreview = { booking_id: string; ok: boolean; moved_from?: string; error?: string; shortened?: { from_product: string; to_product: string; from_cents: number; to_cents: number } }
  const [movePreview, setMovePreview] = useState<MovePreview[] | null>(null)

  const load = useCallback(async () => {
    const { data: bs, error } = await supabase.from('bookings')
      .select('id, product_name, customer_email, customer_name, group_size, amount, request_state, approved_until, created_at, is_test, parent_booking_id')
      .eq('is_test', showTest).eq('status', 'pending').in('request_state', ['requested', 'approved', 'expired']).order('created_at')
    if (error) { setErr(error.message); setRows([]); return }
    setErr(null)
    const list = (bs ?? []) as { id: string; product_name: string | null; customer_email: string | null; customer_name: string | null; group_size: number; amount: number | null; request_state: string | null; approved_until: string | null; created_at: string; is_test: boolean; parent_booking_id: string | null }[]
    const parents = list.filter(b => !b.parent_booking_id)
    const kidParents = new Set(list.filter(b => b.parent_booking_id).map(b => b.parent_booking_id as string))
    setKidsOf(kidParents)
    const ids = parents.map(b => b.id)
    const { data: ss } = ids.length ? await supabase.from('booking_sessions').select('booking_id, session_date, session, status').in('booking_id', ids).eq('status', 'booked').order('session_date') : { data: [] }
    const byB = new Map<string, { date: string; session: string }[]>()
    for (const x of (ss ?? []) as { booking_id: string; session_date: string; session: string }[]) byB.set(x.booking_id, [...(byB.get(x.booking_id) ?? []), { date: x.session_date, session: x.session }])
    setRows(parents.map(b => {
      const sessions = byB.get(b.id) ?? []
      const split = kidParents.has(b.id)
      const awaiting = b.request_state === 'approved'
      const movable = !awaiting && !split && sessions.length > 0 && !sessions.some(x => x.session === 'tbd')
      return { ...b, sessions, movable, why: awaiting ? 'awaiting guest confirmation' : split ? 'split request' : sessions.some(x => x.session === 'tbd') ? 'course day' : sessions.length === 0 ? 'no date' : '' }
    }))
  }, [showTest])
  useEffect(() => { void load() }, [load])

  async function token() { return (await supabase.auth.getSession()).data.session?.access_token ?? '' }
  useEffect(() => {
    if (sel.size === 0 || targetSlots.length === 0 || pickerOpen) { setMovePreview(null); return }
    let alive = true
    const h = setTimeout(async () => {
      try {
        const slots = targetSlots.filter(x => x.session !== 'tbd').map(x => ({ date: x.date, session: x.session }))
        const r = await fetch('/api/booking-request/consolidate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await token()}` }, body: JSON.stringify({ booking_ids: [...sel], slots, preview: true, not_earlier: notEarlier }) })
        const d = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) { setMovePreview([{ booking_id: '', ok: false, error: `${d.error ?? 'Preview failed'} (HTTP ${r.status})` }]); return }
        setMovePreview(d.results ?? [])
      } catch (e) { if (alive) setMovePreview([{ booking_id: '', ok: false, error: e instanceof Error ? e.message : String(e) }]) }
    }, 250)
    return () => { alive = false; clearTimeout(h) }
  }, [sel, targetSlots, pickerOpen, notEarlier]) // eslint-disable-line react-hooks/exhaustive-deps
  async function approveSelected() {
    if (sel.size === 0) return
    const slots = targetSlots.filter(x => x.session !== 'tbd').map(x => ({ date: x.date, session: x.session }))
    if (slots.length === 0) { setLog(['Pick the dive day(s) first.']); return }
    // Kein zweiter Browser-Dialog (Lucas 28.10.): der Button sagt, was passiert; die Summary zeigt es vorher.
    setBusy('approve'); setLog([])
    const out: string[] = []
    const t = await token()
    const nameOf = (id: string) => { const r = (rows ?? []).find(x => x.id === id); return r?.customer_name || r?.customer_email || id.slice(0, 8) }
    let toApprove = [...sel]
    // Tage gewählt: erst verschieben/kürzen (wie in der Vorschau), dann freigeben — nur die, bei denen das geklappt hat
    if (slots.length > 0) {
      try {
        const r = await fetch('/api/booking-request/consolidate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ booking_ids: toApprove, slots, not_earlier: notEarlier }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(`${d.error ?? 'Moving dates failed'} (HTTP ${r.status})`)
        const results = (d.results ?? []) as { booking_id: string; ok: boolean; moved_from?: string; note?: string; error?: string }[]
        for (const x of results) if (!x.ok) out.push(`${nameOf(x.booking_id)}: not approved — ${x.error}`)
        toApprove = results.filter(x => x.ok).map(x => x.booking_id)
        setLog([...out])
      } catch (e) { setLog([e instanceof Error ? e.message : String(e)]); setBusy(null); return }
    }
    for (const id of toApprove) {
      try {
        const r = await fetch('/api/booking-request/approve', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ booking_id: id, mode }) })
        const d = await r.json().catch(() => ({}))
        const mailProblem = d.mail_error ? (/422|Invalid `to`|invalid/i.test(String(d.mail_error)) ? 'the email address is invalid' : 'the email could not be sent') : null
        out.push(`${nameOf(id)}: ${r.ok
          ? mailProblem
            ? `approved, but ${mailProblem} — open the booking and use “Resend email” after fixing the address`
            : `email sent — asked to confirm and pay €${((d.amount_cents ?? 0) / 100).toFixed(2)}`
          : `not approved — ${d.error ?? 'something went wrong'}`}`)
      } catch (e) { out.push(`${nameOf(id)}: not approved — ${e instanceof Error ? e.message : String(e)}`) }
      setLog([...out])
    }
    setSel(new Set()); setTargetSlots([]); setMovePreview(null); await load(); onChanged(); setBusy(null)
  }

  const weeks = new Map<string, PlannerRow[]>()
  for (const r of rows ?? []) { const k = r.sessions[0] ? isoWeek(r.sessions[0].date) : 'no date'; weeks.set(k, [...(weeks.get(k) ?? []), r]) }
  const weekKeys = [...weeks.keys()].sort()
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const divers = (list: PlannerRow[]) => list.reduce((a, r) => a + Math.max(1, r.group_size), 0)
  const fmtD = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y.slice(2)}` }
  const selectedDivers = (rows ?? []).filter(r => sel.has(r.id)).reduce((a, r) => a + Math.max(1, r.group_size), 0)
  const maxDaysNeeded = (rows ?? []).filter(r => sel.has(r.id)).reduce((a, r) => Math.max(a, r.sessions.length), 0)
  const check: React.CSSProperties = { fontSize: '12px', color: s.muted, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', whiteSpace: 'nowrap' }
  // Ruhige Optik: Ghost-Buttons, nur die Hauptaktion (Approve) ist gefüllt
  const ghost = (disabled: boolean, active = false): React.CSSProperties => ({ padding: '7px 12px', borderRadius: '7px', border: `1px solid ${active ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.14)'}`, background: 'transparent', color: disabled ? s.muted : s.text, fontSize: '12px', fontWeight: 700, fontFamily: s.font, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1 })
  const primary = (disabled: boolean): React.CSSProperties => ({ padding: '7px 14px', borderRadius: '7px', border: 'none', background: s.accent, color: '#090909', fontSize: '12px', fontWeight: 800, fontFamily: s.font, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .4 : 1 })

  const selectedRows = (rows ?? []).filter(r => sel.has(r.id))
  const selectedTotal = selectedRows.reduce((a, r) => a + (r.amount ?? 0), 0)
  const planReqs: PlanRequest[] = selectedRows.filter(r => r.movable).map(r => ({ id: r.id, sessions: r.sessions, divers: Math.max(1, r.group_size), night: /night/i.test(r.product_name ?? '') }))
  const pickedSlots = targetSlots.filter(x => x.session !== 'tbd').map(x => ({ date: x.date, session: x.session as string }))
  const capLeft = new Map<string, number>([...capacity.entries()].map(([k, v]) => [k, Math.max(0, v.capacity - v.booked)]))
  const plan = pickedSlots.length ? planAssignments(planReqs, pickedSlots, { notEarlier, capacityLeft: capLeft }) : []
  const planById = new Map(plan.map(a => [a.id, a]))
  const loads = slotLoads(planReqs, plan)
  // Umsatz je gewähltem Slot (Schätzung: gekürzte Packs anteilig; der Server rechnet exakt)
  const slotRevenue = new Map<string, number>()
  for (const a of plan) {
    const r = selectedRows.find(x => x.id === a.id)
    if (!r || a.target.length === 0 || a.over) continue
    const perDay = (r.amount ?? 0) / Math.max(1, r.sessions.length)
    for (const x of a.target) slotRevenue.set(slotKey(x), (slotRevenue.get(slotKey(x)) ?? 0) + perDay)
  }
  const pickedExtra = (p: { date: string; session: string }) => {
    if (p.session === 'tbd') return null
    const k = slotKey(p); const n = loads.get(k) ?? 0; const rev = slotRevenue.get(k) ?? 0
    return `${n} diver${n === 1 ? '' : 's'} · €${(rev / 100).toFixed(0)}`
  }
  // ── Fairness-Score je Kandidatentag (Lucas 28.10.): Verschiebung 1/Tag, falsche Schicht 0.5, Kürzung 2/verlorenem Tag,
  // Night↔Tag unvereinbar 4 — gewichtet nach Tauchern; Score = 100 − 15 × Mittelwert. Grün ≥ 85, Gelb ≥ 60, sonst Orange.
  const dayMs = 86400_000
  const toDate = (d: string) => new Date(d + 'T12:00:00').getTime()
  const fairness = (date: string, session: string, picks: number, slotSet?: { date: string; session: string }[]) => {
    const movable = selectedRows.filter(r => r.movable && r.sessions.length > 0)
    if (movable.length === 0) return null
    const set = slotSet && slotSet.length ? slotSet.filter(x => x.session !== 'tbd') : [{ date, session }]
    let wsum = 0, cost = 0, shortened = 0, fits = 0, shiftSum = 0, revenue = 0
    for (const r of movable) {
      const w = Math.max(1, r.group_size); wsum += w
      const night = /night/i.test(r.product_name ?? '')
      const compatible = set.filter(x => (x.session === 'night') === night)
      if (compatible.length === 0) { cost += 4 * w; continue }
      fits += w
      const { target, shiftDays } = assignSlots(r.sessions, compatible, { notEarlier })
      // „never earlier": liegt der zugewiesene Tag vor dem Wunschtag, passt die Anfrage hier nicht (wie Night↔Tag)
      if (notEarlier && target[0] && target[0].date < [...r.sessions].sort((a, b) => a.date.localeCompare(b.date))[0].date) { cost += 4 * w; fits -= w; continue }
      const shift = shiftDays / Math.max(1, target.length)
      shiftSum += shift * w
      let c = shift
      if (target[0] && r.sessions[0].session !== target[0].session) c += 0.5
      const lost = Math.max(0, r.sessions.length - (slotSet ? target.length : picks))
      if (lost > 0) { c += 2 * lost; shortened += 1 }
      cost += c * w
      // Umsatz-Schätzung: Kürzung anteilig nach Tagen (exakt rechnet der Server nach der Tageswahl)
      revenue += Math.round((r.amount ?? 0) * (r.sessions.length - lost) / Math.max(1, r.sessions.length))
    }
    const score = Math.max(0, Math.min(100, Math.round(100 - 15 * (cost / wsum))))
    return { score, avgShift: fits ? shiftSum / fits : 0, shortened, fits, total: wsum, revenue, color: score >= 85 ? '#4fe3c8' : score >= 60 ? '#ffd080' : '#ffa040' }
  }
  const slotHint = (date: string, session: 'am' | 'pm' | 'night') => {
    const f = fairness(date, session, Math.max(1, targetSlots.length || 1))
    if (!f) return null
    return { color: relColor(f.score), title: `Fairness ${f.score}/100 · avg shift ${f.avgShift.toFixed(1)} day${f.avgShift === 1 ? '' : 's'} · ${f.shortened} shortened · fits ${f.fits} of ${f.total} divers${candidates.some(c => c.revenue !== candidates[0]?.revenue) ? ` · est. revenue €${(f.revenue / 100).toFixed(0)}` : ''}` }
  }
  const candidates = (() => {
    if (selectedRows.length === 0) return []
    const dates = selectedRows.flatMap(r => r.sessions.map(x => x.date)).sort()
    if (dates.length === 0) return []
    const from = toDate(dates[0]) - 3 * dayMs, to = toDate(dates[dates.length - 1]) + 3 * dayMs
    const out: { date: string; session: 'am' | 'pm' | 'night'; score: number; color: string; revenue: number }[] = []
    const today = new Date().toISOString().slice(0, 10)
    for (let t = from; t <= to; t += dayMs) {
      const d = new Date(t).toISOString().slice(0, 10)
      if (d < today) continue
      for (const sess of ['am', 'pm', 'night'] as const) {
        const f = fairness(d, sess, 1)
        if (f && f.fits > 0) out.push({ date: d, session: sess, score: f.score, color: f.color, revenue: f.revenue })
      }
    }
    return out
  })()
  const bestDays = [...candidates].sort((a, b) => b.score - a.score || b.revenue - a.revenue || a.date.localeCompare(b.date)).slice(0, 3)
  // Farbe relativ zur Auswahl: bester Kandidat grün, schlechtester orange, dazwischen Verlauf — absolute Schwellen würden
  // bei verstreuten Wünschen alles orange färben und die Rangfolge verschlucken
  const scoreRange = candidates.length ? { min: Math.min(...candidates.map(c => c.score)), max: Math.max(...candidates.map(c => c.score)) } : { min: 0, max: 100 }
  const relColor = (score: number) => {
    const t = scoreRange.max === scoreRange.min ? 1 : (score - scoreRange.min) / (scoreRange.max - scoreRange.min)
    const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k))
    const orange = [255, 160, 64], yellow = [255, 208, 128], green = [79, 227, 200]
    const rgb = t < 0.5 ? mix(orange, yellow, t / 0.5) : mix(yellow, green, (t - 0.5) / 0.5)
    return `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`
  }
  const bestKeys = new Set(bestDays.map(b => b.date))
  const dayHint = (date: string) => {
    const c = candidates.filter(x => x.date === date && x.session !== 'night')
    if (c.length === 0) return null
    const best = c.reduce((m, x) => x.score > m.score ? x : m, c[0])
    return { color: relColor(best.score), ring: bestKeys.has(date) }
  }
  const richestDays = [...candidates].sort((a, b) => b.revenue - a.revenue || b.score - a.score || a.date.localeCompare(b.date)).slice(0, 3)
  const maxRevenue = candidates.reduce((m, c) => Math.max(m, c.revenue), 0)
  return (
    <div style={{ marginBottom: '16px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: s.text }}>Open requests <span style={{ fontWeight: 500, color: s.muted }}>{rows ? `· ${rows.filter(r => r.request_state !== 'approved').length} to plan · ${rows.filter(r => r.request_state === 'approved').length} awaiting guest · ${divers(rows)} diver${divers(rows) === 1 ? '' : 's'}` : ''}</span></span>
        <span style={{ fontSize: '12px', color: s.muted }}>Click a row to select it · click the reference to open the booking</span>
      </div>
      {err && <div style={{ fontSize: '12px', color: '#ff8b70', marginBottom: '8px' }}>Could not load requests: {err}</div>}
      {rows && rows.length === 0 && <div style={{ fontSize: '13px', color: s.muted, padding: '24px 0' }}>No open requests. Approved and paid requests move to Booking History.</div>}
      {weekKeys.map(wk => {
        const list = weeks.get(wk)!
        const perSlot = new Map<string, number>()
        for (const r of list) for (const x of r.sessions) perSlot.set(`${x.date} ${x.session.toUpperCase()}`, (perSlot.get(`${x.date} ${x.session.toUpperCase()}`) ?? 0) + Math.max(1, r.group_size))
        return (
          <div key={wk} style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', padding: '0 4px 8px', fontSize: '12px' }}>
              <span style={{ fontWeight: 700, color: s.muted, letterSpacing: '.06em', textTransform: 'uppercase' }}>Week {wk.slice(6)} · {wk.slice(0, 4)} <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {divers(list)} diver{divers(list) === 1 ? '' : 's'} in {list.length} request{list.length === 1 ? '' : 's'}</span></span>
              {perSlot.size > 1 && <span style={{ color: s.muted }}>{[...perSlot.entries()].sort().map(([k, n]) => `${fmtD(k.split(' ')[0])} ${k.split(' ')[1]}: ${n}`).join(' · ')}</span>}
            </div>
            <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: '12px', overflow: 'hidden' }}>
              {(() => {
                const toPlan = list.filter(r => r.request_state !== 'approved')
                const awaiting = list.filter(r => r.request_state === 'approved')
                const ordered = [...toPlan, ...awaiting]
                return ordered.map((r, i) => (<React.Fragment key={r.id}>
                {awaiting.length > 0 && i === toPlan.length && (
                  <div style={{ padding: '6px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, background: 'rgba(255,255,255,.03)', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.06)' }}>
                    Waiting for guest confirmation ({awaiting.length}) — not plannable
                  </div>
                )}
                <div onClick={() => { if (r.movable) toggle(r.id) }} style={{ display: 'grid', gridTemplateColumns: '26px minmax(170px, 1fr) minmax(160px, 1.2fr) minmax(180px, 1.4fr) 70px', gap: '14px', alignItems: 'center', padding: '14px 16px', fontSize: '13px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.06)', cursor: r.movable ? 'pointer' : 'default', background: sel.has(r.id) ? 'rgba(243,239,230,.06)' : selectedId === r.id ? 'rgba(255,255,255,.03)' : 'transparent', userSelect: 'none', opacity: r.request_state === 'approved' ? .6 : 1 }}>
                  <input type="checkbox" checked={sel.has(r.id)} disabled={!r.movable} readOnly onClick={e => { e.stopPropagation(); if (r.movable) toggle(r.id) }} title={r.movable ? 'Select for planning' : r.request_state === 'approved' ? 'Waiting for the guest — open the booking to resend, reopen or decline' : `${r.why} — move dates in the Sessions tab`} style={{ accentColor: s.accent, width: '16px', height: '16px', cursor: r.movable ? 'pointer' : 'not-allowed' }} />
                  <div>
                    <div style={{ color: s.text, fontWeight: 800, fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>{r.sessions.map(x => `${fmtD(x.date)} ${x.session.toUpperCase()}`).join(' · ') || 'no date'}</div>
                    <div style={{ fontSize: '11.5px', marginTop: '3px' }}>
                      {r.request_state === 'approved'
                        ? <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: '999px', border: '1px solid rgba(243,239,230,.35)', color: s.accent, fontWeight: 700, fontSize: '10.5px', letterSpacing: '.05em', textTransform: 'uppercase' }}>Awaiting guest{r.approved_until && new Date(r.approved_until).getTime() < Date.now() ? ' · overdue' : ''}</span>
                        : <span style={{ color: s.muted }}>{`to plan${r.why ? ` · ${r.why}` : ''}${r.request_state === 'expired' ? ' · overdue' : ''}`}</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product_name ?? '—'}{kidsOf.has(r.id) ? ' + linked guests' : ''}</div>
                    <button type="button" onClick={e => { e.stopPropagation(); onOpen(r.id) }} title="Open this booking (details, approve, decline, sessions)"
                      style={{ marginTop: '3px', fontSize: '11.5px', fontFamily: 'monospace', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(243,239,230,.18)', background: 'rgba(243,239,230,.05)', color: 'rgba(243,239,230,.7)', cursor: 'pointer', letterSpacing: '.03em' }}>
                      {r.id.slice(0, 8)} ↗
                    </button>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_name ?? '—'}</div>
                    <div style={{ color: s.muted, fontSize: '11.5px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_email ?? '—'}</div>
                  </div>
                  <div style={{ color: s.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.group_size} <span style={{ color: s.muted }}>diver{r.group_size === 1 ? '' : 's'}</span></div>
                </div>
                </React.Fragment>))
              })()}
            </div>
          </div>
        )
      })}
    </div>
      {rows && rows.length > 0 && !selectedId && (
        <div style={{ width: '440px', flexShrink: 0, position: 'sticky', top: '100px', padding: '20px 22px', borderRadius: '14px', border: '1px solid rgba(243,239,230,.2)', background: 'rgba(10,33,61,.6)', display: 'flex', flexDirection: 'column', gap: '14px', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: s.muted }}>Selected requests</div>
          {selectedRows.length === 0 ? (
            <div style={{ fontSize: '13px', color: s.muted, lineHeight: 1.6 }}>Tick requests on the left to plan a dive day and approve them together.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {selectedRows.map(r => {
                const pv = movePreview?.find(x => x.booking_id === r.id) ?? null
                const asg = planById.get(r.id)
                const toDays = targetSlots.length && asg && asg.target.length ? asg.target.map(x => `${fmtD(x.date)} ${x.session.toUpperCase()}`).join(' · ') : (targetSlots.length ? '—' : null)
                const overCap = Boolean(asg?.over)
                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: '13px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: s.text, fontWeight: 700 }}>{r.customer_name ?? r.customer_email ?? '—'} <span style={{ color: s.muted, fontWeight: 500 }}>· {r.group_size} diver{r.group_size === 1 ? '' : 's'}</span></div>
                      <div style={{ color: s.muted, fontSize: '12.5px', marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>asked: {r.product_name ?? '—'} · {r.sessions.map(x => `${fmtD(x.date)} ${x.session.toUpperCase()}`).join(' · ')}</div>
                      {toDays && (
                        <div style={{ fontSize: '12.5px', marginTop: '2px', fontVariantNumeric: 'tabular-nums', color: (pv && !pv.ok) || overCap ? '#ff8b70' : pv?.shortened ? '#ffc470' : s.accent }}>
                          {pv && !pv.ok ? `stays as asked — ${pv.error}`
                            : overCap ? `gets: ${toDays} — boat full, will be skipped`
                            : pv?.shortened ? `gets: ${pv.shortened.to_product} · ${toDays} · €${(pv.shortened.to_cents / 100).toFixed(2)} (shortened from ${pv.shortened.from_product})`
                            : `gets: ${toDays}`}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                      <span style={{ color: s.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>€{((pv?.shortened ? pv.shortened.to_cents : (r.amount ?? 0)) / 100).toFixed(2)}</span>
                      {pv?.shortened && <span style={{ color: s.muted, fontSize: '11px', textDecoration: 'line-through' }}>€{((r.amount ?? 0) / 100).toFixed(2)}</span>}
                      <button type="button" onClick={() => toggle(r.id)} style={{ background: 'none', border: 'none', padding: 0, color: s.muted, fontSize: '11px', cursor: 'pointer', fontFamily: s.font }}>remove</button>
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: '13px' }}>
                <span style={{ color: s.text, fontWeight: 800 }}>{selectedRows.length} request{selectedRows.length === 1 ? '' : 's'} · {selectedDivers} diver{selectedDivers === 1 ? '' : 's'}</span>
                <span style={{ color: s.accent, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>€{(selectedRows.reduce((a, r) => { const pv = movePreview?.find(x => x.booking_id === r.id); return a + (pv?.shortened ? pv.shortened.to_cents : (r.amount ?? 0)) }, 0) / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted }}>1 · Dive day(s) you will run <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>— the selected requests are moved there</span></span>
            <button type="button" onClick={() => setPickerOpen(o => !o)} style={{ ...ghost(false, pickerOpen), padding: '10px 12px', fontSize: '13px' }}>
              {targetSlots.length === 0 ? 'Pick dive day(s)' : 'Change days'}
            </button>
            {targetSlots.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pickedSlots.map(x => {
                  const k = slotKey(x); const n = loads.get(k) ?? 0; const cap = capacity.get(k)
                  const free = cap ? Math.max(0, cap.capacity - cap.booked) : null
                  const tooMany = free !== null && n > free
                  const tooFew = n > 0 && n < MIN_DIVERS_PER_DAY
                  const tone = tooMany ? '#ff8b70' : tooFew || n === 0 ? '#ffc470' : '#4fe3c8'
                  return (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 10px', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${tone}55`, background: `${tone}0d` }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: s.text, fontVariantNumeric: 'tabular-nums' }}>{fmtD(x.date)} {x.session.toUpperCase()}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: tone, textAlign: 'right' }}>{tooMany ? `over by ${n - (free ?? 0)}` : n === 0 ? 'nobody — drop this day?' : tooFew ? `only ${n} — below ${MIN_DIVERS_PER_DAY}` : 'ok'}</span>
                      <span style={{ gridColumn: '1 / -1', fontSize: '12.5px', color: s.muted }}><b style={{ color: s.text }}>{n}</b> diver{n === 1 ? '' : 's'} · €{((slotRevenue.get(k) ?? 0) / 100).toFixed(0)}{cap ? ` · ${cap.booked} already booked of ${cap.capacity} seats` : ''}</span>
                    </div>
                  )
                })}
                <label style={{ ...check, fontSize: '12.5px' }}><input type="checkbox" checked={notEarlier} onChange={e => setNotEarlier(e.target.checked)} style={{ accentColor: s.accent }} /> never earlier than asked (guests may not have arrived yet)</label>
              </div>
            )}
            {targetSlots.length > 0 && (() => { const f = fairness(targetSlots[0].date, targetSlots[0].session, targetSlots.length, targetSlots); return f ? (
              <div style={{ fontSize: '12.5px', color: f.color, lineHeight: 1.5 }}>Fairness {f.score}/100 · avg shift {f.avgShift.toFixed(1)} day{f.avgShift === 1 ? '' : 's'} · {f.shortened} shortened · fits {f.fits} of {f.total} divers{maxRevenue > 0 && f.revenue < maxRevenue ? ` · revenue ${Math.round(100 * f.revenue / maxRevenue)} % of best possible` : ''}</div>
            ) : null })()}
            {movePreview?.some(x => !x.booking_id && !x.ok) && <div style={{ fontSize: '11.5px', color: '#ff8b70' }}>{movePreview.find(x => !x.booking_id)?.error}</div>}
            {targetSlots.length > 0 && <button type="button" onClick={() => { setTargetSlots([]); setMovePreview(null) }} style={{ background: 'none', border: 'none', padding: 0, color: s.muted, fontSize: '12.5px', cursor: 'pointer', fontFamily: s.font, textAlign: 'left', textDecoration: 'underline' }}>Clear days</button>}
            {pickerOpen && typeof document !== 'undefined' && createPortal(
              <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 10000, background: 'rgba(9,9,9,.72)', overflowY: 'auto', padding: '24px 20px', boxSizing: 'border-box' }}>
              <div onClick={e => e.stopPropagation()} style={{ margin: '0 auto', background: '#07152a', border: '1px solid rgba(243,239,230,.3)', borderRadius: '12px', padding: '20px 22px', width: 'min(960px, 100%)', boxSizing: 'border-box', boxShadow: '0 16px 56px rgba(0,0,0,.75)' }}>
                <div style={{ fontSize: '12px', color: s.muted, marginBottom: '10px', lineHeight: 1.5 }}>Pick the day(s) you will run. Each request goes to the picked day closest to its wish (packs to the closest consecutive days); packs with more days than picked are shortened — the summary shows exactly what each guest gets before you approve.{maxDaysNeeded > 1 ? ` Longest selected request: ${maxDaysNeeded} days.` : ''}</div>
                {bestDays.length > 0 && (() => {
                  const key = (b: { date: string; session: string }) => `${b.date}_${b.session}`
                  const revenueVaries = candidates.some(c => c.revenue !== candidates[0].revenue)
                  const same = !revenueVaries || (bestDays.length === richestDays.length && bestDays.every((b, i) => key(b) === key(richestDays[i])))
                  const fairChip = (b: typeof bestDays[number]) => (
                    <button key={`f_${key(b)}`} type="button" onClick={() => setTargetSlots([{ date: b.date, session: b.session as SessionKey }])} title={`Fairness ${b.score}/100 · est. €${(b.revenue / 100).toFixed(0)}`}
                      style={{ padding: '4px 10px', borderRadius: '999px', border: `1px solid ${relColor(b.score)}`, background: `${relColor(b.score)}14`, color: relColor(b.score), fontSize: '12px', fontWeight: 700, fontFamily: s.font, cursor: 'pointer' }}>
                      {fmtD(b.date)} {b.session.toUpperCase()} <span style={{ fontWeight: 500, opacity: .8 }}>· {b.score}</span>
                    </button>
                  )
                  const revChip = (b: typeof richestDays[number]) => (
                    <button key={`r_${key(b)}`} type="button" onClick={() => setTargetSlots([{ date: b.date, session: b.session as SessionKey }])} title={`Est. €${(b.revenue / 100).toFixed(0)} · fairness ${b.score}/100`}
                      style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '12px', fontWeight: 700, fontFamily: s.font, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                      €{(b.revenue / 100).toFixed(0)} <span style={{ fontWeight: 500, color: s.muted }}>· {fmtD(b.date)} {b.session.toUpperCase()}</span>
                    </button>
                  )
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', alignItems: 'center', marginBottom: '12px', fontSize: '12px' }}>
                      {same ? (
                        <>
                          <span style={{ color: s.muted }}>Fairest days</span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>{bestDays.map(fairChip)}<span style={{ color: s.muted, fontSize: '11px' }}>{revenueVaries ? `also the highest revenue (est. €${(bestDays[0].revenue / 100).toFixed(0)})` : `revenue is the same on every day for this selection (est. €${(bestDays[0].revenue / 100).toFixed(0)})`}</span></div>
                        </>
                      ) : (
                        <>
                          <span style={{ color: s.muted }}>Fairest</span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{bestDays.map(fairChip)}</div>
                          <span style={{ color: s.muted }}>Highest revenue</span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{richestDays.map(revChip)}</div>
                        </>
                      )}
                      <span style={{ gridColumn: '1 / -1', color: s.muted, fontSize: '11px' }}>Day tiles are coloured relative to this selection — greenest = fairest, orange = least fair; the three suggested days have a bright outline.{revenueVaries ? ' Square chips = estimated revenue for one day (differs because packs would be shortened or night dives don’t fit).' : ''} Hold the mouse over an AM or PM button to see the score (0–100), average shift and who fits.</span>
                    </div>
                  )
                })()}
                <label style={{ ...check, marginBottom: '10px' }}><input type="checkbox" checked={notEarlier} onChange={e => setNotEarlier(e.target.checked)} style={{ accentColor: s.accent }} /> Never earlier than asked — guests may not have arrived yet (affects colours and placement)</label>
                <SessionPicker staffMode freePick required={Math.max(1, maxDaysNeeded)} seats={Math.max(1, selectedDivers)} picked={targetSlots} onChange={next => setTargetSlots(next)}
                  initialMonth={targetSlots[0]?.date ?? bestDays[0]?.date ?? selectedRows.flatMap(r => r.sessions.map(x => x.date)).sort()[0]} slotHint={slotHint} dayHint={dayHint} pickedExtra={pickedExtra} />
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => setTargetSlots([])} style={ghost(false)}>Clear</button>
                  <button type="button" onClick={() => setPickerOpen(false)} style={primary(false)}>Done</button>
                </div>
              </div>
              </div>,
              document.body
            )}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted }}>2 · Approve</span>
            <label style={check}><input type="checkbox" checked={deposit} onChange={e => setDeposit(e.target.checked)} style={{ accentColor: s.accent }} /> 50 % deposit instead of full amount</label>
            <button type="button" disabled={!!busy || sel.size === 0 || targetSlots.length === 0} onClick={approveSelected} style={{ ...primary(!!busy || sel.size === 0 || targetSlots.length === 0), padding: '13px', fontSize: '14px', borderRadius: '10px' }}>{busy === 'approve' ? 'Working…' : targetSlots.length > 0 ? `Approve ${sel.size || ''} on ${targetSlots.map(x => `${fmtD(x.date)} ${x.session.toUpperCase()}`).join(' + ')} & ask to confirm` : 'Pick the dive day(s) first'}</button>
            <span style={{ fontSize: '11.5px', color: s.muted, lineHeight: 1.5 }}>Moves each request to the day(s) above (shortens where shown), checks the boat and emails each guest a “Confirm &amp; pay” button — the email says so if dates or product were changed. Want to approve a single request exactly as asked? Open it via its reference chip.</span>
          </div>
          {log.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted }}>Result</div>
              {log.map((line, i) => {
                const bad = /not approved|not moved|could not|invalid/i.test(line)
                const [who, ...rest] = line.split(': ')
                return (
                  <div key={i} style={{ fontSize: '12.5px', lineHeight: 1.5, color: bad ? '#ff8b70' : s.text, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {rest.length ? <><b>{who}</b> — {rest.join(': ')}</> : line}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Booking request panel (Low Season, Lucas 28.10.2026) ────────────────────
// Approve: Kapazität wird serverseitig geprüft (409 + over_slots → „Approve anyway"), Zahlungslink per Mail.
// Decline: Pflicht-Begründung, Buchung → cancelled. Resend: neuer Stripe-Link (24 h), ohne zweite Freigabe.
function RequestPanel({ booking, childBookings, onChanged }: { booking: Booking; childBookings: Booking[]; onChanged: () => Promise<void> | void }) {
  const [mode, setMode] = useState<'full' | 'deposit'>(booking.request_payment_mode ?? 'full')
  const [overSlots, setOverSlots] = useState<string | null>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<'approve' | 'decline' | 'resend' | 'reopen' | 'restore' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [shortened, setShortened] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    if (!booking.request_token) { setShortened(false); return }
    fetch(`/api/booking-request/new-link?token=${encodeURIComponent(booking.request_token)}`).then(r => r.json()).then(d => { if (alive) setShortened(Boolean(d?.booking?.shortened_from)) }).catch(() => { if (alive) setShortened(false) })
    return () => { alive = false }
  }, [booking.id, booking.request_token, booking.request_state])
  const total = (booking.amount ?? 0) + childBookings.reduce((a, b) => a + (b.amount ?? 0), 0)
  // Deposit (Lucas 30.10.): 50 % auf alles außer Versicherung — Anzeige-Näherung aus booking_extras.insurance, der Server rechnet je Position
  const insOf = (b: Booking) => Number((b.booking_extras as { insurance?: { total_cents?: number } } | null)?.insurance?.total_cents ?? 0) || 0
  const insuranceCents = insOf(booking) + childBookings.reduce((a, b) => a + insOf(b), 0)
  const depositCents = depositApproxCents(total, insuranceCents)
  const due = mode === 'deposit' ? depositCents : total
  const guestWantsDeposit = booking.request_state === 'requested' && booking.request_payment_mode === 'deposit'
  const st = booking.request_state
  const [nowMs] = useState(() => Date.now())
  const sinceApproved = booking.approved_until ? Math.round((new Date(booking.approved_until).getTime() - nowMs) / 3600_000) : null

  async function call(path: string, body: Record<string, unknown>, kind: 'approve' | 'decline' | 'resend' | 'reopen' | 'restore') {
    setBusy(kind); setMsg(null); setOverSlots(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('Not signed in — reload and sign in again')
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (r.status === 409 && Array.isArray(d.over_slots) && kind === 'approve') { setOverSlots(String(d.error ?? 'Not enough seats')); throw new Error('Not approved — see the capacity note above.') }
        throw new Error(`${d.error ?? 'Request failed'} (HTTP ${r.status}${d.ref ? `, ref ${d.ref}` : ''})`)
      }
      setMsg({ ok: true, text: kind === 'decline' ? 'Request declined — guest emailed'
        : kind === 'reopen' ? 'Request reopened — back in the planner, old payment session closed'
        : kind === 'restore' ? 'Original request restored and reopened'
        : `${kind === 'resend' ? 'Approval email re-sent' : 'Approved — confirmation email sent'} to ${booking.customer_email}${d.mail_error ? ` — email failed: ${d.mail_error}` : ''}` })
      setDeclineOpen(false); setReason('')
      await onChanged()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const btn = (color: string, bg: string, border: string): React.CSSProperties => ({ padding: '8px 14px', borderRadius: '8px', border: `1px solid ${border}`, background: bg, color, fontSize: '12.5px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: s.font, opacity: busy ? .6 : 1 })
  return (
    <div style={{ border: '1px solid rgba(243,239,230,.25)', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: s.accent }}>
          Booking request · {st === 'requested' ? 'waiting for approval' : st === 'approved' ? 'approved, waiting for the guest to confirm' : st === 'expired' ? 'approved, link expired' : st}
        </span>
        <span style={{ fontSize: '12px', color: s.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Total €{(total / 100).toFixed(2)}{childBookings.length ? ` · ${childBookings.length + 1} linked bookings` : ''}</span>
      </div>
      {(st === 'approved' || st === 'expired') && (
        <div style={{ fontSize: '12px', color: s.muted, lineHeight: 1.5 }}>
          {booking.approved_by_email ? `Approved by ${booking.approved_by_email}` : 'Approved'} · {booking.request_payment_mode === 'deposit' ? '50 % deposit' : 'full amount'}
          {booking.approved_until ? ` · asked to confirm by ${new Date(booking.approved_until).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${sinceApproved !== null ? (sinceApproved >= 0 ? ` (${sinceApproved} h left)` : ` (${-sinceApproved} h overdue)`) : ''}` : ''}
          <br />The guest confirms on their page; the payment page opens only then. No reaction? <b>Resend email</b>. Guest wants another day? <b>Reopen</b> puts it back in the planner.
        </div>
      )}
      {st === 'declined' && <div style={{ fontSize: '12px', color: s.muted }}>Declined: {booking.declined_reason ?? '—'}</div>}

      {(st === 'requested' || st === 'expired') && !declineOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', color: s.muted, lineHeight: 1.5 }}>Need other dates (e.g. one dive day for the whole week)? Change them in the <b style={{ color: s.text }}>Sessions</b> tab first — the guest sees the final dates in the approval email, with a note that they were adjusted, and confirms before paying.</div>
          <div style={{ display: 'flex', gap: '14px', fontSize: '12.5px', color: s.text, flexWrap: 'wrap' }}>
            {(['full', 'deposit'] as const).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="radio" name="req-mode" checked={mode === m} onChange={() => setMode(m)} style={{ accentColor: s.accent }} />
                {m === 'full' ? `Full amount €${(total / 100).toFixed(2)}` : `50 % deposit €${(depositCents / 100).toFixed(2)}${insuranceCents > 0 ? ' (insurance in full)' : ''}`}
              </label>
            ))}
          </div>
          {guestWantsDeposit && (
            <div style={{ fontSize: '12px', color: s.text, lineHeight: 1.5, padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(243,239,230,.3)', background: 'rgba(243,239,230,.06)' }}>
              The guest asked for a 50% deposit when sending the request — pre-selected here; switch to full amount if you prefer.
            </div>
          )}
          {overSlots && (
            <div style={{ border: '1px solid rgba(255,96,64,.35)', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#ff8b70', lineHeight: 1.5 }}>
              {overSlots}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button disabled={!!busy} onClick={() => call('/api/booking-request/approve', { booking_id: booking.id, mode }, 'approve')} style={btn('#090909', s.accent, 'transparent')}>
              {busy === 'approve' ? 'Sending…' : `Approve — ask guest to confirm & pay (€${(due / 100).toFixed(2)})`}
            </button>
            <button disabled={!!busy} onClick={() => { setDeclineOpen(true); setMsg(null) }} style={btn('#ff8b70', 'transparent', 'rgba(255,96,64,.35)')}>Decline</button>
          </div>
        </div>
      )}
      {st === 'approved' && !declineOpen && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button disabled={!!busy} onClick={() => call('/api/booking-request/approve', { booking_id: booking.id, resend: true }, 'resend')} style={btn(s.text, 'transparent', 'rgba(255,255,255,.18)')}>
            {busy === 'resend' ? 'Sending…' : 'Resend email'}
          </button>
          <button disabled={!!busy} onClick={() => { if (confirm('Reopen this request? The guest can no longer confirm the proposed day; it goes back to the planner.')) call('/api/booking-request/reopen', { booking_id: booking.id }, 'reopen') }} style={btn(s.text, 'transparent', 'rgba(255,255,255,.18)')}>
            {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
          </button>
          {shortened && (
            <button disabled={!!busy} onClick={() => { if (confirm('Restore the original request (product, price, dates) and reopen it?')) call('/api/booking-request/reopen', { booking_id: booking.id, restore: true }, 'restore') }} style={btn(s.text, 'transparent', 'rgba(255,255,255,.18)')}>
              {busy === 'restore' ? 'Restoring…' : 'Restore original & reopen'}
            </button>
          )}
          <button disabled={!!busy} onClick={() => { setDeclineOpen(true); setMsg(null) }} style={btn('#ff8b70', 'transparent', 'rgba(255,96,64,.35)')}>Decline</button>
        </div>
      )}
      {declineOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason / alternatives for the guest (goes into the email) — e.g. no boat on 12 Nov, free on 13 or 14 Nov" rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,96,64,.35)', background: 'rgba(0,0,0,.25)', color: s.text, fontSize: '12.5px', fontFamily: s.font, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button disabled={!!busy || reason.trim().length < 5} onClick={() => call('/api/booking-request/decline', { booking_id: booking.id, reason: reason.trim() }, 'decline')} style={{ ...btn('#fff', 'rgba(255,96,64,.8)', 'transparent'), opacity: busy || reason.trim().length < 5 ? .5 : 1 }}>
              {busy === 'decline' ? 'Declining…' : 'Send decline & cancel request'}
            </button>
            <button disabled={!!busy} onClick={() => { setDeclineOpen(false); setReason('') }} style={btn(s.muted, 'transparent', 'rgba(255,255,255,.15)')}>Back</button>
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: '12.5px', fontWeight: 600, color: msg.ok ? '#4ade80' : '#ff8b70', lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.text}</div>}
    </div>
  )
}

function PaymentBadge({ state, size = 11 }: { state?: PaymentState | null; size?: number }) {
  if (!state) return null
  const c = PAYMENT_STATE_COLOR[state] ?? '#aaa'
  return (
    <span title="Payment state (from payments & refunds ledger)" style={{ padding: '2px 8px', borderRadius: '20px', fontSize: `${size}px`, fontWeight: 700, border: `1px solid ${c}55`, background: `${c}1f`, color: c, whiteSpace: 'nowrap' }}>
      {PAYMENT_STATE_LABEL[state] ?? state}
    </span>
  )
}

const PM_LABELS: Record<string, string> = {
  cash:          '💵 Cash',
  bank_transfer: '🏦 Transfer',
  bank:          '🏦 Transfer',
  revolut:       '⚡ Revolut',
  card_terminal: '💳 Terminal',
  card:          '💳 Card',
  stripe:        '💳 Stripe',
}

const PAGE_SIZE = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  // Reine Datumswerte (YYYY-MM-DD) als lokalen Mittag parsen: `new Date('2026-10-27')` ist UTC-Mitternacht
  // und wird auf den Azoren (UTC−1) als 26.10. angezeigt — die Sessions-Liste lag dadurch einen Tag daneben.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00' : d
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtAmount(cents: number | null, currency: string | null) {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: (currency ?? 'eur').toUpperCase() })
}

function pmLabel(b: Booking): string {
  if (b.payment_method && PM_LABELS[b.payment_method]) return PM_LABELS[b.payment_method]
  if (b.stripe_payment_intent) return '💳 Stripe'
  return '—'
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  background: '#030d1c',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  color: '#e8f0ff',
  fontFamily: s.font,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const lbl: React.CSSProperties = {
  fontSize: '10.5px',
  fontWeight: 700,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: s.muted,
  marginBottom: '5px',
  display: 'block',
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * focusBookingId + embedded: nur das Detail-Panel einer Buchung (für Popups, z. B. Finances → Refunds → Buchungsnr.).
 */
// Log-Texte beginnen mit einem Emoji; in der Anzeige steht es hinter dem Text (rechts vom Titel).
function emojiToEnd(text: string): string {
  const m = text.match(/^((?:\p{Extended_Pictographic}|\uFE0F|\u200D)+)\s*([\s\S]*)$/u)
  return m && m[2] ? `${m[2]} ${m[1]}` : text
}

// Log-Texte lesbar: Titelzeile + Detailzeilen statt einem langen Satz (Lucas 30.10.)
function splitLogText(raw: string): { title: string; lines: string[]; emoji: string } {
  const lead = raw.match(/^((?:\p{Extended_Pictographic}|\uFE0F|\u200D)+)\s*([\s\S]*)$/u)
  let text = lead && lead[2] ? lead[2] : raw
  let emoji = lead && lead[2] ? lead[1] : ''
  const tail = text.match(/^([\s\S]*?)\s*((?:\p{Extended_Pictographic}|\uFE0F|\u200D)+)$/u)
  if (tail && tail[1]) { text = tail[1]; emoji = emoji || tail[2] }
  const lines: string[] = []
  let paren: string | null = null
  const pm = text.match(/^([\s\S]*?)\s*\(([^()]*)\)\s*$/)
  if (pm && pm[1] && pm[2]) { text = pm[1]; paren = pm[2] }
  const parts = text.split(/\s+—\s+|;\s+|(?<=[.!?])\s+(?=[A-Z0-9"“])/).map(x => x.trim().replace(/\.$/, '')).filter(Boolean)
  let title = parts.shift() ?? text
  if (title.length > 70 && title.includes(': ')) {
    const i = title.indexOf(': ')
    parts.unshift(title.slice(i + 2)); title = title.slice(0, i)
  }
  lines.push(...parts)
  if (paren) lines.push(...(/\d/.test(paren) && paren.includes(', ') ? paren.split(/,\s+/) : [paren]))
  return { title, lines, emoji }
}

function LogText({ text, muted }: { text: string; muted?: boolean }) {
  const { title, lines, emoji } = splitLogText(text)
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '12.5px', color: muted ? s.muted : s.text, fontWeight: 700, lineHeight: 1.45 }}>{title}{emoji ? ` ${emoji}` : ''}</div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: '11.5px', color: s.muted, lineHeight: 1.5, marginTop: '2px' }}>{l}</div>
      ))}
    </div>
  )
}

export default function FrontOfficeBookings({ focusBookingId, embedded = false, initialTab, expandBookingId, requestsOnly = false }: { focusBookingId?: string; expandBookingId?: string; embedded?: boolean; initialTab?: 'overview' | 'payments' | 'sessions' | 'changelog' | 'add' | 'divers'; /** Tab „Booking Requests": nur offene Anfragen + Planner, keine Historie */ requestsOnly?: boolean } = {}) {
  // List state
  const [bookings, setBookings] = useState<Booking[]>([])
  // Name des ersten Tauchers aus dem Check-in (je Buchung) — der Stripe-Name ist der Zahler und bei Split-Buchungen überall gleich
  const [diverNames, setDiverNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Booking | null>(null)
  const expandDone = React.useRef<string | null>(null)
  const [filterDate, setFilterDate] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStatus, setFilterStatus] = useState(requestsOnly ? 'requests' : 'all')
  const [filterSearch, setFilterSearch] = useState('')
  // Test-/Echtdaten folgen dem globalen Sandbox/Production-Schalter (oben neben Sign out)
  const { sandbox } = useSimulation()
  const showTest = sandbox === true
  // Offene Buchungsanfragen (Low Season): Zähler für den Requests-Button in der Filterleiste
  const [openRequests, setOpenRequests] = useState<number | null>(null)
  useEffect(() => {
    if (sandbox === null) return
    let alive = true
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('is_test', showTest).eq('request_state', 'requested')
      .then(({ count, error }) => { if (!alive) return; if (error) { console.error('[FOBookings] open requests', error); setOpenRequests(null) } else setOpenRequests(count ?? 0) })
    return () => { alive = false }
  }, [sandbox, showTest, bookings])
  const [page, setPage] = useState(0)

  // Detail tabs
  const [detailTab, setDetailTab] = useState<'overview' | 'payments' | 'sessions' | 'changelog' | 'add' | 'divers'>('overview')

  // Overview
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundMsg, setRefundMsg] = useState<string | null>(null)

  // Payments
  const [payments, setPayments] = useState<BookingPayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [payFormOpen, setPayFormOpen] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', notes: '', dueDate: '', status: 'paid' as 'paid' | 'pending' })
  const [payLoading, setPayLoading] = useState(false)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  // Generate payment link modal
  const [payLinkOpen, setPayLinkOpen] = useState(false)
  const [payLinkMethod, setPayLinkMethod] = useState<'link' | 'bank' | 'revolut'>('bank')
  const [payLinkAmountType, setPayLinkAmountType] = useState<'full' | 'deposit' | 'custom'>('full')
  const [payLinkCustomAmount, setPayLinkCustomAmount] = useState('')
  const [payLinkLoading, setPayLinkLoading] = useState(false)
  const [payLinkMsg, setPayLinkMsg] = useState<string | null>(null)

  // Sessions
  const [bkSessions, setBkSessions] = useState<BookingSession[]>([])
  const [sessLoading, setSessLoading] = useState(false)
  const [sessFormOpen, setSessFormOpen] = useState(false)
  const [sessForm, setSessForm] = useState({ date: '', time: 'am' as 'am' | 'pm' | 'night', isBoatDay: null as boolean | null, notes: '' })
  const [sessAddLoading, setSessAddLoading] = useState(false)
  const [sessMsg, setSessMsg] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editSessForm, setEditSessForm] = useState<{ date: string; time: 'am' | 'pm' | 'night' | 'tbd'; isBoatDay: boolean | null; notes: string }>({ date: '', time: 'am', isBoatDay: null, notes: '' })
  const [sessEditLoading, setSessEditLoading] = useState(false)
  const [sessDeleteConfirm, setSessDeleteConfirm] = useState<string | null>(null)

  // Changelog
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])
  const [changelogLoading, setChangelogLoading] = useState(false)

  // Customer detail (phone etc.) + per-diver stati
  const [selectedCustomer, setSelectedCustomer] = useState<{
    phone?: string | null
    phone_prefix?: string | null
    phone_number?: string | null
    first_name?: string | null
    last_name?: string | null
    gender?: string | null
    country_of_residence?: string | null
    waiver_pdf_url?: string | null
    staff_notes?: string | null
    created_at?: string | null
  } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedDivers, setSelectedDivers] = useState<any[]>([])
  const [slotToast, setSlotToast] = useState<string | null>(null)
  useEffect(() => {
    if (!slotToast) return
    const t = setTimeout(() => setSlotToast(null), 6000)
    return () => clearTimeout(t)
  }, [slotToast])
  const [expandedDiverIds, setExpandedDiverIds] = useState<Set<string>>(new Set())
  const [diversLoadError, setDiversLoadError] = useState<string | null>(null)

  // Add tab (child bookings)
  const ADD_DATE_REQUIRED = ['dives', 'specialty', 'pro', 'ecology', 'excursion']
  const [addProducts, setAddProducts] = useState<CourseProduct[]>([])
  const [addCart, setAddCart] = useState<{ id: string; name: string; category: string; price_cents: number; booking_date?: string }[]>([])
  const [addSelectedId, setAddSelectedId] = useState('')
  const [addItemDate, setAddItemDate] = useState('')
  // Add-on: betroffene Personen — alle oder einzelne (Preis × Anzahl Personen)
  const [addPersonMode, setAddPersonMode] = useState<'all' | 'some'>('all')
  const [addPersonIds, setAddPersonIds] = useState<Set<string>>(new Set())
  useEffect(() => { setAddPersonMode('all'); setAddPersonIds(new Set()) }, [selected?.id])
  const [addPayStatus, setAddPayStatus] = useState<'paid' | 'pending'>('paid')
  const [addPayMethod, setAddPayMethod] = useState('cash')
  const [addLoading, setAddLoading] = useState(false)
  const [addMsg, setAddMsg] = useState<string | null>(null)
  const [childBookings, setChildBookings] = useState<Booking[]>([])

  // Cancel confirm
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelWithRefund, setCancelWithRefund] = useState(false)
  // Verknüpfte Kind-Buchungen (Split-Gruppe): beim Storno der Eltern-Buchung mit auswählbar
  const [cancelKids, setCancelKids] = useState<{ id: string; name: string | null; product: string | null; amount: number; currency: string }[]>([])
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelChoice, setCancelChoice] = useState('')
  const [cancelDetail, setCancelDetail] = useState('')
  const [partialRefundChoice, setPartialRefundChoice] = useState('')
  const [fullRefundChoice, setFullRefundChoice] = useState('')
  const [refundPayout, setRefundPayout] = useState<PayoutValue>(emptyPayout)
  // Partial refund
  const [partialRefundOpen, setPartialRefundOpen] = useState(false)
  const [partialRefundAmount, setPartialRefundAmount] = useState('')
  const [refundItemKeys, setRefundItemKeys] = useState<Set<string>>(new Set())
  const [refundPaymentIds, setRefundPaymentIds] = useState<Set<string>>(new Set())
  const [partialRefundDesc, setPartialRefundDesc] = useState('')
  const [refundReleaseSessionIds, setRefundReleaseSessionIds] = useState<Set<string>>(new Set())
  const [fullReleaseIds, setFullReleaseIds] = useState<Set<string>>(new Set())
  const [fullRefundDesc, setFullRefundDesc] = useState('')
  type RefundRow = { id: string; amount: number; method: string; status: string; description: string; requested_at: string; paid_at: string | null; stripe_refund_id: string | null; requested_by_email: string | null; authorized_by_email: string | null; source_refs: string[] | null }
  const [refundRows, setRefundRows] = useState<RefundRow[]>([])
  async function loadRefunds(bookingId: string) {
    const { data } = await supabase.from('booking_refunds').select('id, amount, method, status, description, requested_at, paid_at, stripe_refund_id, requested_by_email, authorized_by_email, source_refs').eq('booking_id', bookingId).order('requested_at')
    setRefundRows((data ?? []) as RefundRow[])
  }
  const [partialRefundMsg, setPartialRefundMsg] = useState<string | null>(null)
  const [partialRefundMethod, setPartialRefundMethod] = useState<string>('')
  // Full refund panel
  const [fullRefundOpen, setFullRefundOpen] = useState(false)
  const [fullRefundMethod, setFullRefundMethod] = useState<string>('')

  // Change package (upgrade/downgrade)
  const [changePackageOpen, setChangePackageOpen] = useState(false)
  const [changePackageId, setChangePackageId] = useState<string | null>(null)
  const [changePackageLoading, setChangePackageLoading] = useState(false)
  const [changePackageMsg, setChangePackageMsg] = useState<string | null>(null)
  // Paketwechsel nur für ausgewählte Personen (leer = ganze Buchung, bisheriges Verhalten)
  const [pkgPersonIds, setPkgPersonIds] = useState<Set<string>>(new Set())
  const [pkgPersonMode, setPkgPersonMode] = useState<'all' | 'some'>('all')
  const [pkgSessions, setPkgSessions] = useState<Picked[]>([])
  type PkgPreview = { old_amount_cents: number; original_amount_cents: number; new_booking_amount_cents: number; moved_old_share_cents: number; transfer_cents: number; open_cents: number; paid_available_cents: number }
  const [pkgPreview, setPkgPreview] = useState<{ loading: boolean; data: PkgPreview | null; error: string | null }>({ loading: false, data: null, error: null })
  useEffect(() => {
    // Balance-Vorschau für „Only some people": Server rechnet mit derselben Logik wie beim Ausführen (dry_run)
    if (!changePackageOpen || pkgPersonMode !== 'some' || !changePackageId || !selected) { setPkgPreview({ loading: false, data: null, error: null }); return }
    const np = addProducts.find(p => p.id === changePackageId)
    const required = np ? (['entry', 'specialty', 'ecology', 'pro'].includes(np.category ?? '') ? (isProgramProduct(np.id) ? 1 : (np.duration_days_min ?? 1)) : (np.sessions_included ?? 1)) : 0
    const gs = selected.group_size ?? 1
    if (pkgPersonIds.size < 1 || pkgPersonIds.size >= gs || pkgSessions.length !== required) { setPkgPreview({ loading: false, data: null, error: null }); return }
    let alive = true
    setPkgPreview({ loading: true, data: null, error: null })
    ;(async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
        const res = await fetch('/api/change-package-split', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ dry_run: true, booking_id: selected.id, booking_customer_ids: [...pkgPersonIds], new_product_id: changePackageId, sessions: pkgSessions.map(x => ({ date: x.date, session: x.session })) }),
        })
        const d = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok || !d.ok) setPkgPreview({ loading: false, data: null, error: `${res.status}: ${d.error ?? 'Preview failed'}` })
        else setPkgPreview({ loading: false, data: d as PkgPreview, error: null })
      } catch (e) { if (alive) setPkgPreview({ loading: false, data: null, error: e instanceof Error ? e.message : 'Network error' }) }
    })()
    return () => { alive = false }
  }, [changePackageOpen, pkgPersonMode, changePackageId, pkgPersonIds, pkgSessions, selected, addProducts])

  // Current user
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const who = useStaffNames()
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data.user?.email ?? null))
  }, [])

  // ── Fetch bookings list ─────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    if (sandbox === null) return // Schalter noch nicht geladen
    setLoading(true)
    if (focusBookingId) {
      // Eingebettet: genau diese Buchung laden und direkt öffnen
      const { data, error } = await supabase
        .from('bookings')
        .select('id,booking_date,session,product_name,customer_name,customer_email,group_size,status,payment_state,amount,currency,payment_method,stripe_payment_intent,stripe_session_id,staff_notes,is_test,created_at,refunded_at,refunded_amount_cents,refund_paid_at,paid_at,checkin_token,checkin_completed_at,source,sessions_expected,parent_booking_id,booking_extras,insurance_choice,request_state,request_payment_mode,approved_until,approved_by_email,declined_reason,request_token')
        .eq('id', focusBookingId).maybeSingle()
      if (error) console.error('[FOBookings]', error)
      const b = (data ?? null) as Booking | null
      setBookings(b ? [b] : [])
      if (b) { openBooking(b); if (initialTab) setDetailTab(initialTab) }
      setLoading(false)
      return
    }
    let q = supabase
      .from('bookings')
      .select('id,booking_date,session,product_name,customer_name,customer_email,group_size,status,payment_state,amount,currency,payment_method,stripe_payment_intent,stripe_session_id,staff_notes,is_test,created_at,refunded_at,refunded_amount_cents,refund_paid_at,paid_at,checkin_token,checkin_completed_at,source,sessions_expected,parent_booking_id,booking_extras,insurance_choice,request_state,request_payment_mode,approved_until,approved_by_email,declined_reason,request_token')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    q = q.eq('is_test', showTest)
    if (filterDate)   q = q.gte('booking_date', filterDate)
    if (filterDateTo) q = q.lte('booking_date', filterDateTo)
    if (filterStatus === 'requests') q = q.in('request_state', ['requested', 'approved', 'expired'])
    else if (filterStatus !== 'all') q = q.eq('status', filterStatus)
    // Historie: offene Anfragen bleiben im Tab „Booking Requests" — hier nur normale Buchungen (+ bezahlte/abgelehnte Requests)
    if (filterStatus !== 'requests') q = q.or('request_state.is.null,request_state.in.(converted,declined)')
    if (filterSearch.trim()) {
      const term = filterSearch.trim().replace(/[,()%*\\]/g, ' ').trim()
      const parts = [`customer_name.ilike.%${term}%`, `customer_email.ilike.%${term}%`, `product_name.ilike.%${term}%`]
      // Buchungsnummer = erste 8 Zeichen der UUID: 4–8 Hex-Zeichen als Präfix-Bereich suchen (uuid kennt kein ilike)
      if (/^[0-9a-f]{4,8}$/i.test(term)) {
        const h = term.toLowerCase()
        parts.push(`and(id.gte.${h.padEnd(8, '0')}-0000-0000-0000-000000000000,id.lte.${h.padEnd(8, 'f')}-ffff-ffff-ffff-ffffffffffff)`)
      }
      q = q.or(parts.join(','))
    }

    const { data, error } = await q
    if (error) console.error('[FOBookings]', error)
    let list = (data ?? []) as Booking[]
    // Requests: offene Anfragen zuerst, dann freigegebene (Link draußen), dann abgelaufene
    if (filterStatus === 'requests') {
      const rank: Record<string, number> = { requested: 0, approved: 1, expired: 2 }
      list = [...list].sort((a, b) => (rank[a.request_state ?? ''] ?? 9) - (rank[b.request_state ?? ''] ?? 9) || b.created_at.localeCompare(a.created_at))
    }
    setBookings(list)
    setLoading(false)
    // Direkter Sprung aus dem Front-Office-Success-Screen: genau diese Buchung aufklappen
    if (expandBookingId && expandDone.current !== expandBookingId) {
      expandDone.current = expandBookingId
      let hit = list.find(x => x.id === expandBookingId) ?? null
      if (!hit) {
        const { data: one } = await supabase.from('bookings').select('*').eq('id', expandBookingId).maybeSingle()
        hit = (one ?? null) as Booking | null
        if (hit) setBookings([hit, ...list])
      }
      if (hit) {
        openBooking(hit)
      }
    }
    if (list.length) {
      const { data: bcs, error: bcErr } = await supabase
        .from('booking_customers')
        .select('booking_id, slot_index, guest_name, customer:customers!booking_customers_customer_id_fkey(first_name, last_name, name)')
        .in('booking_id', list.map(x => x.id))
        .eq('slot_index', 0)
      if (bcErr) console.error('[FOBookings] diver names', bcErr)
      const map: Record<string, string> = {}
      for (const r of (bcs ?? []) as unknown as { booking_id: string; guest_name: string | null; customer: { first_name: string | null; last_name: string | null; name: string | null } | { first_name: string | null; last_name: string | null; name: string | null }[] | null }[]) {
        const c = Array.isArray(r.customer) ? r.customer[0] : r.customer
        const n = (r.guest_name?.trim()) || [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim() || c?.name?.trim() || ''
        if (n) map[r.booking_id] = n
      }
      setDiverNames(map)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterDateTo, filterStatus, filterSearch, showTest, sandbox, page, focusBookingId])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  // ── Realtime: booking updates (check-in, stripe confirmation, etc.) ──────────
  useEffect(() => {
    const channel = supabase
      .channel('fo-bookings-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        (payload) => {
          const updated = payload.new as Booking
          setBookings(bs => bs.map(b => b.id === updated.id ? { ...b, ...updated } : b))
          setSelected(s => {
            if (s?.id !== updated.id) return s
            // Webhook (Stripe) schreibt Zahlung + Changelog in andere Tabellen — Log/Payments/Sessions mit nachladen,
            // sonst zeigt eine offene Buchung nach der Zahlung weiter den alten Stand.
            void loadChangelog(updated.id); void loadPayments(updated.id); void loadSessions(updated.id)
            return { ...s, ...updated }
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // ── Open booking ────────────────────────────────────────────────────────────
  // Verlinkte Buchung per 8-stelligem Präfix öffnen (z. B. aus Transfer-Zeilen der Payment history)
  async function openBookingByPrefix(prefix: string) {
    const hit = [...bookings, ...childBookings].find(x => x.id.startsWith(prefix))
    if (hit) { openBooking(hit); return }
    const { data, error } = await supabase.from('bookings').select('*')
      .gte('id', `${prefix}-0000-0000-0000-000000000000`).lte('id', `${prefix}-ffff-ffff-ffff-ffffffffffff`).limit(1)
    if (error || !data?.[0]) { setPayMsg(`❌ Booking ${prefix} not found${error ? `: ${error.message}` : ''}`); return }
    openBooking(data[0] as Booking)
  }

  function openBooking(b: Booking) {
    setSelected(b)
    setEditNotes(b.staff_notes ?? '')
    setEditStatus(b.status)
    setRefundMsg(null)
    setPayMsg(null)
    setSessMsg(null)
    setPayFormOpen(false)
    setSessFormOpen(false)
    setCancelConfirm(false)
    setPartialRefundOpen(false)
    setPartialRefundAmount('')
    setPartialRefundMsg(null)
    setPartialRefundMethod('')
    setFullRefundOpen(false)
    setFullRefundMethod('')
    setPayLinkOpen(false)
    setPayLinkAmountType('full')
    setPayLinkCustomAmount('')
    setPayLinkMsg(null)
    setEditingSessionId(null)
    setSessDeleteConfirm(null)
    setDetailTab('overview')
    setSelectedCustomer(null)
    setSelectedDivers([])
    setExpandedDiverIds(new Set())
    setAddCart([])
    setAddSelectedId('')
    setAddPersonMode('all'); setAddPersonIds(new Set())
    setAddPayStatus('paid')
    setAddPayMethod('cash')
    setAddMsg(null)
    loadPayments(b.id)
    loadSessions(b.id)
    loadChangelog(b.id)
    loadCustomerDetails(b.id, b.customer_email)
    loadChildBookings(b.id)
    if (addProducts.length === 0) loadAddProducts()
  }

  // ── Load customer phone + per-diver check-in stati ──────────────────────────
  async function loadCustomerDetails(bookingId: string, customerEmail: string | null) {
    // Phone + extended profile from customers table (matched by email)
    if (customerEmail) {
      const { data: cust } = await supabase
        .from('customers')
        .select('phone, phone_prefix, phone_number, first_name, last_name, gender, country_of_residence, waiver_pdf_url, staff_notes, created_at')
        .eq('email', customerEmail)
        .maybeSingle()
      if (cust) setSelectedCustomer(cust)
    }
    // Per-diver stati from booking_customers + joined customers
    setDiversLoadError(null)
    const { data: divers, error: diversErr } = await supabase
      .from('booking_customers')
      .select(`id, slot_index, guest_name,
        checkin_started_at, checkin_completed_at,
        medical_flag, medical_flag_reason, medical_flag_resolved, medical_resolved_at, medical_resolved_by,
        insurance_flag, insurance_source, insurance_verified_at, insurance_verified_by,
        no_show, is_minor,
        wetsuit_size, bcd_size, boot_size, special_notes,
        policy_accepted_at, medical_ack_at, dan_submitted_at,
        refresher_completed_at, refresher_completed_by,
        invite_email, customer_id,
        customer:customers!booking_customers_customer_id_fkey(id, name, email, phone, phone_prefix, phone_number,
          experience_level, certifications, cert_agency, cert_number,
          insurance_provider, insurance_policy_number,
          logged_dives, last_dive_date,
          medical_cleared_at, waiver_signed_at, dob, nationality,
          emergency_contact_name, emergency_contact_phone,
          waiver_pdf_url, first_name, last_name, gender, country_of_residence, staff_notes)`)
      .eq('booking_id', bookingId)
      .order('slot_index')
    if (diversErr) setDiversLoadError(diversErr.message)
    if (divers) {
      setSelectedDivers(divers)
      setExpandedDiverIds(new Set()) // Taucherprofile immer eingeklappt — nur per Klick öffnen
    }
  }

  // ── Changelog helper ────────────────────────────────────────────────────────
  async function logChange(bookingId: string, action: string, description: string, field?: string, oldVal?: string, newVal?: string) {
    await supabase.from('booking_changelog').insert({
      booking_id: bookingId,
      changed_by_email: currentUserEmail,
      action,
      field: field ?? null,
      old_value: oldVal ?? null,
      new_value: newVal ?? null,
      description,
    })
    // Jede Staff-Aenderung am Front Office zusaetzlich ins zentrale audit_log
    void auditFromClient(supabase, { bookingId, action, description, field, oldVal, newVal })
  }

  // ── Overview: save notes ────────────────────────────────────────────────────
  async function saveNotes() {
    if (!selected) return
    setNotesLoading(true)
    const fullNotes = editNotes.trim() || null
    const old = selected.staff_notes ?? ''
    await supabase.from('bookings').update({ staff_notes: fullNotes, updated_at: new Date().toISOString() }).eq('id', selected.id)
    await logChange(selected.id, 'notes_update', 'Staff notes updated', 'staff_notes', old, fullNotes ?? '')
    setSelected(b => b ? { ...b, staff_notes: fullNotes } : b)
    setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, staff_notes: fullNotes } : b))
    loadChangelog(selected.id)
    setNotesLoading(false)
  }

  // ── Overview: save status ───────────────────────────────────────────────────
  async function saveStatus() {
    if (!selected) return
    setStatusLoading(true)
    const old = selected.status
    await supabase.from('bookings').update({ status: editStatus, updated_at: new Date().toISOString() }).eq('id', selected.id)
    await logChange(selected.id, 'status_change', `Status: ${old} → ${editStatus}`, 'status', old, editStatus)
    setSelected(b => b ? { ...b, status: editStatus } : b)
    setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, status: editStatus } : b))
    loadChangelog(selected.id)
    setStatusLoading(false)
  }

  const [confirmPayOpen, setConfirmPayOpen] = useState(false)
  const [confirmPayMethod, setConfirmPayMethod] = useState('cash')

  async function confirmPayment(method: string = confirmPayMethod) {
    if (!selected) return
    setStatusLoading(true)
    const now = new Date().toISOString()
    // „Payment received" = echte Zahlung erfassen (offener Rest), nicht nur paid_at setzen.
    const open = Math.max(0, (selected.amount ?? 0) - payments.filter(p => p.status === 'paid').reduce((a, p) => a + p.amount, 0))
    if (open > 0) {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null
      const { error: pErr } = await supabase.from('booking_payments').insert({
        booking_id: selected.id, amount: open, currency: selected.currency ?? 'eur', status: 'paid',
        method, notes: 'Marked as fully paid (remaining balance)', paid_at: now, recorded_by: uid,
      })
      if (pErr) { setPayMsg(`❌ ${pErr.message}`); setDetailTab("payments"); setStatusLoading(false); return }
    }
    const mailNote = open > 0 ? await notifyPaymentRegistered(selected.id, open, PM_LABELS[method] ?? method) : ''
    await supabase.from('bookings').update({ status: 'confirmed', paid_at: now, updated_at: now }).eq('id', selected.id)
    await logChange(selected.id, 'status_change',
      open > 0
        ? `Payment confirmed manually: ${fmtAmount(open, selected.currency)} via ${PM_LABELS[method] ?? method}`
        : `Payment confirmed manually (already fully paid: ${fmtAmount(selected.amount ?? 0, selected.currency)})`,
      'status', selected.status, 'confirmed')
    loadPayments(selected.id)
    setSelected(b => b ? { ...b, status: 'confirmed', paid_at: now } : b)
    setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, status: 'confirmed', paid_at: now } : b))
    setEditStatus('confirmed')
    loadChangelog(selected.id)
    setConfirmPayOpen(false)
    setPayMsg(open > 0 ? `✅ ${fmtAmount(open, selected.currency)} recorded — booking fully paid · ${mailNote}` : '✅ Booking already fully paid')
    setTimeout(() => setPayMsg(null), 8000)
    setStatusLoading(false)
  }

  // Ein-Klick „Mark as fully paid" mit Inline-Bestätigung (kein Browser-Dialog) — offener Rest wird als Zahlung erfasst.
  function renderMarkPaidButton() {
    if (!selected || !ps || ps.dueBalance <= 0 || selected.status === 'cancelled') return null
    if (!confirmPayOpen) {
      return (
        <button onClick={() => setConfirmPayOpen(true)} disabled={statusLoading}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(74,222,128,.35)', background: 'rgba(74,222,128,.12)', color: '#4ade80', fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: s.font, opacity: statusLoading ? .6 : 1 }}>
          ✅ Mark as fully paid · {fmtAmount(ps.dueBalance, ps.currency)} open
        </button>
      )
    }
    return (
      <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(74,222,128,.35)', background: 'rgba(74,222,128,.08)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '12.5px', color: s.text, fontWeight: 700 }}>Record {fmtAmount(ps.dueBalance, ps.currency)} as received?</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['cash', 'card_terminal', 'bank_transfer', 'revolut'] as const).map(m => (
            <button key={m} type="button" onClick={() => setConfirmPayMethod(m)} disabled={m === 'card_terminal'}
              title={m === 'card_terminal' ? 'No card terminal yet — card payments go through a Stripe link' : undefined}
              style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11.5px', fontFamily: s.font, cursor: m === 'card_terminal' ? 'not-allowed' : 'pointer', opacity: m === 'card_terminal' ? .35 : 1,
                border: `1px solid ${confirmPayMethod === m ? 'rgba(74,222,128,.5)' : 'rgba(255,255,255,.12)'}`,
                background: confirmPayMethod === m ? 'rgba(74,222,128,.15)' : 'transparent', color: confirmPayMethod === m ? '#4ade80' : s.muted }}>
              {PM_LABELS[m]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => confirmPayment()} disabled={statusLoading}
            style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: '#4ade80', color: '#032a12', fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: s.font, opacity: statusLoading ? .6 : 1 }}>
            {statusLoading ? 'Saving…' : 'Confirm'}
          </button>
          <button onClick={() => setConfirmPayOpen(false)} disabled={statusLoading}
            style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer', fontFamily: s.font }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Cancel booking ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cancelConfirm || !selected || selected.parent_booking_id) { setCancelKids([]); return }
    let alive = true
    void (async () => {
      const { data, error } = await supabase.from('bookings').select('id, customer_name, product_name, amount, currency')
        .eq('parent_booking_id', selected.id).neq('status', 'cancelled').order('created_at')
      if (!alive) return
      if (error) { setCancelError(`Could not load linked bookings: ${error.message}`); return }
      const kids = (data ?? []).map(k => ({ id: k.id as string, name: (k.customer_name as string | null), product: (k.product_name as string | null), amount: (k.amount as number | null) ?? 0, currency: (k.currency as string | null) ?? 'eur' }))
      setCancelKids(kids)
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelConfirm, selected?.id])

  async function cancelBooking() {
    if (!selected) return
    const cancelReason = composeReason(cancelChoice, cancelDetail)
    const cErr = reasonError(cancelReason)
    if (cErr) { setCancelError(cErr); return }
    setCancelLoading(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
        body: JSON.stringify({ booking_id: selected.id, with_refund: cancelWithRefund, reason: cancelReason }),
      })
      if (!res.ok) {
        const data = await res.json()
        setCancelError(`${res.status}: ${data.error ?? 'Cancel failed'}`)
        setCancelLoading(false)
        return
      }
      const data = await res.json()
      const newStatus = data.status ?? 'cancelled'
      await logChange(selected.id, 'status_change', cancelWithRefund && data.refunded ? 'Booking cancelled + refunded' : 'Booking cancelled', 'status', selected.status, newStatus)
      // Mailversand protokollieren — der Dialog verspricht die Mail, also muss sichtbar sein, ob sie rausging
      if (data.email_sent) {
        await logChange(selected.id, 'email_sent', `📧 Cancellation email sent to ${selected.customer_email ?? 'customer'}`)
      } else {
        await logChange(selected.id, 'email_failed', `⚠️ Cancellation email NOT sent: ${data.email_error ?? 'unknown error'}`)
        setCancelError(`Cancelled, but the cancellation email was not sent: ${data.email_error ?? 'unknown error'}`)
      }
      // Full refund = ganze Gruppe: alle verknüpften Kind-Buchungen mit stornieren + je eigener Refund-Antrag (Mail nur einmal an den Zahler).
      // Ohne Full refund wird nur diese eine Buchung storniert.
      const kidErrors: string[] = []
      for (const kid of (cancelWithRefund ? cancelKids : [])) {
        try {
          const kr = await fetch('/api/cancel', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
            body: JSON.stringify({ booking_id: kid.id, with_refund: cancelWithRefund, notify_customer: false, reason: `${cancelReason} (group booking ${selected.id.slice(0, 8)})` }),
          })
          const kd = await kr.json().catch(() => ({}))
          if (!kr.ok) { kidErrors.push(`${kid.id.slice(0, 8)}: ${kr.status} ${kd.error ?? 'Cancel failed'}`); continue }
          await logChange(kid.id, 'status_change', `Booking cancelled${cancelWithRefund && kd.refunded ? ' + refund requested' : ''} (together with group booking ${selected.id.slice(0, 8)})`, 'status', 'confirmed', 'cancelled')
          if (kd.refund_warning) kidErrors.push(`${kid.id.slice(0, 8)}: ${kd.refund_warning}`)
          setBookings(bs => bs.map(b => b.id === kid.id ? { ...b, status: 'cancelled' as typeof b.status, ...(kd.payment_state ? { payment_state: kd.payment_state as PaymentState } : {}) } : b))
        } catch (e) {
          kidErrors.push(`${kid.id.slice(0, 8)}: ${e instanceof Error ? e.message : 'network error'}`)
        }
      }
      if (kidErrors.length) setCancelError(`Main booking cancelled, but linked booking(s) had problems — ${kidErrors.join(' · ')}`)
      setCancelWithRefund(false)
      setCancelChoice(''); setCancelDetail('')
      setSelected(b => b ? { ...b, status: newStatus as typeof b.status, ...(data.payment_state ? { payment_state: data.payment_state as PaymentState } : {}) } : b)
      setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, status: newStatus as typeof b.status, ...(data.payment_state ? { payment_state: data.payment_state as PaymentState } : {}) } : b))
      if (!kidErrors.length) setCancelConfirm(false)
      loadChangelog(selected.id)
      loadPayments(selected.id)
    } catch (err) {
      setCancelError('Network error — please retry')
    }
    setCancelLoading(false)
  }

  // Tage-Häkchen beim Teilrefund → Beschreibung und Methode vorbelegen. Den Betrag legt das Front Office selbst fest:
  // Packs sind nicht linear bepreist, ein „Preis ÷ Tage" wäre geraten.
  function suggestDayRefund(ids: Set<string>) {
    if (!selected || refundItemKeys.size > 0 || refundPaymentIds.size > 0) return
    if (ids.size === 0) return
    if (!partialRefundDesc.trim()) {
      const days = bkSessions.filter(x => ids.has(x.id)).map(x => `${fmtDate(x.session_date)} ${(x.session ?? '').toUpperCase()}`).join(', ')
      setPartialRefundDesc(days)
      if (!partialRefundChoice) setPartialRefundChoice('Day cancelled')
    }
    if (!partialRefundMethod) setPartialRefundMethod(selected.stripe_payment_intent ? 'stripe' : 'cash')
  }

  // ── Partial refund ──────────────────────────────────────────────────────────
  // Bargeld sofort ausgeben: Antrag ist schon angelegt -> direkt bestaetigen (FO darf Cash selbst freigeben)
  async function confirmCashNow(refundId: string): Promise<string | null> {
    try {
      const res = await fetch('/api/refund-paid', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
        body: JSON.stringify({ refund_id: refundId }),
      })
      const d = await res.json().catch(() => ({}))
      return res.ok ? null : (d.error ?? 'Error')
    } catch { return 'Network error' }
  }

  async function doPartialRefund(handOut = false) {
    if (!selected) return
    const cents = Math.round(parseFloat(partialRefundAmount.replace(',', '.')) * 100)
    if (isNaN(cents) || cents <= 0) { setPartialRefundMsg('❌ Invalid amount'); return }
    if (!partialRefundMethod) { setPartialRefundMsg('❌ Please select a payment method'); return }
    if (ps && cents > Math.max(0, ps.grossPaid - ps.refunded)) { setPartialRefundMsg(`❌ Exceeds what can be refunded: available ${fmtAmount(Math.max(0, ps.grossPaid - ps.refunded), ps.currency)}`); return }
    const partialReason = composeReason(partialRefundChoice, partialRefundDesc)
    const prErr = reasonError(partialReason)
    if (prErr) { setPartialRefundMsg(`❌ ${prErr}`); return }
    const ppErr = payoutError(partialRefundMethod, payoutString(partialRefundMethod, refundPayout))
    if (ppErr) { setPartialRefundMsg(`❌ ${ppErr}`); return }
    setRefundLoading(true)
    setPartialRefundMsg(null)
    try {
      const res = await fetch('/api/refund', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
        body: JSON.stringify({ booking_id: selected.id, amount_cents: cents, refund_method: partialRefundMethod, description: partialReason, payout_details: payoutString(partialRefundMethod, refundPayout), source_refs: [...refundPaymentIds, ...refundItemKeys], release_session_ids: [...refundReleaseSessionIds] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPartialRefundMsg(`❌ ${data.error ?? 'Error'}`)
      } else {
        let msg = partialRefundMethod === 'cash'
          ? `↩️ Cash refund requested: €${(cents/100).toFixed(2)} — waiting in Front Office → 💵 Cash refunds (confirm when handed over)`
          : `↩️ Refund requested: €${(cents/100).toFixed(2)} via ${partialRefundMethod} — awaiting authorization in Finances → Refunds (money moves and guest is emailed on authorization)`
        if (handOut && partialRefundMethod === 'cash' && data.refund_id) {
          const e = await confirmCashNow(data.refund_id)
          msg = e ? `⚠️ Cash refund requested, but confirming failed: ${e} — use Front Office → 💵 Cash refunds` : `✅ Cash handed over: €${(cents/100).toFixed(2)} — guest emailed`
        }
        setPartialRefundMsg(msg)
        setPartialRefundDesc(''); setPartialRefundChoice(''); setRefundPayout(emptyPayout)
        setRefundItemKeys(new Set()); setRefundPaymentIds(new Set()); setRefundReleaseSessionIds(new Set())
        loadSessions(selected.id)
        setSelected(b => b ? { ...b, payment_state: (data.status as PaymentState) ?? b.payment_state, refunded_amount_cents: data.committed_cents ?? b.refunded_amount_cents, refund_paid_at: null } : b)
        setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, payment_state: (data.status as PaymentState) ?? b.payment_state } : b))
        // Changelog schreibt der Server (/api/refund: refund_requested; Stripe-Webhook: refund) — hier nicht doppelt
        setPartialRefundOpen(false)
        setPartialRefundAmount('')
        setPartialRefundMethod('')
        loadChangelog(selected.id)
        loadPayments(selected.id)
      }
    } catch {
      setPartialRefundMsg('❌ Network error')
    }
    setRefundLoading(false)
  }

  // ── Overview: refund ────────────────────────────────────────────────────────
  async function initiateRefund(handOut = false) {
    if (!selected || !fullRefundMethod) return
    const fullReason = composeReason(fullRefundChoice, fullRefundDesc)
    const frErr = reasonError(fullReason)
    if (frErr) { setRefundMsg(`❌ ${frErr}`); return }
    const fpErr = payoutError(fullRefundMethod, payoutString(fullRefundMethod, refundPayout))
    if (fpErr) { setRefundMsg(`❌ ${fpErr}`); return }
    setRefundLoading(true)
    setRefundMsg(null)
    try {
      const res = await fetch('/api/refund', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
        body: JSON.stringify({ booking_id: selected.id, refund_method: fullRefundMethod, description: fullReason, payout_details: payoutString(fullRefundMethod, refundPayout), release_session_ids: [...fullReleaseIds] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRefundMsg(`❌ ${data.error ?? 'Error'}`)
      } else {
        let msg = fullRefundMethod === 'cash'
          ? `↩️ Full cash refund requested: €${((data.amount_cents ?? 0)/100).toFixed(2)} — waiting in Front Office → 💵 Cash refunds (confirm when handed over)`
          : `↩️ Full refund requested: €${((data.amount_cents ?? 0)/100).toFixed(2)} via ${fullRefundMethod} — awaiting authorization in Finances → Refunds (money moves and guest is emailed on authorization)`
        if (handOut && fullRefundMethod === 'cash' && data.refund_id) {
          const e = await confirmCashNow(data.refund_id)
          msg = e ? `⚠️ Cash refund requested, but confirming failed: ${e} — use Front Office → 💵 Cash refunds` : `✅ Cash handed over: €${((data.amount_cents ?? 0)/100).toFixed(2)} — guest emailed`
        }
        setRefundMsg(msg)
        setFullRefundDesc(''); setFullRefundChoice(''); setRefundPayout(emptyPayout)
        setSelected(b => b ? { ...b, payment_state: (data.status as PaymentState) ?? 'fully_refunded', refunded_at: new Date().toISOString(), refunded_amount_cents: data.committed_cents ?? b.refunded_amount_cents, refund_paid_at: null } : b)
        setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, payment_state: (data.status as PaymentState) ?? 'fully_refunded' } : b))
        loadPayments(selected.id)
        // Changelog schreibt der Server — hier nicht doppelt
        setFullRefundOpen(false)
        loadChangelog(selected.id)
      }
    } catch {
      setRefundMsg('❌ Netzwerkfehler')
    }
    setRefundLoading(false)
  }

  // ── Overview: change package (upgrade/downgrade) ─────────────────────────────
  const COURSE_CATS = ['entry', 'specialty', 'ecology', 'pro']
  async function changePackageSplit() {
    if (!selected || !changePackageId) return
    const ids = [...pkgPersonIds]
    setChangePackageLoading(true)
    setChangePackageMsg(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      const res = await fetch('/api/change-package-split', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ booking_id: selected.id, booking_customer_ids: ids, new_product_id: changePackageId, sessions: pkgSessions.map(x => ({ date: x.date, session: x.session })) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setChangePackageMsg(`❌ ${res.status}: ${d.error ?? 'Package change failed'}`); setChangePackageLoading(false); return }
      const open = (d.open_cents ?? 0) as number
      setChangePackageMsg(`✅ ${ids.length} guest(s) moved to new linked booking ${String(d.new_booking_id).slice(0, 8)} — ${open > 0 ? `€${(open / 100).toFixed(2)} still to collect there` : 'nothing more to pay'}${(d.warnings ?? []).length ? ` · ⚠ ${(d.warnings as string[]).join(' ')}` : ''}`)
      setChangePackageOpen(false); setChangePackageId(null); setPkgSessions([]); setPkgPersonIds(new Set()); setPkgPersonMode('all')
      setSelected(b => b ? { ...b, group_size: (b.group_size ?? ids.length + 1) - ids.length, amount: d.original_amount_cents ?? b.amount } : b)
      await fetchBookings()
      loadChildBookings(selected.id); loadSessions(selected.id); loadChangelog(selected.id); loadPayments(selected.id)
    } catch (e) {
      setChangePackageMsg(`❌ ${e instanceof Error ? e.message : 'Network error'}`)
    }
    setChangePackageLoading(false)
  }
  async function changePackage() {
    if (!selected || !changePackageId) return
    const newProd = addProducts.find(p => p.id === changePackageId)
    if (!newProd) return
    setChangePackageLoading(true)
    setChangePackageMsg(null)
    const oldAmount = selected.amount ?? 0
    // Paketpreis gilt pro Person; Extras (Versicherung/Equipment/Add-ons/Custom) bleiben beim Wechsel erhalten.
    // Vorher: newAmount = Einzelpreis → Gruppe mit Extras wurde als „Downgrade" + Refund gewertet.
    const groupSize = Math.max(1, selected.group_size ?? 1)
    type ExInsurance = { product_id?: string; name: string; per_diver_cents: number; guests: number; total_cents: number }
    type Ex = {
      insurance?: ExInsurance
      equipment?: { total_cents: number }[]
      addons?: { total_cents: number }[]
      custom?: { amount_cents: number }[]
    }
    const exOld = (selected.booking_extras ?? null) as Ex | null
    // DAN-Tagesversicherung hängt an der Anzahl Tauchtage. Ändert der Paketwechsel die Tage
    // (4-Dive → 8-Dive auf 4 Tage), muss die Versicherung neu gerechnet werden — sonst ist der
    // Gast unterversichert. Preise aus course_prices (category insurance, ids insurance-1d/3d/5d/7d/10d).
    let exNew: Ex | null = exOld
    let insuranceNote = ''
    if (exOld?.insurance && exOld.insurance.total_cents > 0 && pkgSessions.length > 0) {
      const dates = [...new Set(pkgSessions.map(sv => sv.date))]
      const blocks = computeInsuranceBlocks(dates)
      const priceFor = (planId: string) => addProducts.find(p => p.id === planId)?.price_cents ?? 0
      const perDiver = blocks.reduce((sum, b) => sum + priceFor(b.planId) * b.units, 0)
      if (perDiver === 0) throw new Error(`Insurance price missing for plan(s) ${blocks.map(b => b.planId).join(', ')} in course_prices`)
      const newIns: ExInsurance = { ...exOld.insurance, per_diver_cents: perDiver, guests: groupSize, total_cents: perDiver * groupSize }
      if (newIns.total_cents !== exOld.insurance.total_cents) {
        insuranceNote = ` · insurance €${(exOld.insurance.total_cents / 100).toFixed(2)} → €${(newIns.total_cents / 100).toFixed(2)} (${dates.length} day${dates.length === 1 ? '' : 's'})`
      }
      exNew = { ...exOld, insurance: newIns }
    }
    const extrasCents = (() => {
      let c = 0
      if (exNew?.insurance?.total_cents) c += exNew.insurance.total_cents
      for (const it of (exNew?.equipment ?? [])) c += it.total_cents
      for (const it of (exNew?.addons ?? [])) c += it.total_cents
      for (const it of (exNew?.custom ?? [])) c += it.amount_cents
      return c
    })()
    const newAmount = newProd.price_cents * groupSize + extrasCents
    const diff = newAmount - oldAmount
    const isCourse = COURSE_CATS.includes(newProd.category ?? '')
    const required = isCourse ? (isProgramProduct(newProd.id) ? 1 : (newProd.duration_days_min ?? 1)) : (newProd.sessions_included ?? 1)
    try {
      // 1) Update booking row
      const { error: bErr } = await supabase.from('bookings')
        .update({ product_name: newProd.name, amount: newAmount, sessions_expected: required, ...(exNew ? { booking_extras: exNew } : {}), updated_at: new Date().toISOString() })
        .eq('id', selected.id)
      if (bErr) throw bErr

      // 2) Optional Stripe refund
      if (diff < 0 && selected.stripe_payment_intent) {
        const { data: { session: authSess } } = await supabase.auth.getSession()
        if (authSess?.access_token) {
          const r = await fetch('/api/refund', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${authSess.access_token}` },
            body: JSON.stringify({ booking_id: selected.id, amount_cents: Math.abs(diff), refund_method: 'stripe', description: composeReason('Package downgrade', `${selected.product_name ?? '?'} → ${newProd.name}`) }),
          })
          const rd = await r.json()
          if (!rd.ok && !rd.manual) {
            setChangePackageMsg(`⚠️ Package updated, but the refund request failed: ${rd.error ?? 'unknown'} — create it manually with Partial refund`)
          }
        }
      }

      // 3) Replace booking_sessions when sessions were picked
      if (pkgSessions.length > 0) {
        const oldSessionList = bkSessions.map(s => `${s.session_date} ${s.session}`).join(', ')
        // Delete booked sessions only
        const { error: delErr } = await supabase.from('booking_sessions')
          .delete()
          .eq('booking_id', selected.id)
          .eq('status', 'booked')
        if (delErr) {
          setChangePackageMsg(`⚠️ Package updated, but sessions failed: ${delErr.message} — fix in Sessions tab`)
        } else {
          const bd: number | null = isCourse ? (newProd.boat_days ?? null) : null
          const sorted = [...pkgSessions].sort((a, b) => a.date.localeCompare(b.date) || sessionRank(a.session) - sessionRank(b.session))
          const firstBoatIdx = bd === null ? 0 : Math.max(0, sorted.length - bd)
          const { error: insErr } = await supabase.from('booking_sessions').insert(
            pkgSessions.map(sv => ({
              booking_id: selected.id,
              session_date: sv.date,
              session: sv.session.toLowerCase(),
              seats: selected.group_size ?? 1,
              status: 'booked',
              is_test: selected.is_test,
              is_boat_day: bd === null ? true : sorted.indexOf(sv) >= firstBoatIdx,
            }))
          )
          if (insErr) {
            setChangePackageMsg(`⚠️ Package updated, but sessions insert failed: ${insErr.message} — fix in Sessions tab`)
          } else {
            const newSessionList = pkgSessions.map(sv => `${sv.date} ${sv.session}`).join(', ')
            await logChange(selected.id, 'sessions_replaced',
              `📅 Sessions set for new package: ${newSessionList}`,
              'sessions', oldSessionList, newSessionList)
          }
        }
        loadSessions(selected.id)
      } else {
        // Keine neuen Sessions gewählt: beim Downgrade die überzähligen alten Sessions entfernen
        // (späteste zuerst), damit die Sessions-Liste zum neuen Paket passt.
        const booked = bkSessions.filter(x => x.status === 'booked')
          .sort((a, b) => a.session_date.localeCompare(b.session_date) || sessionRank(a.session) - sessionRank(b.session))
        if (booked.length > required) {
          const surplus = booked.slice(required)
          const { error: trimErr } = await supabase.from('booking_sessions').delete().in('id', surplus.map(x => x.id))
          if (trimErr) {
            setChangePackageMsg(`⚠️ Package updated, but could not remove surplus sessions: ${trimErr.message} — fix in Sessions tab`)
          } else {
            await logChange(selected.id, 'sessions_replaced',
              `📅 ${surplus.length} surplus session(s) removed for smaller package: ${surplus.map(x => `${x.session_date} ${x.session}`).join(', ')}`,
              'sessions', booked.map(x => `${x.session_date} ${x.session}`).join(', '), booked.slice(0, required).map(x => `${x.session_date} ${x.session}`).join(', '))
          }
          loadSessions(selected.id)
        }
      }

      await logChange(selected.id, 'package_changed',
        `📦 Package changed: ${selected.product_name ?? '?'} → ${newProd.name}${groupSize > 1 ? ` × ${groupSize}` : ''}${extrasCents > 0 ? ` + extras €${(extrasCents / 100).toFixed(2)}` : ''}${insuranceNote}${diff !== 0 ? ` (${diff > 0 ? '+' : ''}€${(diff / 100).toFixed(2)})` : ''}`,
        'product_name', selected.product_name ?? '', newProd.name)
      setSelected(b => b ? { ...b, product_name: newProd.name, amount: newAmount, sessions_expected: required, ...(exNew ? { booking_extras: exNew } : {}) } : b)
      setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, product_name: newProd.name, amount: newAmount, sessions_expected: required, ...(exNew ? { booking_extras: exNew } : {}) } : b))
      setChangePackageMsg(prev => prev ?? (
        diff < 0 ? (selected.stripe_payment_intent
          ? `✅ Package downgraded — €${(Math.abs(diff) / 100).toFixed(2)} refund requested (authorize in Finances → Refunds)`
          : `⚠️ Package downgraded — €${(Math.abs(diff) / 100).toFixed(2)} must be refunded: no card payment on file, use Partial refund and pick the payout method`)
        : diff > 0 ? `✅ Package upgraded — €${(diff / 100).toFixed(2)} additional charge pending`
        : `✅ Package name updated`
      ))
      setChangePackageOpen(false)
      setChangePackageId(null)
      setPkgSessions([])
      loadChangelog(selected.id)
    } catch (e: unknown) {
      setChangePackageMsg('❌ ' + String(e instanceof Error ? e.message : e))
    }
    setChangePackageLoading(false)
  }

  // ── Add tab: load products + child bookings ──────────────────────────────────
  async function loadAddProducts() {
    const { data } = await supabase
      .from('course_prices')
      .select('id, name, category, price_cents, sessions_included, duration_days_min, boat_days')
      .order('category')
      .order('name')
    setAddProducts((data ?? []) as CourseProduct[])
  }

  async function loadChildBookings(parentId: string) {
    const { data } = await supabase
      .from('bookings')
      .select('id,booking_date,session,product_name,customer_name,customer_email,group_size,status,payment_state,amount,currency,payment_method,stripe_payment_intent,stripe_session_id,staff_notes,is_test,created_at,refunded_at,refunded_amount_cents,refund_paid_at,paid_at,checkin_token,checkin_completed_at,source,sessions_expected,parent_booking_id,booking_extras,insurance_choice,request_state,request_payment_mode,approved_until,approved_by_email,declined_reason,request_token')
      .eq('parent_booking_id', parentId)
      .order('created_at', { ascending: false })
    setChildBookings((data ?? []) as Booking[])
  }

  async function saveAddItems() {
    if (!selected || addCart.length === 0) return
    setAddLoading(true)
    setAddMsg(null)
    const gs = Math.max(1, selected.group_size ?? 1)
    const perPerson = gs > 1 && selectedDivers.length > 0
    const chosen = perPerson && addPersonMode === 'some' ? selectedDivers.filter(d => addPersonIds.has(d.id)) : null
    if (perPerson && addPersonMode === 'some' && (!chosen || chosen.length === 0)) { setAddMsg('❌ Tick at least one person (or choose “Everyone”)'); setAddLoading(false); return }
    const personCount = perPerson ? (chosen ? chosen.length : gs) : 1
    const personNames = chosen ? chosen.map((d, i) => d.guest_name ?? d.customer?.name ?? d.customer?.email ?? d.invite_email ?? `Diver ${(d.slot_index ?? i) + 1}`) : []
    const totalCents = addCart.reduce((s, i) => s + i.price_cents, 0) * personCount
    const productName = addCart.map(i => i.name).join(', ')
    const forTxt = perPerson ? (chosen ? `${personNames.join(', ')} (${personCount} of ${gs} guests)` : `all ${gs} guests`) : ''
    const today = new Date().toISOString().slice(0, 10)
    const bookingDate = addCart.find(i => i.booking_date)?.booking_date ?? today
    const { data: newBooking, error: bErr } = await supabase.from('bookings').insert({
      source: 'azd',
      product_name: productName,
      booking_date: bookingDate,
      session: null,
      group_size: personCount,
      status: addPayStatus === 'paid' ? 'confirmed' : 'pending',
      amount: totalCents,
      ...(forTxt ? { staff_notes: `Add-on for ${forTxt}` } : {}),
      currency: selected.currency ?? 'eur',
      customer_name: selected.customer_name,
      customer_email: selected.customer_email,
      is_test: selected.is_test,
      parent_booking_id: selected.id,
      ...(addPayStatus === 'paid' ? { paid_at: new Date().toISOString(), payment_method: addPayMethod } : {}),
    }).select('id').single()
    if (bErr || !newBooking) {
      setAddMsg(`❌ ${bErr?.message ?? 'Failed to create booking'}`)
      setAddLoading(false)
      return
    }
    if (addPayStatus === 'paid') {
      await supabase.from('booking_payments').insert({
        booking_id: newBooking.id,
        amount: totalCents,
        currency: selected.currency ?? 'eur',
        status: 'paid',
        method: addPayMethod,
        paid_at: new Date().toISOString(),
        recorded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      // Review #6: Ledger → payment_state + Mail wie bei jeder anderen FO-Zahlung
      void notifyPaymentRegistered(newBooking.id, totalCents, addPayMethod)
    }
    await logChange(selected.id, 'add_item_created', `Add-on booked${forTxt ? ` for ${forTxt}` : ''}: ${productName} — €${(totalCents / 100).toFixed(2)} (ref ${newBooking.id.slice(0, 8)})`)
    await logChange(newBooking.id, 'booking_created', `Booking created by ${currentUserEmail ?? 'staff'} — ${productName}${forTxt ? ` for ${forTxt}` : ''} €${(totalCents / 100).toFixed(2)}`)
    setAddMsg(`✅ Booking created: ${newBooking.id.slice(0, 8)}`)
    setAddCart([])
    setAddSelectedId('')
    setAddItemDate('')
    setAddPersonMode('all'); setAddPersonIds(new Set())
    loadChildBookings(selected.id)
    fetchBookings()
    setAddLoading(false)
  }

  // ── Payments ────────────────────────────────────────────────────────────────
  async function loadPayments(bookingId: string) {
    setPaymentsLoading(true)
    const { data } = await supabase.from('booking_payments').select('*').eq('booking_id', bookingId).order('created_at')
    setPayments(data ?? [])
    setPaymentsLoading(false)
    loadRefunds(bookingId)
  }

  // Nach jeder erfassten Zahlung: Server wendet die Deposit-Regel an (≥ 50 % → confirmed, 100 % → paid_at)
  // und mailt dem Gast — Buchungsbestätigung beim Bestätigen, sonst „Payment received" (Check-in-Link nur wenn offen).
  // Rückgabe wird sichtbar gemacht (Status + Mail + Fehlertext), nie stumm verschluckt.
  async function notifyPaymentRegistered(bookingId: string, amountCents: number, methodLabel: string): Promise<string> {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/payment-registered', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ booking_id: bookingId, amount_cents: amountCents, method_label: methodLabel }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) return `⚠️ Email not sent (HTTP ${res.status}): ${d.error ?? 'unknown error'}`
      if (d.status === 'confirmed' || d.status === 'confirmed (paid in full)') {
        setSelected(b => b && b.id === bookingId ? { ...b, status: 'confirmed' } : b)
        setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, status: 'confirmed' } : b))
        setEditStatus('confirmed')
      }
      return d.mail === 'booking_confirmation' ? '📧 Booking confirmation sent'
        : d.mail === 'payment_received' ? '📧 Payment received email sent'
        : 'no email (no customer email or booking cancelled)'
    } catch (e) {
      return `⚠️ Email not sent: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  async function addPayment() {
    if (!selected) return
    if (!payForm.notes?.trim()) { setPayMsg('❌ Description is required'); return }
    const cents = Math.round(parseFloat(payForm.amount.replace(',', '.')) * 100)
    if (isNaN(cents) || cents <= 0) { setPayMsg('❌ Invalid amount'); return }
    setPayLoading(true)
    setPayMsg(null)
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null
    const row = {
      booking_id: selected.id,
      amount: cents,
      currency: selected.currency ?? 'eur',
      status: payForm.status,
      method: payForm.method,
      notes: payForm.notes || null,
      due_at: payForm.status === 'pending' && payForm.dueDate ? new Date(payForm.dueDate + 'T12:00:00').toISOString() : null,
      paid_at: payForm.status === 'paid' ? new Date().toISOString() : null,
      recorded_by: uid,
    }
    const { error } = await supabase.from('booking_payments').insert(row)
    if (error) {
      setPayMsg(`❌ ${error.message}`)
    } else {
      const label = PM_LABELS[payForm.method] ?? payForm.method
      const desc = payForm.status === 'paid'
        ? `Payment recorded: ${fmtAmount(cents, selected.currency)} via ${label}`
        : `Pending payment: ${fmtAmount(cents, selected.currency)} via ${label}${payForm.dueDate ? ` (due ${fmtDate(payForm.dueDate)})` : ''}`
      await logChange(selected.id, 'payment_added', desc)
      let mailNote = ''
      if (payForm.status === 'paid') {
        mailNote = ' · ' + await notifyPaymentRegistered(selected.id, cents, label)
      }
      setPayMsg('✅ Payment saved' + mailNote)
      setPayForm({ amount: '', method: 'cash', notes: '', dueDate: '', status: 'paid' })
      setPayFormOpen(false)
      loadPayments(selected.id)
      loadChangelog(selected.id)
    }
    setPayLoading(false)
  }

  async function markPaid(pmt: BookingPayment) {
    if (!selected) return
    await supabase.from('booking_payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', pmt.id)
    const label = PM_LABELS[pmt.method] ?? pmt.method
    await logChange(selected.id, 'payment_received', `Payment received: ${fmtAmount(pmt.amount, pmt.currency)} via ${label}`)
    const mailNote = await notifyPaymentRegistered(selected.id, pmt.amount, label)
    setPayMsg(`✅ Payment received · ${mailNote}`)
    loadPayments(selected.id)
    loadChangelog(selected.id)
  }

  // ── Generate payment link / send payment request email ──────────────────────
  async function sendPaymentLink() {
    if (!selected) return
    setPayLinkLoading(true)
    setPayLinkMsg(null)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) throw new Error('Not authenticated')

      // Compute remaining balance
      const paidCents = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount ?? 0), 0)
      const totalCents = selected.amount ?? 0
      const remainingCents = Math.max(0, totalCents - paidCents)

      let checkoutUrl: string | undefined
      let checkoutSessionId: string | undefined
      let amountCents: number

      if (payLinkAmountType === 'deposit') {
        amountCents = Math.ceil((paidCents === 0 ? totalCents : remainingCents) / 2)
      } else if (payLinkAmountType === 'custom') {
        amountCents = Math.round(parseFloat(payLinkCustomAmount.replace(',', '.')) * 100)
        if (!amountCents || amountCents <= 0) {
          setPayLinkMsg('❌ Enter a valid amount')
          setPayLinkLoading(false)
          return
        }
      } else {
        amountCents = remainingCents > 0 ? remainingCents : totalCents
      }

      if (payLinkMethod === 'link') {
        // Create Stripe checkout
        const sessionsStr = selected.sessions ?? (selected.booking_date ? `${selected.booking_date}:${selected.session ?? 'am'}` : '')
        const sessionsList = sessionsStr.split(',').filter(Boolean).map((p: string) => {
          const [date, sess] = p.split(':')
          return { date, session: sess ?? 'am' }
        })
        const checkoutRes = await fetch('/api/fo-checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            amount_cents: amountCents,
            product_name: selected.product_name ?? 'Dive experience',
            customer_email: selected.customer_email ?? '',
            sessions: sessionsList.length > 0 ? sessionsList : [{ date: selected.booking_date ?? '', session: 'am' }],
            is_deposit: payLinkAmountType === 'deposit',
            total_cents: payLinkAmountType === 'deposit' ? totalCents : undefined,
            booking_id: selected.id,
            group_size: selected.group_size ?? 1,
          }),
        })
        const checkoutData = await checkoutRes.json()
        if (!checkoutRes.ok || !checkoutData.url) throw new Error(checkoutData.error ?? 'Could not create checkout')
        checkoutUrl = checkoutData.url
        checkoutSessionId = checkoutData.id
      }

      // Send payment request email
      const emailRes = await fetch('/api/send-payment-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          booking_id: selected.id,
          payment_method: payLinkMethod,
          is_deposit: payLinkAmountType === 'deposit',
          checkout_url: checkoutUrl,
          amount_cents: amountCents,
        }),
      })
      const emailData = await emailRes.json()
      if (!emailRes.ok) throw new Error(emailData.error ?? 'Could not send email')

      const amtLabel = payLinkAmountType === 'deposit' ? '50% deposit' : payLinkAmountType === 'custom' ? 'custom amount' : 'full amount'
      await logChange(selected.id, 'payment_request_sent', `Payment request sent (${payLinkMethod}, ${amtLabel}) — €${(amountCents / 100).toFixed(2)} to ${selected.customer_email}`)

      // Insert pending payment record so the requested amount shows up in balance
      const pendingMethod = payLinkMethod === 'link' ? 'stripe' : payLinkMethod === 'bank' ? 'bank_transfer' : 'revolut'
      // Audit AZD-010 + stiller Insert-Fehler: recorded_by war der String 'staff' (kein UUID → Insert scheiterte still).
      // Stripe-Session-ID in stripe_payment_intent_id, damit der Webhook GENAU diese Zeile auf paid setzt.
      const { error: pendErr } = await supabase.from('booking_payments').insert({
        booking_id: selected.id,
        amount: amountCents,
        currency: selected.currency ?? 'eur',
        status: 'pending',
        method: pendingMethod,
        notes: `Payment request sent to ${selected.customer_email ?? 'customer'}`,
        recorded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        due_at: new Date().toISOString(),
        ...(checkoutSessionId ? { stripe_payment_intent_id: checkoutSessionId } : {}),
      })
      if (pendErr) setPayLinkMsg(`⚠️ Request sent, but pending payment row failed: ${pendErr.message}`)
      loadPayments(selected.id)
      loadChangelog(selected.id) // Log-Eintrag „Payment request sent" sofort sichtbar, nicht erst nach Tab-Wechsel

      setPayLinkMsg('✅ Payment request sent')
      setTimeout(() => { setPayLinkOpen(false); setPayLinkMsg(null) }, 1800)
    } catch (e) {
      setPayLinkMsg('❌ ' + String(e))
    } finally {
      setPayLinkLoading(false)
    }
  }

  // ── Sessions ────────────────────────────────────────────────────────────────
  async function loadSessions(bookingId: string) {
    setSessLoading(true)
    const { data } = await supabase.from('booking_sessions').select('*').eq('booking_id', bookingId).order('session_date')
    setBkSessions(data ?? [])
    setSessLoading(false)
  }

  // Nach Tag-Änderungen die DAN-Versicherung an die Tauchtage anpassen — sonst meldet der Export mehr Tage als berechnet
  async function reconcileInsurance(bookingId: string): Promise<string> {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/bookings/reconcile-insurance', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ booking_id: bookingId }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) return ` · ⚠ insurance not recalculated: ${d.error ?? `HTTP ${res.status}`}`
      if (d.no_insurance || d.diffCents === 0) return ''
      return ` · insurance recalculated (${d.diffCents > 0 ? '+' : ''}€${(d.diffCents / 100).toFixed(2)} for ${d.days} day${d.days === 1 ? '' : 's'})`
    } catch (e) { return ` · ⚠ insurance not recalculated: ${e instanceof Error ? e.message : String(e)}` }
  }

  async function addSession() {
    if (!selected || !sessForm.date) { setSessMsg('❌ Select a date'); return }
    if (sessForm.isBoatDay === null && sessForm.time !== 'night') { setSessMsg('❌ Choose boat or pool'); return }
    setSessAddLoading(true)
    setSessMsg(null)
    const { error } = await supabase.from('booking_sessions').insert({
      booking_id: selected.id,
      session_date: sessForm.date,
      session: sessForm.time,
      seats: selected.group_size,
      status: 'booked', // DB-Constraint kennt nur booked/cancelled/no_show/completed — 'confirmed' schlug still fehl
      is_test: selected.is_test,
      is_boat_day: sessForm.time === 'night' ? false : sessForm.isBoatDay,
      notes: sessForm.notes.trim() || null,
    })
    if (error) {
      setSessMsg(`❌ ${error.message}`)
    } else {
      const loc = sessForm.isBoatDay ? '🚤 Boat' : '🏊 Pool'
      await logChange(selected.id, 'session_added', `Session added: ${fmtDate(sessForm.date)} ${sessForm.time.toUpperCase()} · ${loc}${sessForm.notes ? ` — ${sessForm.notes}` : ''}`)
      const insNote = await reconcileInsurance(selected.id)
      setSessMsg(`✅ Session saved${insNote}`)
      if (insNote) { loadPayments(selected.id); const { data: fresh } = await supabase.from('bookings').select('amount, booking_extras, payment_state').eq('id', selected.id).maybeSingle(); if (fresh) setSelected(b => b ? { ...b, ...fresh } : b) }
      setSessForm({ date: '', time: 'am', isBoatDay: null, notes: '' })
      setSessFormOpen(false)
      loadSessions(selected.id)
      loadChangelog(selected.id)
    }
    setSessAddLoading(false)
  }

  async function updateSession(id: string) {
    if (!selected) return
    if (editSessForm.isBoatDay === null) { setSessMsg('❌ Choose boat or pool'); return }
    if (editSessForm.time === 'tbd') { setSessMsg('❌ Choose AM or PM — the time slot has to be set for the boat and the guest'); return }
    setSessEditLoading(true)
    setSessMsg(null)
    const old = bkSessions.find(s => s.id === id)
    const { error } = await supabase.from('booking_sessions').update({
      session_date: editSessForm.date,
      session: editSessForm.time,
      is_boat_day: editSessForm.isBoatDay,
      notes: editSessForm.notes.trim() || null,
    }).eq('id', id)
    if (error) {
      setSessMsg(`❌ ${error.message}`)
    } else {
      const oldDesc = old ? `${fmtDate(old.session_date)} ${old.session.toUpperCase()}` : ''
      const newDesc = `${fmtDate(editSessForm.date)} ${editSessForm.time.toUpperCase()} · ${editSessForm.isBoatDay ? '🚤 Boat' : '🏊 Pool'}`
      await logChange(selected.id, 'session_updated', `Session updated: ${oldDesc} → ${newDesc}${editSessForm.notes ? ` — ${editSessForm.notes}` : ''}`)
      if (old && old.session_date !== editSessForm.date) { const insNote = await reconcileInsurance(selected.id); if (insNote) { setSessMsg(`✅ Session updated${insNote}`); loadPayments(selected.id) } }
      // bookings.booking_date/session = Tag 1 der Buchung (Fallback für Bootskarte, Mails, Listen) mitziehen,
      // wenn die früheste Session bearbeitet wurde.
      const earliest = [...bkSessions.map(x => x.id === id ? { ...x, session_date: editSessForm.date, session: editSessForm.time } : x)]
        .filter(x => x.status === 'booked')
        .sort((a, b) => a.session_date.localeCompare(b.session_date))[0]
      if (earliest && (earliest.session_date !== selected.booking_date || earliest.session !== selected.session)) {
        const { error: bErr } = await supabase.from('bookings').update({ booking_date: earliest.session_date, session: earliest.session }).eq('id', selected.id)
        if (!bErr) {
          setSelected(b => b ? { ...b, booking_date: earliest.session_date, session: earliest.session } : b)
          setBookings(bs => bs.map(b => b.id === selected.id ? { ...b, booking_date: earliest.session_date, session: earliest.session } : b))
        }
      }
      // Letztes offenes Zeitfenster gesetzt → Instructor-Ticket (note = booking:<id>) schließen
      if (old?.session === 'tbd') {
        const remaining = bkSessions.filter(x => x.id !== id && x.session === 'tbd' && x.status === 'booked').length
        if (remaining === 0) {
          const { error: tErr } = await supabase.from('support_tickets').update({ status: 'resolved' }).eq('note', `booking:${selected.id}`).neq('status', 'resolved')
          if (tErr) setSessMsg(`✅ Session updated — but instructor ticket could not be resolved: ${tErr.message}`)
          else await logChange(selected.id, 'ticket_resolved', '🎫 All time slots set — instructor ticket resolved')
          // Gast informieren: alle Startzeiten in einer Mail
          try {
            const authTok = (await supabase.auth.getSession()).data.session?.access_token
            const r = await fetch('/api/bookings/session-times', {
              method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${authTok ?? ''}` },
              body: JSON.stringify({ booking_id: selected.id }),
            })
            const d = await r.json()
            if (!r.ok) setSessMsg(`✅ Times set — but the start-time email failed: ${r.status} ${d.error ?? ''}`)
            else setSessMsg('✅ Times set — start-time email sent to the guest')
          } catch (e) {
            setSessMsg(`✅ Times set — but the start-time email failed: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
      setSessMsg(prev => prev ?? '✅ Session updated')
      setEditingSessionId(null)
      loadSessions(selected.id)
      loadChangelog(selected.id)
    }
    setSessEditLoading(false)
  }

  async function deleteSession(id: string) {
    if (!selected) return
    setSessEditLoading(true)
    setSessMsg(null)
    const old = bkSessions.find(s => s.id === id)
    const { error } = await supabase.from('booking_sessions').delete().eq('id', id)
    if (error) {
      setSessMsg(`❌ ${error.message}`)
    } else {
      const desc = old ? `${fmtDate(old.session_date)} ${old.session.toUpperCase()}` : id
      await logChange(selected.id, 'session_deleted', `Session removed: ${desc}`)
      setSessMsg('✅ Session removed')
      setSessDeleteConfirm(null)
      loadSessions(selected.id)
      loadChangelog(selected.id)
    }
    setSessEditLoading(false)
  }

  // ── Changelog ───────────────────────────────────────────────────────────────
  async function loadChangelog(bookingId: string) {
    setChangelogLoading(true)
    const { data } = await supabase.from('booking_changelog').select('*').eq('booking_id', bookingId).order('changed_at', { ascending: false })
    setChangelog(data ?? [])
    setChangelogLoading(false)
  }

  // ── Payment summary ─────────────────────────────────────────────────────────
  // Name der Person, die taucht (Check-in / Profil, Slot 0) – nicht der Stripe-Zahler
  const detailName: string | null = (() => {
    const d0 = selectedDivers.find((d: any) => d.slot_index === 0) ?? selectedDivers[0]
    if (!d0) return null
    const c = d0.customer
    const full = [c?.first_name, c?.last_name].filter(Boolean).join(' ')
    return (d0.guest_name || full || c?.name || '').trim() || null
  })()
  const payerName: string | null = selected?.customer_name ?? null

  const ps = (() => {
    if (!selected) return null
    // Online-Buchung: Stripe kassiert den vollen Betrag, es gibt keine booking_payments-Zeile dafür →
    // bookings.amount + paid_at zählt als Zahlung. Walk-ins/Staff-Buchungen: ausschließlich booking_payments —
    // paid_at ist dort nur ein Status-Marker und darf nie als Betrag gezählt werden (sonst Phantom-„overpaid").
    const isOnlineStripe = Boolean(selected.stripe_session_id || selected.stripe_payment_intent)
    // Seit dem Webhook-Fix (Deposit) schreibt Stripe eine booking_payments-Zeile mit stripe_payment_intent_id.
    // Nur Alt-Buchungen ohne so eine Zeile zählen noch bookings.amount + paid_at als Zahlung.
    const hasStripeRows = payments.some(p => Boolean(p.stripe_payment_intent_id))
    const initialPaid = isOnlineStripe && !hasStripeRows && selected.paid_at && selected.amount ? selected.amount : 0
    const extraPaid   = payments.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.amount, 0)
    const pending     = payments.filter(p => p.status === 'pending').reduce((acc, p) => acc + p.amount, 0)
    const grossPaid   = initialPaid + extraPaid
    // Refunds abziehen: bei Vollrefund alles, sonst refunded_amount_cents (Stripe: kumulativ aus Webhook; manuell: aus /api/refund).
    // Zählt ab Beantragung, nicht erst ab „marked as paid" — sonst steht bis zur Finances-Bestätigung ein Phantom-„overpaid".
    // Quelle: booking_refunds (requested + paid). Fallback auf refunded_amount_cents für Alt-Buchungen ohne Zeilen.
    const rowsCommitted = refundRows.filter(r => r.status === 'requested' || r.status === 'paid').reduce((a, r) => a + r.amount, 0)
    const refunded    = Math.min(grossPaid, refundRows.length > 0 ? rowsCommitted : (selected.payment_state === 'fully_refunded' ? grossPaid : (selected.refunded_amount_cents ?? 0)))
    const refundPending = refundRows.length > 0 ? refundRows.some(r => r.status === 'requested') : (refunded > 0 && !selected.refund_paid_at)
    // Getrennt ausweisen: bereits autorisiert vs. noch wartend (Header zeigt sonst „50 € (awaiting)" obwohl nur 10 € offen sind)
    const refundAwaiting = refundRows.length > 0 ? refundRows.filter(r => r.status === 'requested').reduce((a, r) => a + r.amount, 0) : (refundPending ? refunded : 0)
    const refundAuthorized = refunded - Math.min(refunded, refundAwaiting)
    const total       = grossPaid - refunded
    const bookingAmount = selected.amount ?? 0 // Review #5: cancelled behält die Summe — sonst Phantom-„Overpaid“ für gehaltenes Geld
    // Offen = Buchungssumme minus tatsächlich Bezahltes. Ein Refund (auch ein beantragter) erzeugt nie eine Schuld:
    // sonst stünde nach einem Teilrefund „Due Balance“ bei einem voll bezahlten Gast. Sinkt die Buchungssumme
    // (z. B. Versicherung entfernt), passt bookingAmount schon, und die Überzahlung läuft weiter über `total`.
    const dueBalance  = selected.status === 'cancelled' ? 0 : Math.max(0, bookingAmount - grossPaid)
    const overpaid    = Math.max(0, total - bookingAmount)
    return { isOnlineStripe, initialPaid, extraPaid, pending, grossPaid, refunded, refundPending, refundAwaiting, refundAuthorized, total, dueBalance, overpaid, currency: selected.currency ?? 'eur' }
  })()

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: '20px', minHeight: embedded ? 0 : '500px', alignItems: 'flex-start' }}>

      {slotToast && (
        <div role="status" onClick={() => setSlotToast(null)} style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000, maxWidth: 'min(560px, 92vw)', padding: '12px 18px', borderRadius: '10px', background: slotToast.includes('email failed') ? 'rgba(255,208,128,.95)' : 'rgba(79,227,200,.95)', color: '#04121F', fontSize: '13px', fontWeight: 700, boxShadow: '0 10px 30px rgba(0,0,0,.5)', cursor: 'pointer' }}>
          {slotToast}
        </div>
      )}

      {/* ── LEFT: List ── */}
      {!embedded && <div style={{ flex: 1, minWidth: 0 }}>

        {/* Filter bar (im Requests-Tab übernimmt der Planner die Liste) */}
        {!requestsOnly && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(0) }}
            style={{ ...inp, width: '130px' }} />
          <span style={{ color: s.muted, alignSelf: 'center', fontSize: '12px' }}>→</span>
          <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(0) }}
            style={{ ...inp, width: '130px' }} />
          {!requestsOnly && <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
            style={{ ...inp, width: '130px' }}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </select>}
          {requestsOnly && <span style={{ alignSelf: 'center', fontSize: '12px', color: s.muted, whiteSpace: 'nowrap' }}>{openRequests ?? '…'} waiting for approval</span>}
          <input type="text" placeholder="Search name / email / product / ref…" value={filterSearch}
            onChange={e => { setFilterSearch(e.target.value); setPage(0) }}
            style={{ ...inp, flex: 1, minWidth: '160px' }} />
          <span title="Switch at the top right (next to Sign out)" style={{ fontSize: '12px', whiteSpace: 'nowrap', fontWeight: 700, color: showTest ? '#ffd080' : s.muted }}>
            {showTest ? '🧪 Sandbox' : '🔒 Production'}
          </span>
          <button onClick={fetchBookings}
            style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, cursor: 'pointer', fontFamily: s.font, fontSize: '12px' }}>
            ↻
          </button>
        </div>}

        {/* Request planner: nur im Requests-Tab */}
        {requestsOnly && sandbox !== null && <RequestPlanner showTest={showTest} onChanged={() => { void fetchBookings() }} onOpen={async (id) => {
          const hit = bookings.find(x => x.id === id) ?? ((await supabase.from('bookings').select('*').eq('id', id).maybeSingle()).data as Booking | null)
          if (hit) openBooking(hit)
        }} selectedId={selected?.id ?? null} />}

        {/* Table */}
        {!requestsOnly && <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ color: s.muted, padding: '32px', textAlign: 'center', fontSize: '13px' }}>Loading…</div>
          ) : bookings.length === 0 ? (
            <div style={{ color: s.muted, padding: '32px', textAlign: 'center', fontSize: '13px' }}>{requestsOnly ? 'No open booking requests — approved and paid requests move to Booking History.' : 'No bookings found'}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                  {['Ref', 'Booked', 'Shift', 'Product', 'Customer', '#', 'Status', 'Payment', 'Method', 'Amount', 'Check-In'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: s.muted, fontWeight: 700, fontSize: '10.5px', letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Kind-Buchungen (Split-Gäste, Add-ons) direkt unter ihrer Hauptbuchung einsortieren
                  const ids = new Set(bookings.map(b => b.id))
                  const byParent = new Map<string, Booking[]>()
                  for (const b of bookings) if (b.parent_booking_id && ids.has(b.parent_booking_id)) {
                    byParent.set(b.parent_booking_id, [...(byParent.get(b.parent_booking_id) ?? []), b])
                  }
                  const ordered: Booking[] = []
                  for (const b of bookings) {
                    if (b.parent_booking_id && ids.has(b.parent_booking_id)) continue
                    ordered.push(b, ...(byParent.get(b.id) ?? []))
                  }
                  return ordered
                })().map(b => (
                  <tr key={b.id} onClick={() => openBooking(b)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,.04)', cursor: 'pointer', background: selected?.id === b.id ? 'rgba(243,239,230,.07)' : 'transparent', transition: 'background .12s' }}
                    onMouseEnter={e => { if (selected?.id !== b.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected?.id === b.id ? 'rgba(243,239,230,.07)' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', color: s.muted, fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {b.parent_booking_id && <span style={{ color: '#ffa030', marginRight: '4px' }}>↳</span>}
                      {b.id.slice(0, 8)}
                    </td>
                    <td style={{ padding: '8px 10px', color: s.text, whiteSpace: 'nowrap' }}>{fmtDate(b.created_at)}</td>
                    <td style={{ padding: '8px 10px', color: s.muted, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>{b.session?.toUpperCase() ?? '—'}</td>
                    <td style={{ padding: '8px 10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.parent_booking_id && <span style={{ fontSize: '10px', color: '#ffa030', marginRight: '4px' }}>↳ {bookings.find(x => x.id === b.parent_booking_id)?.id.slice(0, 8) ?? '…'}</span>}
                      <span style={{ color: s.text }}>{b.product_name}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: s.text, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={diverNames[b.id] && b.customer_name && diverNames[b.id] !== b.customer_name ? `Payer (Stripe): ${b.customer_name}` : undefined}>{diverNames[b.id] ?? b.customer_name ?? b.customer_email ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: s.muted, textAlign: 'center' }}>{b.group_size}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: STATUS_BG[b.status] ?? 'rgba(200,200,200,.12)', color: STATUS_CLR[b.status] ?? '#aaa' }}>
                        {b.status}
                      </span>
                      {b.request_state && b.request_state !== 'converted' && (
                        <span title={b.request_state === 'approved' ? `Approved${b.approved_by_email ? ` by ${b.approved_by_email}` : ''} — waiting for the guest to confirm & pay` : b.request_state === 'expired' ? 'Approved, guest has not confirmed in time' : b.request_state === 'declined' ? (b.declined_reason ?? 'Declined') : 'Booking request — waiting for approval'}
                          style={{ marginLeft: '5px', padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', background: b.request_state === 'approved' ? 'rgba(243,239,230,.14)' : 'rgba(255,255,255,.08)', color: b.request_state === 'approved' ? s.accent : s.muted }}>
                          {b.request_state === 'requested' ? 'Request' : b.request_state === 'approved' ? 'Awaiting guest' : b.request_state === 'expired' ? 'Overdue' : 'Declined'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <PaymentBadge state={b.payment_state} />
                    </td>
                    <td style={{ padding: '8px 10px', color: s.muted, fontSize: '11.5px', whiteSpace: 'nowrap' }}>{pmLabel(b)}</td>
                    <td style={{ padding: '8px 10px', color: s.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(b.amount, b.currency)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 7px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, background: b.checkin_completed_at ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.06)', color: b.checkin_completed_at ? '#4ade80' : '#888' }}>
                        {b.checkin_completed_at ? '✓ Done' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>}

        {/* Pagination */}
        {!requestsOnly && <div style={{ display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' }}>
          {page > 0 && (
            <button onClick={() => setPage(p => p - 1)}
              style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.accent, cursor: 'pointer', fontFamily: s.font, fontSize: '13px' }}>
              ← Prev
            </button>
          )}
          {bookings.length === PAGE_SIZE && (
            <button onClick={() => setPage(p => p + 1)}
              style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.accent, cursor: 'pointer', fontFamily: s.font, fontSize: '13px' }}>
              Next →
            </button>
          )}
          <span style={{ fontSize: '12px', color: s.muted }}>Page {page + 1} · {bookings.length} rows</span>
        </div>}
      </div>}

      {/* ── RIGHT: Detail Panel ── */}
      {embedded && loading && <div style={{ color: s.muted, fontSize: '13px', padding: '20px' }}>Loading booking…</div>}
      {embedded && !loading && !selected && <div style={{ color: '#ff6464', fontSize: '13px', padding: '20px' }}>Booking not found.</div>}
      {selected && (
        <div style={{ width: embedded ? '100%' : '860px', flexShrink: 0, background: 'rgba(255,255,255,.025)', borderRadius: '14px', border: '1px solid rgba(255,255,255,.09)', display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', position: embedded ? 'static' : 'sticky', top: '20px', maxHeight: embedded ? 'none' : '96vh', overflow: 'hidden' }}>

          {/* Panel header */}
          <div style={{ padding: '16px 20px 0', borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0 }}>
            {/* Title row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: s.text, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.product_name ?? '—'}</div>
                <div style={{ fontSize: '11px', color: s.muted }}>
                  {detailName ?? selected.customer_name ?? selected.customer_email ?? '—'} · {fmtDate(selected.booking_date)}{selected.session ? ` · ${selected.session.toUpperCase()}` : ''}
                </div>
              </div>
              {!embedded && <button onClick={() => setSelected(null)}
                style={{ background: 'transparent', border: 'none', color: s.muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 0 0 8px', flexShrink: 0 }}>×</button>}
            </div>

            {/* Payment summary strip */}
            {ps && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px', fontSize: '12px' }}>
                <span style={{ color: s.muted }}>Paid:</span>
                <span style={{ fontWeight: 700, color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(ps.grossPaid, ps.currency)}</span>
                {ps.dueBalance > 0 && (
                  <>
                    <span style={{ color: '#ff6464' }}>· Open:</span>
                    <span style={{ fontWeight: 700, color: '#ff4444', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(ps.dueBalance, ps.currency)}</span>
                  </>
                )}
                {ps.refunded > 0 && (
                  <>
                    <span style={{ color: '#ffa030' }}>· Refunded:</span>
                    <span style={{ fontWeight: 700, color: '#ffa030', fontVariantNumeric: 'tabular-nums' }}>
                      {ps.refundAuthorized > 0 && ps.refundAwaiting > 0
                        ? `${fmtAmount(ps.refundAuthorized, ps.currency)} authorized + ${fmtAmount(ps.refundAwaiting, ps.currency)} awaiting authorization`
                        : ps.refundAwaiting > 0
                          ? `${fmtAmount(ps.refundAwaiting, ps.currency)} (awaiting authorization)`
                          : `${fmtAmount(ps.refunded, ps.currency)} (authorized)`}
                    </span>
                  </>
                )}
                {ps.refunded > 0 && (
                  <>
                    <span style={{ color: s.muted }}>· Net kept:</span>
                    <span style={{ fontWeight: 700, color: s.text, fontVariantNumeric: 'tabular-nums' }} title="Paid minus refunded — what we still hold">{fmtAmount(ps.total, ps.currency)}</span>
                  </>
                )}
                {ps.overpaid > 0 && (
                  <>
                    <span style={{ color: '#a78bfa' }}>· Overpaid:</span>
                    <span style={{ fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(ps.overpaid, ps.currency)}</span>
                  </>
                )}
                {/* Erwartete Zahlungen sind ein Teil des offenen Betrags, keine zweite Summe (Lucas 06.11.2026) */}
                {ps.pending > 0 && ps.dueBalance > 0 && (
                  <span style={{ color: s.muted }}>(of which {fmtAmount(Math.min(ps.pending, ps.dueBalance), ps.currency)} expected, see payment history)</span>
                )}
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '2px' }}>
              {(['overview', 'payments', 'sessions', 'changelog', 'add', 'divers'] as const).map(tab => {
                const pendingPay = payments.filter(p => p.status === 'pending').length
                const label =
                  tab === 'overview'  ? '📋 Info' :
                  tab === 'payments'  ? `💰 Payments${pendingPay > 0 ? ` (${pendingPay}!)` : ''}` :
                  tab === 'sessions'  ? `📅 Sessions (${bkSessions.length || (selected?.sessions ?? '').split(',').filter(Boolean).length})` :
                  tab === 'add'       ? `➕ Add${childBookings.length > 0 ? ` (${childBookings.length})` : ''}` :
                  tab === 'divers'    ? `👤 Divers (${selectedDivers.length})` :
                  `📜 Log${changelog.length > 0 ? ` (${changelog.length})` : ''}`
                return (
                  <button key={tab} onClick={() => { setDetailTab(tab); if (tab === 'add' && addProducts.length === 0) loadAddProducts() }}
                    style={{ flex: 1, padding: '7px 3px', borderRadius: '8px 8px 0 0', border: 'none', background: detailTab === tab ? 'rgba(243,239,230,.1)' : 'transparent', color: detailTab === tab ? s.accent : s.muted, fontSize: '10.5px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font, borderBottom: `2px solid ${detailTab === tab ? s.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Panel body — scrollable */}
          <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* ══ OVERVIEW TAB ══ */}
            {detailTab === 'overview' && (<>

              {/* Booking request (Low Season): Approve / Decline / Resend link — nur Hauptbuchung */}
              {selected.request_state && selected.request_state !== 'converted' && !selected.parent_booking_id && (
                <RequestPanel booking={selected} childBookings={childBookings} onChanged={async () => {
                  const { data: fresh } = await supabase.from('bookings').select('*').eq('id', selected.id).maybeSingle()
                  if (fresh) { setSelected(fresh as Booking); setBookings(prev => prev.map(x => x.id === fresh.id ? { ...x, ...(fresh as Booking) } : x)) }
                  void loadChangelog(selected.id); void loadPayments(selected.id); void fetchBookings()
                }} />
              )}
              {selected.request_state && selected.parent_booking_id && (
                <div style={{ fontSize: '12px', color: s.muted, background: 'rgba(255,255,255,.03)', borderRadius: '8px', padding: '8px 10px' }}>📝 Part of a booking request — approve or decline on the main booking.</div>
              )}

              {/* Info rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {([
                  ['Date',      `${fmtDate(selected.booking_date)}${selected.session ? ` · ${selected.session.toUpperCase()}` : ''}`],
                  ['Product',   selected.product_name ?? '—'],
                  ['Customer',  detailName ?? selected.customer_name ?? '—'],
                  ...(detailName && payerName && detailName !== payerName ? [['Payer (Stripe)', payerName] as [string, string]] : []),
                  ['Email',     selected.customer_email ?? '—'],
                  ...((() => {
                    const ph = selectedCustomer?.phone || [selectedCustomer?.phone_prefix, selectedCustomer?.phone_number].filter(Boolean).join(' ') || null
                    return ph ? [['Phone', ph]] : []
                  })() as [string, string][]),
                  ['Guests',    String(selected.group_size)],
                  ['Amount',    fmtAmount(selected.amount, selected.currency)],
                  ['Payment',   pmLabel(selected)],
                  ['Source',    selected.source ?? '—'],
                  ['Booked at', fmtDateTime(selected.created_at)],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px' }}>
                    <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>{k}</span>
                    <span style={{ color: s.text, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
                {/* Verknüpfte Buchungen: Split-Gäste / Add-ons hängen an der Hauptbuchung */}
                {selected.parent_booking_id && (() => {
                  const parent = bookings.find(x => x.id === selected.parent_booking_id)
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', alignItems: 'center' }}>
                      <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>Part of</span>
                      <button type="button" onClick={() => parent && openBooking(parent)} disabled={!parent}
                        style={{ background: 'transparent', border: 'none', color: '#ffa030', fontFamily: 'monospace', fontSize: '12px', cursor: parent ? 'pointer' : 'default', padding: 0 }}>
                        ↳ {selected.parent_booking_id.slice(0, 8)}{parent?.customer_name ? ` · ${parent.customer_name}` : ''}
                      </button>
                    </div>
                  )
                })()}
                {childBookings.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', alignItems: 'flex-start' }}>
                    <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>Linked</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      {childBookings.map(cb => (
                        <button key={cb.id} type="button" onClick={() => openBooking(cb)}
                          style={{ background: 'transparent', border: 'none', color: '#ffa030', fontSize: '12px', cursor: 'pointer', padding: 0, textAlign: 'right' }}>
                          ↳ <span style={{ fontFamily: 'monospace' }}>{cb.id.slice(0, 8)}</span> · {cb.customer_name ?? cb.product_name} · {fmtAmount(cb.amount, cb.currency)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Check-in status row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', alignItems: 'center' }}>
                  <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>Check-in</span>
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: selected.checkin_completed_at ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.06)', color: selected.checkin_completed_at ? '#4ade80' : '#888' }}>
                    {selected.checkin_completed_at ? `✓ ${fmtDateTime(selected.checkin_completed_at)}` : 'Pending'}
                  </span>
                </div>
                {selectedCustomer && (() => {
                  const profileName = [selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(' ') || null
                  const extraRows: [string, React.ReactNode][] = []
                  if (profileName && profileName !== (detailName ?? selected.customer_name)) extraRows.push(['Profile name', profileName])
                  if (selectedCustomer.gender) extraRows.push(['Gender', selectedCustomer.gender])
                  if (selectedCustomer.country_of_residence) extraRows.push(['Country of residence', selectedCustomer.country_of_residence])
                  return extraRows.map(([k, v]) => (
                    <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px' }}>
                      <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>{k}</span>
                      <span style={{ color: s.text, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                    </div>
                  ))
                })()}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px' }}>
                  <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>Waiver</span>
                  <span style={{ textAlign: 'right' }}>
                    {selectedCustomer?.waiver_pdf_url
                      ? <a href={waiverHref(selectedCustomer.waiver_pdf_url) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ color: s.accent }}>Open PDF</a>
                      : <span style={{ color: s.text }}>—</span>}
                  </span>
                </div>
                {selectedCustomer?.staff_notes && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px' }}>
                    <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>Customer notes</span>
                    <span style={{ color: s.muted, textAlign: 'right', fontStyle: 'italic', wordBreak: 'break-all' }}>{selectedCustomer.staff_notes}</span>
                  </div>
                )}
                {selectedCustomer?.created_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px' }}>
                    <span style={{ color: s.muted, flexShrink: 0, minWidth: '64px' }}>Customer since</span>
                    <span style={{ color: s.text, textAlign: 'right' }}>{fmtDate(selectedCustomer.created_at)}</span>
                  </div>
                )}
              </div>


              {/* Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={lbl}>Status</span>
                {/* Display-only badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ padding: '5px 14px', borderRadius: '20px', border: `1px solid ${STATUS_CLR[selected.status as keyof typeof STATUS_CLR] ?? 'rgba(255,255,255,.2)'}`, background: STATUS_BG[selected.status as keyof typeof STATUS_BG] ?? 'rgba(255,255,255,.04)', color: STATUS_CLR[selected.status as keyof typeof STATUS_CLR] ?? s.muted, fontSize: '12px', fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.04em' }}>
                    {selected.status}
                  </span>
                  <PaymentBadge state={selected.payment_state} size={12} />
                </div>
              </div>

              {/* booking_extras: Booking Details (Package + Extras + Total) */}
              {(() => {
                type ExtrasInsurance = { name: string; total_cents: number; guests: number; per_diver_cents: number }
                type ExtrasLineItem = { name: string; quantity: number; unit_price_cents: number; total_cents: number }
                type ExtrasCustom = { label: string; amount_cents: number }
                type ExtrasDiscount = { label: string; amount_cents?: number }
                const ex = selected.booking_extras as {
                  insurance?: ExtrasInsurance
                  equipment?: ExtrasLineItem[]
                  addons?: ExtrasLineItem[]
                  custom?: ExtrasCustom[]
                  discounts?: ExtrasDiscount[]
                } | null

                // Compute extras total to derive package price
                let extrasTotalCents = 0
                if (ex?.insurance?.total_cents) extrasTotalCents += ex.insurance.total_cents
                for (const item of (ex?.equipment ?? [])) extrasTotalCents += item.total_cents
                for (const item of (ex?.addons ?? [])) extrasTotalCents += item.total_cents
                for (const item of (ex?.custom ?? [])) extrasTotalCents += item.amount_cents

                const packageCents = (selected.amount ?? 0) - extrasTotalCents
                const totalCents = selected.amount ?? 0

                const rows: { label: string; detail: string }[] = []
                // Package as first line item
                // Einheitliches Format für alle Zeilen: „Menge× Einzelpreis = Summe"
                const guests = Math.max(1, selected.group_size ?? 1)
                const line = (qty: number, unitCents: number, totalCents: number) =>
                  `${qty}× €${(unitCents / 100).toFixed(2)} = €${(totalCents / 100).toFixed(2)}`
                rows.push({
                  label: selected.product_name ?? 'Package',
                  detail: packageCents % guests === 0 ? line(guests, packageCents / guests, packageCents) : `€${(packageCents / 100).toFixed(2)}`,
                })
                if (ex?.insurance && ex.insurance.total_cents > 0) {
                  rows.push({ label: ex.insurance.name, detail: line(ex.insurance.guests, ex.insurance.per_diver_cents, ex.insurance.total_cents) })
                } else if (selected.insurance_choice === 'own') {
                  rows.push({ label: 'Insurance: own policy', detail: 'proof to check at arrival' })
                }
                for (const d of (ex?.discounts ?? [])) {
                  rows.push({ label: d.label, detail: d.amount_cents ? `−€${(d.amount_cents / 100).toFixed(2)}` : 'applied' })
                }
                for (const item of [...(ex?.equipment ?? []), ...(ex?.addons ?? [])]) {
                  rows.push({ label: item.name, detail: line(item.quantity, item.unit_price_cents, item.total_cents) })
                }
                for (const item of (ex?.custom ?? [])) {
                  const neg = item.amount_cents < 0
                  rows.push({
                    label: item.label,
                    detail: `${neg ? '−' : ''}€${(Math.abs(item.amount_cents) / 100).toFixed(2)}`,
                  })
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={lbl}>Booking Details</span>
                    <div style={{ background: 'rgba(255,255,255,.025)', borderRadius: '10px', padding: '10px 13px', border: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {rows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', fontSize: '12px' }}>
                          <span style={{ color: s.text, flex: 1 }}>{row.label}</span>
                          <span style={{ color: s.muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0, fontSize: '11.5px' }}>{row.detail}</span>
                        </div>
                      ))}
                      {totalCents > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,.1)', marginTop: '4px', paddingTop: '6px' }}>
                          <span style={{ color: s.text, flex: 1, fontWeight: 700 }}>Total</span>
                          <span style={{ color: s.accent, fontVariantNumeric: 'tabular-nums', flexShrink: 0, fontSize: '12px', fontWeight: 700 }}>€{(totalCents / 100).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Staff Notes (free text only) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <span style={lbl}>Staff Notes</span>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                  placeholder="TEL: +351... · internal notes…"
                  style={{ ...inp, resize: 'vertical' }} />
                {editNotes !== (selected.staff_notes ?? '') && (
                  <button onClick={saveNotes} disabled={notesLoading}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid rgba(243,239,230,.3)', background: 'rgba(243,239,230,.08)', color: s.accent, fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: s.font, opacity: notesLoading ? .6 : 1 }}>
                    {notesLoading ? 'Saving…' : 'Save notes'}
                  </button>
                )}
              </div>


              {/* Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {selected.stripe_payment_intent && (
                  <a href={`https://dashboard.stripe.com/payments/${selected.stripe_payment_intent}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '12px', color: s.muted, textDecoration: 'none' }}>
                    🔗 Stripe Dashboard ↗
                  </a>
                )}
                {selected.checkin_token && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <a href={`/checkin?token=${selected.checkin_token}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '12px', color: s.muted, textDecoration: 'none' }}>
                      🔗 Check-in Link ↗
                    </a>
                    <button
                      onClick={() => { const url = `${window.location.origin}/checkin?token=${selected.checkin_token}`; navigator.clipboard.writeText(url).catch(() => {}) }}
                      title="Copy link"
                      style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: '5px', color: s.muted, cursor: 'pointer', fontSize: '11px', padding: '1px 6px', fontFamily: s.font, lineHeight: '18px' }}>
                      📋
                    </button>
                  </div>
                )}
              </div>
            </>)}

            {/* ══ PAYMENTS TAB ══ */}
            {detailTab === 'payments' && (<>
              {/* Aktionen: Zahlung, Paketwechsel, Storno — gehören zum Payments-Tab, nicht in die Info-Übersicht */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              {/* Mark as fully paid — immer wenn ein Rest offen ist (nicht nur bei pending) */}
              {renderMarkPaidButton()}
              {/* Change package (upgrade / downgrade) */}
              {selected.status !== 'cancelled' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {changePackageMsg && (
                    <div style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '7px', background: 'rgba(255,255,255,.04)', color: changePackageMsg.startsWith('✅') ? '#4ade80' : changePackageMsg.startsWith('⚠️') ? '#ffa030' : '#ff6464' }}>
                      {changePackageMsg}
                    </div>
                  )}
                  {!changePackageOpen ? (
                    <button onClick={() => { setChangePackageOpen(true); setChangePackageMsg(null); setPkgSessions([]); setPkgPersonIds(new Set()); setPkgPersonMode('all'); if (addProducts.length === 0) loadAddProducts() }}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(243,239,230,.3)', background: 'transparent', color: s.accent, fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', fontFamily: s.font }}>
                      🔄 Change package
                    </button>
                  ) : (
                    <div style={{ background: 'rgba(243,239,230,.04)', border: '1px solid rgba(243,239,230,.2)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: s.text }}>Change package</span>
                        <button onClick={() => { setChangePackageOpen(false); setChangePackageId(null); setPkgSessions([]) }}
                          style={{ background: 'transparent', border: 'none', color: s.muted, cursor: 'pointer', fontSize: '18px', padding: 0, lineHeight: 1, fontFamily: s.font }}>×</button>
                      </div>
                      <div style={{ fontSize: '11.5px', color: s.muted }}>
                        Current: <strong style={{ color: s.text }}>{selected.product_name ?? '—'}</strong> · {fmtAmount(selected.amount, selected.currency)}
                      </div>
                      <select value={changePackageId ?? ''} onChange={e => {
                        const id = e.target.value || null
                        setChangePackageId(id)
                        if (id) {
                          const prod = addProducts.find(p => p.id === id)
                          if (prod) {
                            const isCourse = COURSE_CATS.includes(prod.category ?? '')
                            const req = isCourse ? (isProgramProduct(prod.id) ? 1 : (prod.duration_days_min ?? 1)) : (prod.sessions_included ?? 1)
                            setPkgSessions(bkSessions.slice(0, req).map(s => ({ date: s.session_date, session: (s.session.toLowerCase() as SessionKey) })))
                          }
                        } else {
                          setPkgSessions([])
                        }
                      }}
                        style={{ ...inp, fontSize: '12px' }}>
                        <option value="">Select new package…</option>
                        {addProducts.map(p => {
                          const diff = p.price_cents - (selected.amount ?? 0)
                          const diffStr = pkgPersonMode === 'some' ? '' : diff === 0 ? ' (same price)' : diff > 0 ? ` (+€${(diff / 100).toFixed(2)})` : ` (−€${(Math.abs(diff) / 100).toFixed(2)} refund)`
                          return <option key={p.id} value={p.id}>{p.name} · €{(p.price_cents / 100).toFixed(2)}{diffStr}</option>
                        })}
                      </select>
                      {(selected.group_size ?? 1) > 1 && selectedDivers.length === (selected.group_size ?? 1) && (
                        <div style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted }}>Who changes package?</div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {(['all', 'some'] as const).map(m => (
                              <button key={m} type="button" onClick={() => { setPkgPersonMode(m); if (m === 'all') setPkgPersonIds(new Set()) }}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: s.font,
                                  border: `1px solid ${pkgPersonMode === m ? s.accent : 'rgba(255,255,255,.12)'}`, background: pkgPersonMode === m ? 'rgba(243,239,230,.12)' : 'transparent', color: pkgPersonMode === m ? s.accent : s.muted }}>
                                {m === 'all' ? `Everyone (${selected.group_size})` : 'Only some people'}
                              </button>
                            ))}
                          </div>
                          {pkgPersonMode === 'some' && (<>
                            {selectedDivers.map((d, i) => {
                              const on = pkgPersonIds.has(d.id)
                              const label = d.customer?.name || d.guest_name || `Guest ${(d.slot_index ?? i) + 1}`
                              return (
                                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: s.text, cursor: 'pointer' }}>
                                  <input type="checkbox" checked={on} onChange={() => { const n = new Set(pkgPersonIds); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); setPkgPersonIds(n) }} style={{ accentColor: s.accent }} />
                                  {label}
                                </label>
                              )
                            })}
                            <div style={{ fontSize: '11px', color: s.muted, lineHeight: 1.5 }}>
                              The chosen people move into a new linked booking with the new package (own price, dive days, insurance). The others stay as they are.
                              {pkgPersonIds.size >= (selected.group_size ?? 1) ? <span style={{ color: '#ffa040' }}> Tick fewer than everyone, or choose “Everyone”.</span> : null}
                            </div>
                          </>)}
                        </div>
                      )}
                      {changePackageId && (() => {
                        const np = addProducts.find(p => p.id === changePackageId)
                        if (!np) return null
                        const subset = pkgPersonMode === 'some'
                        const isCourse = COURSE_CATS.includes(np.category ?? '')
                        const required = isCourse ? (isProgramProduct(np.id) ? 1 : (np.duration_days_min ?? 1)) : (np.sessions_included ?? 1)
                        const diff = np.price_cents - (selected.amount ?? 0)
                        return (
                          <>
                            {!subset && <div style={{ fontSize: '11.5px', padding: '6px 10px', borderRadius: '7px',
                              background: diff < 0 ? 'rgba(255,100,100,.08)' : diff > 0 ? 'rgba(74,222,128,.08)' : 'rgba(255,255,255,.04)',
                              color: diff < 0 ? '#ff9494' : diff > 0 ? '#4ade80' : s.muted,
                              border: `1px solid ${diff < 0 ? 'rgba(255,100,100,.2)' : diff > 0 ? 'rgba(74,222,128,.2)' : 'rgba(255,255,255,.08)'}` }}>
                              {diff < 0
                                ? `Refund €${(Math.abs(diff) / 100).toFixed(2)} to guest${selected.stripe_payment_intent ? ' via Stripe' : ' (manual)'}`
                                : diff > 0
                                ? `Charge €${(diff / 100).toFixed(2)} additionally from guest`
                                : 'No price change — product name update only'}
                            </div>}
                            {subset && <div style={{ fontSize: '11.5px', padding: '6px 10px', borderRadius: '7px', background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.2)', color: s.text }}>
                              {pkgPersonIds.size} guest(s) × {np.name} = {fmtAmount(np.price_cents * pkgPersonIds.size, selected.currency)} (plus insurance for the new days if they had ours). Money already paid for their old share moves over automatically; the rest is collected on the new booking.
                            </div>}
                            {subset && (pkgPreview.loading || pkgPreview.data || pkgPreview.error) && (
                              <div style={{ fontSize: '11.5px', padding: '8px 10px', borderRadius: '7px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.09)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ fontWeight: 700, color: s.text }}>Effect on the balance</div>
                                {pkgPreview.loading && <div style={{ color: s.muted }}>Calculating…</div>}
                                {pkgPreview.error && <div style={{ color: '#ff8b70' }}>❌ {pkgPreview.error}</div>}
                                {pkgPreview.data && (() => {
                                  const d = pkgPreview.data!
                                  const f = (c: number) => fmtAmount(c, selected.currency)
                                  const row = (l: string, v: string, c?: string) => (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><span style={{ color: s.muted }}>{l}</span><span style={{ color: c ?? s.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>)
                                  return (<>
                                    {row('This booking (remaining guests)', `${f(d.old_amount_cents)} → ${f(d.original_amount_cents)}`)}
                                    {row('New linked booking', f(d.new_booking_amount_cents))}
                                    {row('Paid money moved over', f(d.transfer_cents))}
                                    {row('Still to collect on the new booking', f(d.open_cents), d.open_cents > 0 ? '#ffa040' : '#4ade80')}
                                    {d.moved_old_share_cents > d.transfer_cents && <div style={{ color: s.muted, marginTop: '2px' }}>Old share of these guests: {f(d.moved_old_share_cents)}. Part of it was not paid yet, so it is not moved.</div>}
                                  </>)
                                })()}
                              </div>
                            )}
                            {required > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ fontSize: '11.5px', color: pkgSessions.length === required ? '#4ade80' : s.muted }}>
                                  Select {required} dive day(s) — {pkgSessions.length}/{required}
                                </div>
                                <SessionPicker
                                  staffMode
                                  required={required}
                                  seats={subset ? Math.max(1, pkgPersonIds.size) : (selected.group_size ?? 1)}
                                  picked={pkgSessions}
                                  onChange={setPkgSessions}
                                />
                              </div>
                            )}
                          </>
                        )
                      })()}
                      {(() => {
                        // Sichtbarer Grund, warum „Confirm change" gesperrt ist (statt stummem Grau)
                        const np = changePackageId ? addProducts.find(p => p.id === changePackageId) : null
                        if (!np) return null
                        const isCourse = COURSE_CATS.includes(np.category ?? '')
                        const required = isCourse ? (isProgramProduct(np.id) ? 1 : (np.duration_days_min ?? 1)) : (np.sessions_included ?? 1)
                        const gs = selected.group_size ?? 1
                        let why: string | null = null
                        if (pkgPersonMode === 'some' && pkgPersonIds.size === 0) why = 'Tick at least one person above (the ones who change package).'
                        else if (pkgPersonMode === 'some' && pkgPersonIds.size >= gs) why = 'Tick fewer than everyone — or choose “Everyone”.'
                        else if (required > 0 && pkgSessions.length !== required) why = `Pick exactly ${required} dive day(s) — ${pkgSessions.length}/${required}.`
                        return why ? <div style={{ fontSize: '11.5px', color: '#ffa040' }}>⚠ {why}</div> : null
                      })()}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setChangePackageOpen(false); setChangePackageId(null); setPkgSessions([]) }}
                          style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontWeight: 600, fontSize: '12px', cursor: 'pointer', fontFamily: s.font }}>
                          Cancel
                        </button>
                        {(() => {
                          const np = changePackageId ? addProducts.find(p => p.id === changePackageId) : null
                          const isCourse = np ? COURSE_CATS.includes(np.category ?? '') : false
                          const required = np ? (isCourse ? (isProgramProduct(np.id) ? 1 : (np.duration_days_min ?? 1)) : (np.sessions_included ?? 1)) : 0
                          const sessionsReady = required === 0 || pkgSessions.length === required
                          const subsetOk = pkgPersonMode === 'all' || (pkgPersonIds.size >= 1 && pkgPersonIds.size < (selected.group_size ?? 1))
                          const canConfirm = !!changePackageId && sessionsReady && !changePackageLoading && subsetOk
                          return (
                            <button onClick={pkgPersonMode === 'some' ? changePackageSplit : changePackage} disabled={!canConfirm}
                              style={{ flex: 2, padding: '8px', borderRadius: '7px', border: 'none',
                                background: canConfirm ? s.accent : 'rgba(255,255,255,.1)',
                                color: canConfirm ? '#090909' : s.muted,
                                fontWeight: 700, fontSize: '12px',
                                cursor: canConfirm ? 'pointer' : 'not-allowed',
                                fontFamily: s.font, opacity: changePackageLoading ? .6 : 1 }}>
                              {changePackageLoading ? 'Updating…' : '✓ Confirm change'}
                            </button>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Cancel booking — double confirm */}
              {selected.status !== 'cancelled' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {!cancelConfirm ? (
                    <button onClick={() => setCancelConfirm(true)}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(255,100,100,.3)', background: 'transparent', color: '#ff6464', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', fontFamily: s.font }}>
                      🚫 Cancel booking
                    </button>
                  ) : (
                    <div style={{ background: 'rgba(255,100,100,.06)', border: '1px solid rgba(255,100,100,.25)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '12.5px', color: '#ff9494', fontWeight: 700, marginBottom: '6px' }}>⚠️ Really cancel this booking?</div>
                      <div style={{ fontSize: '11.5px', color: s.muted, marginBottom: '10px', lineHeight: '1.5' }}>
                        Status will be set to <strong style={{ color: '#ff6464' }}>cancelled</strong>. A cancellation email will be sent automatically.
                      </div>
                      {cancelError && <div style={{ fontSize: '12px', color: '#ff8b70', marginTop: '6px' }}>❌ {cancelError}</div>}
                      {selected.stripe_payment_intent && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', cursor: 'pointer', fontSize: '12px', color: s.text }}>
                          <input
                            type="checkbox"
                            checked={cancelWithRefund}
                            onChange={e => setCancelWithRefund(e.target.checked)}
                            style={{ width: '14px', height: '14px', accentColor: s.accent, cursor: 'pointer' }}
                          />
                          <span>Full refund via Stripe</span>
                          {cancelWithRefund && <span style={{ color: '#4ABC82', fontSize: '11px', fontWeight: 700 }}>✓ Refund email will be sent</span>}
                        </label>
                      )}
                      {cancelKids.length > 0 && (
                        <div style={{ marginBottom: '10px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', fontSize: '11.5px', lineHeight: '1.5', color: s.muted }}>
                          {cancelWithRefund
                            ? <><strong style={{ color: s.text }}>Full refund = whole group.</strong> These linked bookings are cancelled and refunded too (one email to the payer, one refund request each):</>
                            : <>Only <strong style={{ color: s.text }}>this booking</strong> is cancelled. Tick “Full refund” to cancel and refund the whole group, including:</>}
                          {cancelKids.map(k => (
                            <div key={k.id} style={{ color: s.text, paddingTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace', color: '#ffa030' }}>{k.id.slice(0, 8)}</span> · {diverNames[k.id] ?? k.name ?? '—'} · {fmtAmount(k.amount, k.currency)}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ marginBottom: '10px' }}>
                        <ReasonField kind="cancel" choice={cancelChoice} detail={cancelDetail} onChoice={setCancelChoice} onDetail={setCancelDetail} placeholder='What happened? e.g. "Guest called, flu"' />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setCancelConfirm(false); setCancelWithRefund(false); setCancelError(null); setCancelKids([]); setCancelChoice(''); setCancelDetail('') }}
                          style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontWeight: 600, fontSize: '12px', cursor: 'pointer', fontFamily: s.font }}>
                          Go back
                        </button>
                        <button onClick={cancelBooking} disabled={cancelLoading || !reasonComplete(cancelChoice, cancelDetail)}
                          style={{ flex: 1, padding: '8px', borderRadius: '7px', border: 'none', background: cancelWithRefund ? '#7c3aed' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: s.font, opacity: (cancelLoading || !reasonComplete(cancelChoice, cancelDetail)) ? .45 : 1 }}>
                          {cancelLoading ? (cancelWithRefund ? 'Cancelling + Refunding…' : 'Cancelling…') : (cancelWithRefund ? 'Cancel + Refund' : 'Yes, cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>

              <span style={lbl}>Payment actions</span>
              {/* Request Payment button */}
              {selected?.customer_email && (
                <>
                  <button onClick={() => { setPayLinkOpen(o => !o); setPayLinkMsg(null) }}
                    style={{ padding: '9px', borderRadius: '8px', border: `1px solid ${payLinkOpen ? 'rgba(255,208,128,.4)' : 'rgba(255,208,128,.2)'}`, background: payLinkOpen ? 'rgba(255,208,128,.08)' : 'transparent', color: '#FFD080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font, width: '100%' }}>
                    📨 Request Payment
                  </button>
                  {payLinkOpen && (
                    <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,208,128,.15)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFD080' }}>Request Payment</span>
                      {/* Method selector */}
                      <div>
                        <label style={{ ...lbl, marginBottom: '7px', display: 'block' }}>Payment method</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(['bank', 'revolut', 'link'] as const).map(m => (
                            <button key={m} type="button" onClick={() => setPayLinkMethod(m)}
                              style={{ flex: 1, padding: '7px 4px', borderRadius: '7px', border: `1px solid ${payLinkMethod === m ? 'rgba(255,208,128,.4)' : 'rgba(255,255,255,.1)'}`, background: payLinkMethod === m ? 'rgba(255,208,128,.1)' : 'transparent', color: payLinkMethod === m ? '#FFD080' : s.muted, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                              {m === 'link' ? '🔗 Stripe' : m === 'bank' ? '🏦 Bank' : '⚡ Revolut'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Amount type options */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {/* 50% deposit toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: payLinkAmountType === 'deposit' ? 'rgba(255,208,128,.07)' : 'rgba(255,255,255,.02)', border: `1px solid ${payLinkAmountType === 'deposit' ? 'rgba(255,208,128,.3)' : 'rgba(255,255,255,.07)'}`, cursor: 'pointer' }}>
                          <input type="checkbox" checked={payLinkAmountType === 'deposit'} onChange={e => setPayLinkAmountType(e.target.checked ? 'deposit' : 'full')} style={{ accentColor: '#FFD080', width: '14px', height: '14px' }} />
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: payLinkAmountType === 'deposit' ? '#FFD080' : s.text }}>50% deposit only</div>
                            <div style={{ fontSize: '11px', color: s.muted }}>Guest pays half now, balance on arrival</div>
                          </div>
                        </label>
                        {/* Custom amount */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: payLinkAmountType === 'custom' ? 'rgba(255,208,128,.07)' : 'rgba(255,255,255,.02)', border: `1px solid ${payLinkAmountType === 'custom' ? 'rgba(255,208,128,.3)' : 'rgba(255,255,255,.07)'}`, cursor: 'pointer' }}>
                          <input type="checkbox" checked={payLinkAmountType === 'custom'} onChange={e => setPayLinkAmountType(e.target.checked ? 'custom' : 'full')} style={{ accentColor: '#FFD080', width: '14px', height: '14px' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: payLinkAmountType === 'custom' ? '#FFD080' : s.text }}>Custom amount</div>
                            {payLinkAmountType === 'custom' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                <span style={{ fontSize: '12px', color: s.muted }}>€</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={payLinkCustomAmount}
                                  onChange={e => setPayLinkCustomAmount(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  style={{ width: '100px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: s.text, fontSize: '12px', fontFamily: s.font }}
                                />
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                      {/* Amount preview */}
                      {(() => {
                        const paidCents = payments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (p.amount ?? 0), 0)
                        const totalCents = selected?.amount ?? 0
                        const remaining = Math.max(0, totalCents - paidCents)
                        let due: number
                        if (payLinkAmountType === 'deposit') {
                          due = Math.ceil((paidCents === 0 ? totalCents : remaining) / 2)
                        } else if (payLinkAmountType === 'custom') {
                          due = Math.round(parseFloat(payLinkCustomAmount.replace(',', '.') || '0') * 100)
                        } else {
                          due = remaining > 0 ? remaining : totalCents
                        }
                        return <div style={{ fontSize: '11.5px', color: s.muted }}>Amount to request: <strong style={{ color: '#4ade80' }}>€{(due / 100).toFixed(2)}</strong></div>
                      })()}
                      {payLinkMsg && <div style={{ fontSize: '12px', color: payLinkMsg.startsWith('✅') ? '#4ade80' : '#ff6464' }}>{payLinkMsg}</div>}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setPayLinkOpen(false); setPayLinkMsg(null) }}
                          style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer', fontFamily: s.font }}>
                          Cancel
                        </button>
                        <button onClick={sendPaymentLink} disabled={payLinkLoading}
                          style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: '#FFD080', color: '#090909', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: s.font, opacity: payLinkLoading ? .6 : 1 }}>
                          {payLinkLoading ? 'Sending…' : 'Send Request'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Add payment */}
              {payMsg && <div style={{ fontSize: '12px', color: payMsg.startsWith('✅') ? '#4ade80' : '#ff6464', textAlign: 'center' }}>{payMsg}</div>}
              {!payFormOpen ? (
                <button onClick={() => { setPayFormOpen(true); setPayMsg(null) }}
                  style={{ padding: '9px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,.18)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer', fontFamily: s.font, width: '100%' }}>
                  + Add payment
                </button>
              ) : (
                <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,.09)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: s.text }}>New Payment</span>
                  <div style={{ fontSize: '12px', color: s.muted }}>Only for money you have received. A payment the guest still has to make is not entered here.</div>
                  <div>
                    <label style={lbl}>Description <span style={{ color: '#ff6464', fontWeight: 700 }}>*</span></label>
                    <input type="text" placeholder="e.g. 4-Dive Pack, Discover Scuba, remaining balance…" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Amount (€)</label>
                    <input type="text" placeholder="e.g. 230" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Payment method</label>
                    <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} style={inp}>
                      <option value="cash">Cash</option>
                      <option value="card_terminal" disabled>Card Terminal (not available yet)</option>
                      <option value="revolut">Revolut</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { setPayFormOpen(false); setPayMsg(null) }}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer', fontFamily: s.font }}>
                      Cancel
                    </button>
                    <button onClick={addPayment} disabled={payLoading}
                      style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: s.accent, color: '#090909', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: s.font, opacity: payLoading ? .6 : 1 }}>
                      {payLoading ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* Refunds */}
              {/* Review #4: auch cancelled/no_show, solange noch Geld gehalten wird */}
              {(selected.status === 'confirmed' || selected.status === 'pending' || selected.status === 'completed' || (ps !== null && ps.grossPaid - ps.refunded > 0)) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {/* Full refund */}
                  {!fullRefundOpen ? (
                    <button
                      onClick={() => { setFullRefundOpen(true); setFullReleaseIds(new Set(bkSessions.filter(x => x.status === 'booked').map(x => x.id))); setFullRefundMethod(selected.stripe_payment_intent ? 'stripe' : 'cash'); setRefundMsg(null) }}
                      disabled={refundLoading}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,100,100,.35)', background: 'rgba(255,100,100,.08)', color: '#ff6464', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: s.font }}>
                      ↩ Full Refund
                    </button>
                  ) : (
                    <div style={{ background: 'rgba(255,100,100,.04)', border: '1px solid rgba(255,100,100,.25)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#ff6464' }}>Full Refund — {selected.product_name}</span>
                      <div>
                        <label style={lbl}>Payment method</label>
                        <select value={fullRefundMethod} onChange={e => setFullRefundMethod(e.target.value)} style={inp}>
                          {selected.stripe_payment_intent && <option value="stripe">💳 Stripe (executed on authorization)</option>}
                          {!selected.stripe_payment_intent && (<>
                            <option value="cash">💵 Cash</option>
                            <option value="bank">🏦 Bank Transfer</option>
                            <option value="revolut">⚡ Revolut</option>
                            <option value="mb_way">📱 MB WAY</option>
                          </>)}
                        </select>
                        {selected.stripe_payment_intent && <div style={{ fontSize: '11px', color: s.muted, marginTop: '4px' }}>Paid by card — the refund goes back through Stripe. Another payout method can only be set by the person who authorizes in Finances.</div>}
                      </div>
                      <PayoutFields method={fullRefundMethod} value={refundPayout} onChange={setRefundPayout} />
                      <ReasonField kind="refund" choice={fullRefundChoice} detail={fullRefundDesc} onChoice={setFullRefundChoice} onDetail={setFullRefundDesc} placeholder='e.g. "Trip cancelled by guest, flu"' />
                      {bkSessions.some(x => x.status === 'booked') && (
                        <div>
                          <label style={lbl}>Release seats? — booked day(s) this refund cancels</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            {bkSessions.filter(x => x.status === 'booked').map(x => {
                              const on = fullReleaseIds.has(x.id)
                              return (
                                <button key={x.id} type="button" onClick={() => { const n = new Set(fullReleaseIds); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); setFullReleaseIds(n) }}
                                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '7px', border: `1px solid ${on ? 'rgba(255,100,100,.5)' : 'rgba(255,255,255,.1)'}`, background: on ? 'rgba(255,100,100,.1)' : 'transparent', cursor: 'pointer', fontFamily: s.font, fontSize: '12px', color: s.text }}>
                                  <span>{on ? '☑' : '☐'} {fmtDate(x.session_date)} · {(x.session ?? '').toUpperCase()}{x.notes ? ` · ${x.notes}` : ''}</span>
                                  <span style={{ fontSize: '11px', color: s.muted }}>{x.seats ?? 1} seat(s){x.is_boat_day === false ? ' · no boat' : ''}</span>
                                </button>
                              )
                            })}
                          </div>
                          <div style={{ fontSize: '11px', color: s.muted, marginTop: '4px' }}>Days stay booked if you untick them (e.g. refund for a mistaken booking you keep).</div>
                        </div>
                      )}
                      {fullRefundMethod && fullRefundMethod !== 'stripe' && (
                        <div style={{ fontSize: '11px', color: '#ffa030' }}>⚠️ Refund will appear as pending in Finances for manual processing.</div>
                      )}
                      {ps && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,100,100,.12)', border: '1px solid rgba(255,100,100,.35)' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: s.text }}>Total refund amount</span>
                          <span style={{ fontSize: '18px', fontWeight: 800, color: '#ff6464' }}>{fmtAmount(Math.max(0, ps.grossPaid - ps.refunded), ps.currency)}</span>
                        </div>
                      )}
                      {refundMsg && <div style={{ fontSize: '12px', color: refundMsg.startsWith('✅') ? '#4ade80' : '#ff6464' }}>{refundMsg}</div>}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setFullRefundOpen(false); setRefundMsg(null) }}
                          style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '12px', cursor: 'pointer', fontFamily: s.font }}>
                          Cancel
                        </button>
                        <button onClick={() => initiateRefund()} disabled={refundLoading || !fullRefundMethod || !reasonComplete(fullRefundChoice, fullRefundDesc)}
                          style={fullRefundMethod === 'cash'
                            ? { flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '11px', cursor: 'pointer', fontFamily: s.font, opacity: (refundLoading || !reasonComplete(fullRefundChoice, fullRefundDesc)) ? .45 : 1 }
                            : { flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: '#ff6464', color: '#090909', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: s.font, opacity: (refundLoading || !fullRefundMethod || !reasonComplete(fullRefundChoice, fullRefundDesc)) ? .45 : 1 }}>
                          {refundLoading ? 'Processing…' : (fullRefundMethod === 'cash' ? 'Request only (pay later)' : 'Confirm Refund')}
                        </button>
                        {fullRefundMethod === 'cash' && (
                          <button onClick={() => initiateRefund(true)} disabled={refundLoading || !reasonComplete(fullRefundChoice, fullRefundDesc)}
                            style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: '#4ade80', color: '#090909', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: s.font, opacity: (refundLoading || !reasonComplete(fullRefundChoice, fullRefundDesc)) ? .45 : 1 }}>
                            💵 Hand out cash now
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Partial refund */}
                  {!partialRefundOpen ? (
                    <button onClick={() => { setPartialRefundOpen(true); setRefundItemKeys(new Set()); setRefundPaymentIds(new Set()); setPartialRefundAmount(''); setPartialRefundMethod(selected.stripe_payment_intent ? 'stripe' : 'cash'); setPartialRefundMsg(null) }}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid rgba(255,160,0,.3)', background: 'transparent', color: '#ffa030', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', fontFamily: s.font }}>
                      ↩ Partial Refund…
                    </button>
                  ) : (
                    <div style={{ background: 'rgba(255,160,0,.04)', border: '1px solid rgba(255,160,0,.2)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffa030' }}>Partial Refund</span>
                      {ps && (
                        <div style={{ fontSize: '11.5px', color: ps.grossPaid - ps.refunded > 0 ? s.muted : '#ff6464' }}>
                          Available to refund: <strong style={{ color: s.text }}>{fmtAmount(Math.max(0, ps.grossPaid - ps.refunded), ps.currency)}</strong>
                          {' '}(paid {fmtAmount(ps.grossPaid, ps.currency)} − requested/refunded {fmtAmount(ps.refunded, ps.currency)}){ps.grossPaid - ps.refunded <= 0 ? ' — nothing left to refund' : ''}
                        </div>
                      )}

                      {/* Quick-select from existing payment records */}
                      {(() => {
                        const usedRefs = new Set(refundRows.filter(r => r.status === 'requested' || r.status === 'paid').flatMap(r => r.source_refs ?? []))
                        const paidItems = payments.filter(p => p.status === 'paid' && !usedRefs.has(p.id))
                        if (paidItems.length === 0) return null
                        const MLABEL: Record<string, string> = { cash: 'Cash', card_terminal: 'Card Terminal', revolut: 'Revolut', bank_transfer: 'Bank Transfer', stripe: 'Stripe', other: 'Other' }
                        return (
                          <div>
                            <label style={lbl}>From payment record</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                              {paidItems.map(p => {
                                // Auswahl per Zahlungs-ID (nicht per Betrag — sonst leuchten alle gleich hohen Zahlungen zusammen).
                                // Mehrfachauswahl mit Toggle; Summe der Häkchen = Betrag, Methode von der zuletzt angeklickten Zahlung.
                                const isSelected = refundPaymentIds.has(p.id)
                                const m = p.stripe_payment_intent_id ? 'stripe' : (['cash','card_terminal','revolut','bank_transfer'].includes(p.method) ? p.method : 'other')
                                const desc = p.notes?.trim()
                                const methodLabel = MLABEL[m] ?? m
                                const lineLabel = desc ? `${desc} · ${methodLabel}` : methodLabel
                                const togglePayment = () => {
                                  const next = new Set(refundPaymentIds)
                                  if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                                  setRefundPaymentIds(next)
                                  setRefundItemKeys(new Set())
                                  const total = paidItems.filter(x => next.has(x.id)).reduce((a, x) => a + x.amount, 0)
                                  setPartialRefundAmount(total > 0 ? (total / 100).toFixed(2) : '')
                                  setPartialRefundDesc(paidItems.filter(x => next.has(x.id)).map(x => `Payment ${fmtAmount(x.amount, selected.currency ?? 'eur')}${x.notes ? ` (${x.notes})` : ''}`).join(', '))
                                  if (next.has(p.id)) setPartialRefundMethod(m)
                                }
                                return (
                                  <button key={p.id} type="button"
                                    onClick={togglePayment}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: '7px', border: `1px solid ${isSelected ? 'rgba(255,160,0,.6)' : 'rgba(255,255,255,.08)'}`, background: isSelected ? 'rgba(255,160,0,.12)' : 'rgba(255,255,255,.02)', color: isSelected ? '#ffa030' : s.text, fontSize: '12px', fontWeight: isSelected ? 700 : 400, cursor: 'pointer', fontFamily: s.font, textAlign: 'left', gap: '10px' }}>
                                    <span style={{ color: isSelected ? '#ffa030' : s.text, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lineLabel}</span>
                                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtAmount(p.amount, selected.currency ?? 'eur')}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Positionen der Buchung als Mehrfachauswahl: Hauptprodukt (pro Gast), Versicherung, Equipment,
                          Add-ons, Custom — Summe der Häkchen landet im Betragsfeld, Custom-Eingabe bleibt daneben möglich. */}
                      {(() => {
                        type ExtrasInsurance = { name: string; total_cents: number; guests: number; per_diver_cents: number }
                        type ExtrasLineItem = { name: string; quantity: number; unit_price_cents: number; total_cents: number }
                        type ExtrasCustom = { label: string; amount_cents: number }
                        const ex = (selected.booking_extras ?? null) as {
                          insurance?: ExtrasInsurance
                          equipment?: ExtrasLineItem[]
                          addons?: ExtrasLineItem[]
                          custom?: ExtrasCustom[]
                        } | null
                        const items: { key: string; label: string; amountCents: number }[] = []
                        const extrasTotal = (ex?.insurance?.total_cents ?? 0)
                          + (ex?.equipment ?? []).reduce((a, i) => a + i.total_cents, 0)
                          + (ex?.addons ?? []).reduce((a, i) => a + i.total_cents, 0)
                          + (ex?.custom ?? []).reduce((a, i) => a + i.amount_cents, 0)
                        const productTotal = Math.max(0, (selected.amount ?? 0) - extrasTotal)
                        const guests = Math.max(1, selected.group_size ?? 1)
                        if (productTotal > 0) {
                          if (guests > 1 && productTotal % guests === 0) {
                            for (let g = 0; g < guests; g++)
                              items.push({ key: `product-${g}`, label: `${selected.product_name ?? 'Product'} · diver ${g + 1}`, amountCents: productTotal / guests })
                          } else {
                            items.push({ key: 'product', label: `${selected.product_name ?? 'Product'}${guests > 1 ? ` × ${guests}` : ''}`, amountCents: productTotal })
                          }
                        }
                        if (ex?.insurance && ex.insurance.total_cents > 0)
                          items.push({ key: 'insurance', label: `${ex.insurance.name} × ${ex.insurance.guests}`, amountCents: ex.insurance.total_cents })
                        ;(ex?.equipment ?? []).forEach((item, i) => items.push({ key: `eq-${i}`, label: `${item.name} ×${item.quantity}`, amountCents: item.total_cents }))
                        ;(ex?.addons ?? []).forEach((item, i) => items.push({ key: `ad-${i}`, label: `${item.name} ×${item.quantity}`, amountCents: item.total_cents }))
                        ;(ex?.custom ?? []).forEach((item, i) => { if (item.amount_cents > 0) items.push({ key: `cu-${i}`, label: item.label, amountCents: item.amount_cents }) })
                        const usedItemRefs = new Set(refundRows.filter(r => r.status === 'requested' || r.status === 'paid').flatMap(r => r.source_refs ?? []))
                        const openItems = items.filter(i => !usedItemRefs.has(i.key))
                        items.length = 0; items.push(...openItems)
                        if (items.length === 0) return null
                        const defaultMethod = selected.stripe_payment_intent ? 'stripe' : 'cash'
                        const sum = items.filter(i => refundItemKeys.has(i.key)).reduce((a, i) => a + i.amountCents, 0)
                        const toggle = (key: string) => {
                          const next = new Set(refundItemKeys)
                          if (next.has(key)) next.delete(key); else next.add(key)
                          setRefundItemKeys(next)
                          setRefundPaymentIds(new Set())
                          const total = items.filter(i => next.has(i.key)).reduce((a, i) => a + i.amountCents, 0)
                          setPartialRefundAmount(total > 0 ? (total / 100).toFixed(2) : '')
                          setPartialRefundDesc(items.filter(i => next.has(i.key)).map(i => i.label).join(', '))
                          if (total > 0) setPartialRefundMethod(defaultMethod)
                        }
                        return (
                          <div>
                            <label style={lbl}>Booking items — tick what to refund</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                              {items.map(item => {
                                const on = refundItemKeys.has(item.key)
                                return (
                                  <button key={item.key} type="button" onClick={() => toggle(item.key)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '7px', border: `1px solid ${on ? 'rgba(255,160,0,.5)' : 'rgba(255,255,255,.1)'}`, background: on ? 'rgba(255,160,0,.12)' : 'transparent', cursor: 'pointer', fontFamily: s.font, fontSize: '12px', textAlign: 'left' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      <span style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${on ? '#ffa030' : 'rgba(255,255,255,.3)'}`, background: on ? '#ffa030' : 'transparent', color: '#1a0f00', fontSize: '10px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on ? '✓' : ''}</span>
                                      <span style={{ color: on ? '#ffa030' : s.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                                    </span>
                                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0, color: on ? '#ffa030' : s.text }}>{fmtAmount(item.amountCents, selected.currency ?? 'eur')}</span>
                                  </button>
                                )
                              })}
                            </div>
                            {sum > 0 && (
                              <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#ffa030', textAlign: 'right', fontWeight: 700 }}>
                                Selected: {fmtAmount(sum, selected.currency ?? 'eur')}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Audit O-8: Teilrefund für einen abgesagten Tag → Session gleich freigeben, sonst bleibt der Platz belegt */}
                      {bkSessions.filter(x => x.status === 'booked').length > 0 && (
                        <div>
                          <label style={lbl}>Release seats? — tick the day(s) this refund cancels (optional)</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            {bkSessions.filter(x => x.status === 'booked').map(x => {
                              const on = refundReleaseSessionIds.has(x.id)
                              return (
                                <button key={x.id} type="button" onClick={() => { const n = new Set(refundReleaseSessionIds); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); setRefundReleaseSessionIds(n); suggestDayRefund(n) }}
                                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '7px', border: `1px solid ${on ? 'rgba(255,100,100,.5)' : 'rgba(255,255,255,.1)'}`, background: on ? 'rgba(255,100,100,.1)' : 'transparent', cursor: 'pointer', fontFamily: s.font, fontSize: '12px', textAlign: 'left', color: on ? '#ff8b70' : s.text }}>
                                  <span>{on ? '☑' : '☐'} {fmtDate(x.session_date)} · {(x.session ?? '').toUpperCase()}{x.notes ? ` · ${x.notes}` : ''}</span>
                                  <span style={{ fontSize: '11px', color: s.muted }}>{x.seats ?? 1} seat(s){x.is_boat_day === false ? ' · no boat' : ''}</span>
                                </button>
                              )
                            })}
                          </div>
                          <div style={{ fontSize: '11px', color: s.muted, marginTop: '4px' }}>Enter the amount below yourself (packs are not priced linearly). Ticked days are set to cancelled when the request is created — the guest stops receiving reminders for them and the seats are free again. Leave empty for refunds that don't cancel a day (gear, upgrade, goodwill).</div>
                        </div>
                      )}
                      <div>
                        <label style={lbl}>Custom amount (€)</label>
                        <input type="text" placeholder="e.g. 50.00" value={partialRefundAmount} onChange={e => { setPartialRefundAmount(e.target.value); setRefundItemKeys(new Set()); setRefundPaymentIds(new Set()) }} style={inp} />
                      </div>
                      <ReasonField kind="refund" choice={partialRefundChoice} detail={partialRefundDesc} onChoice={setPartialRefundChoice} onDetail={setPartialRefundDesc} placeholder='e.g. "Gloves not used", "Day 2 cancelled — weather"' />
                      <div>
                        <label style={lbl}>Refund method</label>
                        <select value={partialRefundMethod} onChange={e => setPartialRefundMethod(e.target.value)} style={inp}>
                          {selected.stripe_payment_intent && <option value="stripe">💳 Stripe (executed on authorization)</option>}
                          {!selected.stripe_payment_intent && (<>
                            <option value="cash">💵 Cash</option>
                            <option value="bank">🏦 Bank Transfer</option>
                            <option value="revolut">⚡ Revolut</option>
                            <option value="mb_way">📱 MB WAY</option>
                          </>)}
                        </select>
                        {selected.stripe_payment_intent && <div style={{ fontSize: '11px', color: s.muted, marginTop: '4px' }}>Paid by card — the refund goes back through Stripe. Another payout method can only be set by the person who authorizes in Finances.</div>}
                      </div>
                      <PayoutFields method={partialRefundMethod} value={refundPayout} onChange={setRefundPayout} />
                      <div style={{ fontSize: '11px', color: '#ffa030' }}>↩️ This creates a refund request. Nothing is paid out and the guest is not emailed until Finances → Refunds authorizes it.</div>
                      {(() => {
                        const c = Math.round(parseFloat(partialRefundAmount.replace(',', '.')) * 100)
                        return (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,160,0,.12)', border: '1px solid rgba(255,160,0,.35)' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: s.text }}>Total refund amount</span>
                            <span style={{ fontSize: '18px', fontWeight: 800, color: '#ffa030' }}>{!isNaN(c) && c > 0 ? fmtAmount(c, ps?.currency ?? 'EUR') : '—'}</span>
                          </div>
                        )
                      })()}
                      {partialRefundMsg && <div style={{ fontSize: '12px', color: partialRefundMsg.startsWith('✅') ? '#4ade80' : '#ff6464' }}>{partialRefundMsg}</div>}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setPartialRefundOpen(false); setPartialRefundAmount(''); setPartialRefundMsg(null); setPartialRefundMethod('') }}
                          style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '12px', cursor: 'pointer', fontFamily: s.font }}>
                          Cancel
                        </button>
                        <button onClick={() => doPartialRefund()} disabled={refundLoading || !reasonComplete(partialRefundChoice, partialRefundDesc)}
                          style={partialRefundMethod === 'cash'
                            ? { flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '11px', cursor: 'pointer', fontFamily: s.font, opacity: (refundLoading || !reasonComplete(partialRefundChoice, partialRefundDesc)) ? .45 : 1 }
                            : { flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: '#ffa030', color: '#090909', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: s.font, opacity: (refundLoading || !reasonComplete(partialRefundChoice, partialRefundDesc)) ? .45 : 1 }}>
                          {refundLoading ? 'Processing…' : (partialRefundMethod === 'cash' ? 'Request only (pay later)' : 'Refund')}
                        </button>
                        {partialRefundMethod === 'cash' && (
                          <button onClick={() => doPartialRefund(true)} disabled={refundLoading || !reasonComplete(partialRefundChoice, partialRefundDesc)}
                            style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: '#4ade80', color: '#090909', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: s.font, opacity: (refundLoading || !reasonComplete(partialRefundChoice, partialRefundDesc)) ? .45 : 1 }}>
                            💵 Hand out cash now
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {refundMsg && !fullRefundOpen && !partialRefundOpen && <div style={{ fontSize: '12px', color: refundMsg.startsWith('✅') ? '#4ade80' : '#ff6464' }}>{refundMsg}</div>}
                </div>
              )}
              <span style={lbl}>Payment history</span>
              {/* Online-Stripe-Zahlung (nur bei Checkout-Buchungen — Walk-ins haben nur booking_payments) */}
              {ps?.isOnlineStripe ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: s.muted }}>{pmLabel(selected)}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: ps.grossPaid > 0 && ps.refunded >= ps.grossPaid ? '#a78bfa' : ps.dueBalance === 0 && ps.total > 0 ? '#4ade80' : ps.total > 0 ? '#fbbf24' : s.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtAmount(ps.grossPaid, selected.currency)} / {fmtAmount(selected.amount, selected.currency)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: s.muted, marginTop: '5px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{ps.grossPaid <= 0 ? 'Not yet paid' : ps.refunded >= ps.grossPaid ? '↩ Paid, then fully refunded' : ps.dueBalance > 0 ? `⏳ Deposit paid — ${fmtAmount(ps.dueBalance, selected.currency)} due on arrival` : `✅ Paid in full${selected.paid_at ? ` ${fmtDate(selected.paid_at)}` : ''}`}</span>
                    {selected.stripe_payment_intent && (
                      <a href={`https://dashboard.stripe.com/payments/${selected.stripe_payment_intent}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: s.muted, textDecoration: 'none' }}>Stripe ↗</a>
                    )}
                  </div>
                </div>
              </div>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: s.muted }}>Payments are recorded below</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: s.text, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(selected.amount, selected.currency)}</span>
                </div>
              </div>
              )}

              {/* Alle Bewegungen in einer Liste: Zahlungen + Refunds, neueste oben (Lucas 30.10.) */}
              {paymentsLoading ? (
                <div style={{ color: s.muted, fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>Loading…</div>
              ) : (payments.length > 0 || refundRows.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {([
                    ...payments.map(pmt => ({ ts: pmt.paid_at ?? pmt.created_at, kind: 'p' as const, pmt })),
                    ...refundRows.map(r => ({ ts: r.paid_at ?? r.requested_at, kind: 'r' as const, r })),
                  ] as Array<{ ts: string; kind: 'p'; pmt: BookingPayment } | { ts: string; kind: 'r'; r: RefundRow }>)
                    .sort((x, y) => (y.ts ?? '').localeCompare(x.ts ?? ''))  // neueste oben, älteste unten
                    .map(item => {
                      if (item.kind === 'p') {
                        const pmt = item.pmt
                        if (pmt.method === 'transfer') {
                          // Umbuchung zwischen verlinkten Buchungen (Paketwechsel pro Person): Geld bleibt im Haus, nur die Buchung wechselt
                          const out = pmt.amount < 0
                          const ref = (pmt.notes ?? '').match(/booking ([0-9a-f]{8})/i)?.[1] ?? null
                          const note = (pmt.notes ?? '').replace(/^(Moved (to|from) (linked )?booking [0-9a-f]{8})\s*/i, '').replace(/^\(|\)$/g, '')
                          return (
                            <div key={pmt.id} style={{ background: 'rgba(255,255,255,.02)', borderRadius: '10px', padding: '12px 14px', border: '1px dashed rgba(255,255,255,.14)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '12px', color: s.text, fontWeight: 600 }}>↔ {out ? 'Moved to linked booking' : 'Moved from linked booking'}{ref && (<> {' '}
                                  <button type="button" onClick={() => openBookingByPrefix(ref)} title="Open that booking"
                                    style={{ background: 'transparent', border: 'none', padding: 0, color: s.accent, fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>{ref}</button></>)}</span>
                                <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
                                  <span style={{ padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,.08)', color: s.muted }}>moved</span>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: s.muted, fontVariantNumeric: 'tabular-nums' }}>{out ? '−' : '+'}{fmtAmount(Math.abs(pmt.amount), pmt.currency)}</span>
                                </div>
                              </div>
                              <div style={{ fontSize: '11px', color: s.muted, marginTop: '4px', lineHeight: 1.5 }}>
                                🕐 {fmtDateTime(pmt.paid_at ?? pmt.created_at)}{note ? ` · ${note}` : ''} · {(() => { const nm = pmt.recorded_by ? who.id(pmt.recorded_by) : null; return nm ? `👤 ${nm}` : '⚙️ by system (automatic)' })()}<br />
                                {out ? 'Money already paid for these guests was booked over to the other booking (package change). It stays in the business — nothing was paid back to the guest.'
                                     : 'Money already paid on the original booking was booked over to this one (package change). It counts as paid here.'}
                              </div>
                            </div>
                          )
                        }
                        return (
                    <div key={pmt.id} style={{ background: 'rgba(255,255,255,.03)', borderRadius: '10px', padding: '12px 14px', border: `1px solid ${pmt.status === 'pending' ? 'rgba(255,160,0,.2)' : 'rgba(255,255,255,.07)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: s.muted }}>{PM_LABELS[pmt.method] ?? pmt.method}</span>
                        <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
                          <span style={{ padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: pmt.status === 'paid' ? 'rgba(74,222,128,.14)' : pmt.status === 'pending' ? 'rgba(255,160,0,.14)' : 'rgba(255,100,100,.14)', color: pmt.status === 'paid' ? '#4ade80' : pmt.status === 'pending' ? '#ffa030' : '#ff6464' }}>{pmt.status === 'pending' ? 'expected' : pmt.status}</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: s.text, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(pmt.amount, pmt.currency)}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: s.muted, marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {pmt.paid_at ? <span>✅ {fmtDateTime(pmt.paid_at)}</span> : <span>🕐 recorded {fmtDateTime(pmt.created_at)}</span>}
                        {(() => { const rb = pmt.recorded_by; const nm = rb ? (who.id(rb) ?? (rb.includes('@') ? who(rb) : null)) : null; return nm ? <span>👤 {nm}</span> : <span>⚙️ by system (automatic)</span> })()}
                        {pmt.due_at && pmt.status === 'pending' && <span>⏰ Due: {fmtDate(pmt.due_at)}</span>}
                        {pmt.notes && <span>📝 {pmt.notes}</span>}
                      </div>
                      {pmt.status === 'pending' && (
                        <button onClick={() => markPaid(pmt)}
                          style={{ marginTop: '8px', padding: '5px 12px', borderRadius: '7px', border: '1px solid rgba(74,222,128,.3)', background: 'rgba(74,222,128,.08)', color: '#4ade80', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                          ✓ Mark as received
                        </button>
                      )}
                    </div>
                        )
                      }
                      const r = item.r
                    const paid = r.status === 'paid'
                    const RM: Record<string, string> = { stripe: 'Stripe', cash: 'Cash', bank: 'Bank Transfer', revolut: 'Revolut', mb_way: 'MB WAY', other: 'Other' }
                    return (
                      <div key={r.id} style={{ background: 'rgba(255,160,0,.04)', border: `1px solid ${paid ? 'rgba(255,160,48,.2)' : 'rgba(255,160,0,.45)'}`, borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: s.text, fontWeight: 600 }}>{r.description}</div>
                          <div style={{ fontSize: '11px', color: s.muted, marginTop: '3px' }}>
                            {RM[r.method] ?? r.method} · requested {fmtDateTime(r.requested_at)}{` by ${r.requested_by_email ? who(r.requested_by_email) : '⚙️ system (automatic)'}`}
                            {paid ? ` · ✅ authorized ${r.paid_at ? fmtDateTime(r.paid_at) : ''}${` by ${r.authorized_by_email ? who(r.authorized_by_email) : '⚙️ system (automatic)'}`}${r.stripe_refund_id ? ` · ${r.stripe_refund_id}` : ''}` : (r.method === 'cash' ? ' · ⏳ waiting in Cash refunds' : ' · ⏳ awaiting authorization in Finances')}
                          </div>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffa030', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>−{fmtAmount(r.amount, selected.currency ?? 'eur')}</span>
                      </div>
                    )
                    })}
                </div>
              )}

              {/* Payment summary */}
              {ps && (ps.extraPaid > 0 || ps.pending > 0 || ps.dueBalance > 0) && (
                <div style={{ background: 'rgba(243,239,230,.04)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(243,239,230,.1)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {[
                    ['Total paid', fmtAmount(ps.total, ps.currency), '#4ade80'],
                    ...(ps.dueBalance > 0 ? [['Open', fmtAmount(ps.dueBalance, ps.currency), '#ff4444']] : []),
                    ...(ps.pending > 0 ? [['of which expected (see above)', fmtAmount(Math.min(ps.pending, Math.max(ps.dueBalance, 0)), ps.currency), '#ffa030']] : []),
                  ].map(([label, val, clr]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: s.muted }}>{label}</span>
                      <span style={{ color: clr as string, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

            </>)}

            {/* ══ SESSIONS TAB ══ */}
            {detailTab === 'sessions' && (<>
              {/* Count header */}
              <div style={{ marginBottom: '4px' }}>
                <span style={lbl}>
                  {selected?.sessions_expected
                    ? `Sessions — ${bkSessions.length} of ${selected.sessions_expected} assigned${bkSessions.some(x => x.session === 'tbd' && x.status === 'booked') ? ` · ${bkSessions.filter(x => x.session === 'tbd' && x.status === 'booked').length} without time slot` : ''}`
                    : 'Booked Sessions'}
                </span>
              </div>

              {/* Offene Tage (⏱ Time to be set): gleiche Planung wie im Instructor-Ticket — Speichern mailt den Gast und erledigt das Ticket */}
              {selected && selected.status !== 'cancelled' && bkSessions.some(x => x.session === 'tbd' && x.status === 'booked') && (
                <SlotAssigner key={`${selected.id}-${bkSessions.map(x => `${x.id}${x.session}`).join('')}`} bookingId={selected.id}
                  onChanged={(m) => { if (m) setSlotToast(m); void loadSessions(selected.id); void loadChangelog(selected.id); void fetchBookings() }} />
              )}

              {sessLoading ? (
                <div style={{ color: s.muted, fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>Loading…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {bkSessions.map(sess => (
                    <div key={sess.id}>
                      {editingSessionId === sess.id ? (
                        /* ── Inline edit ── */
                        <div style={{ background: 'rgba(243,239,230,.04)', border: '1px solid rgba(243,239,230,.2)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, color: s.accent }}>Edit session</span>
                          <div>
                            <label style={lbl}>Date</label>
                            <input type="date" value={editSessForm.date} onChange={e => setEditSessForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                          </div>
                          <div>
                            <label style={lbl}>Time of day</label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {((selected.product_name ?? '').trim().toLowerCase() === 'night dive' ? ['night'] as const : ['am', 'pm'] as const).map(t => (
                                <button key={t} type="button" onClick={() => setEditSessForm(f => ({ ...f, time: t }))}
                                  style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1px solid ${editSessForm.time === t ? 'rgba(243,239,230,.4)' : 'rgba(255,255,255,.1)'}`, background: editSessForm.time === t ? 'rgba(243,239,230,.1)' : 'transparent', color: editSessForm.time === t ? s.accent : s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                                  {t.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={lbl}>Location</label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {([true, false] as const).map(isBoat => (
                                <button key={String(isBoat)} type="button" onClick={() => setEditSessForm(f => ({ ...f, isBoatDay: isBoat }))}
                                  style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1px solid ${editSessForm.isBoatDay === isBoat ? (isBoat ? 'rgba(243,239,230,.4)' : 'rgba(255,160,0,.4)') : 'rgba(255,255,255,.1)'}`, background: editSessForm.isBoatDay === isBoat ? (isBoat ? 'rgba(243,239,230,.1)' : 'rgba(255,160,0,.08)') : 'transparent', color: editSessForm.isBoatDay === isBoat ? (isBoat ? s.accent : '#ffa030') : s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                                  {isBoat ? '🚤 Boat' : '🏊 Pool'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={lbl}>Activity / notes</label>
                            <textarea value={editSessForm.notes} onChange={e => setEditSessForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Fun dive, Open Water Day 1…" rows={2} style={{ ...inp, resize: 'vertical', minHeight: '46px' }} />
                          </div>
                          {sessMsg && <div style={{ fontSize: '12px', color: sessMsg.startsWith('✅') ? '#4ade80' : '#ff6464' }}>{sessMsg}</div>}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => { setEditingSessionId(null); setSessMsg(null) }}
                              style={{ flex: 1, padding: '7px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '12px', cursor: 'pointer', fontFamily: s.font }}>
                              Cancel
                            </button>
                            <button onClick={() => updateSession(sess.id)} disabled={sessEditLoading || editSessForm.isBoatDay === null}
                              style={{ flex: 2, padding: '7px', borderRadius: '8px', border: 'none', background: editSessForm.isBoatDay !== null ? s.accent : 'rgba(255,255,255,.1)', color: editSessForm.isBoatDay !== null ? '#090909' : s.muted, fontWeight: 700, fontSize: '12px', cursor: editSessForm.isBoatDay !== null ? 'pointer' : 'not-allowed', fontFamily: s.font }}>
                              {sessEditLoading ? 'Saving…' : 'Update'}
                            </button>
                          </div>
                        </div>
                      ) : sessDeleteConfirm === sess.id ? (
                        /* ── Delete confirm ── */
                        <div style={{ background: 'rgba(255,100,100,.06)', border: '1px solid rgba(255,100,100,.25)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ff6464' }}>Remove session?</span>
                          <span style={{ fontSize: '11.5px', color: s.muted }}>{fmtDate(sess.session_date)} · {sess.session === 'tbd' ? '⏱ time to be set' : sess.session === 'night' ? '🌙 NIGHT' : sess.session.toUpperCase()} · {sess.is_boat_day ? '🚤 Boat' : '🏊 Pool'}</span>
                          {sessMsg && <div style={{ fontSize: '12px', color: sessMsg.startsWith('✅') ? '#4ade80' : '#ff6464' }}>{sessMsg}</div>}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => { setSessDeleteConfirm(null); setSessMsg(null) }}
                              style={{ flex: 1, padding: '7px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '12px', cursor: 'pointer', fontFamily: s.font }}>
                              Keep
                            </button>
                            <button onClick={() => deleteSession(sess.id)} disabled={sessEditLoading}
                              style={{ flex: 2, padding: '7px', borderRadius: '8px', border: 'none', background: '#ff6464', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: s.font, opacity: sessEditLoading ? .6 : 1 }}>
                              {sessEditLoading ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── View mode ── */
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,.07)', fontSize: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ color: s.text }}>
                              {fmtDate(sess.session_date)} · {sess.session === 'tbd'
                                ? <span style={{ fontWeight: 700, color: '#ffd080' }}>⏱ Time to be set</span>
                                : sess.session === 'night'
                                  ? <span style={{ fontWeight: 700, color: '#c9b8ff' }}>🌙 NIGHT · evening, no boat slot</span>
                                  : <span style={{ fontWeight: 700, color: s.accent }}>{sess.session.toUpperCase()}</span>}
                            </span>
                            {sess.notes && <span style={{ fontSize: '11px', color: s.muted }}>{sess.notes}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: s.muted }}>{sess.is_boat_day ? '🚤' : '🏊'}</span>
                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '12px', background: sess.status === 'confirmed' ? 'rgba(74,222,128,.12)' : 'rgba(255,160,0,.12)', color: sess.status === 'confirmed' ? '#4ade80' : '#ffa030', fontWeight: 700 }}>
                              {sess.status}
                            </span>
                            <span style={{ color: s.muted }}>×{sess.seats}</span>
                            <button onClick={() => {
                              setEditingSessionId(sess.id)
                              setEditSessForm({ date: sess.session_date, time: sess.session as 'am' | 'pm' | 'night' | 'tbd', isBoatDay: sess.is_boat_day, notes: sess.notes ?? '' })
                              setSessMsg(null)
                              setSessFormOpen(false)
                              setSessDeleteConfirm(null)
                            }}
                              style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '11px', cursor: 'pointer', fontFamily: s.font }}>
                              Edit
                            </button>
                            <button onClick={() => { setSessDeleteConfirm(sess.id); setEditingSessionId(null); setSessMsg(null) }}
                              style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,100,100,.2)', background: 'transparent', color: '#ff8888', fontSize: '11px', cursor: 'pointer', fontFamily: s.font }}>
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Unscheduled placeholder slots */}
                  {(() => {
                    const expected = selected?.sessions_expected ?? 0
                    const unscheduled = Math.max(0, expected - bkSessions.length)
                    if (unscheduled === 0) return null
                    return Array.from({ length: unscheduled }, (_, i) => (
                      <div key={`unscheduled-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,.01)', borderRadius: '10px', border: '1px dashed rgba(255,255,255,.12)', fontSize: '12px', opacity: 0.6 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: s.muted }}>📅 Not yet scheduled</span>
                          <span style={{ fontSize: '11px', color: s.muted, opacity: 0.7 }}>Dive #{bkSessions.length + i + 1}</span>
                        </div>
                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '12px', background: 'rgba(255,255,255,.06)', color: s.muted, fontWeight: 700 }}>unscheduled</span>
                      </div>
                    ))
                  })()}
                  {/* Pre-booked sessions from booking wizard (sessions string, not yet in booking_sessions table) */}
                  {bkSessions.length === 0 && (() => {
                    const rawSessions = (selected?.sessions ?? '').split(',').filter(Boolean)
                    if (rawSessions.length === 0) return (
                      <div style={{ color: s.muted, fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>No sessions recorded</div>
                    )
                    return rawSessions.map((entry, i) => {
                      const [date, time] = entry.split(':')
                      return (
                        <div key={`pre-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(243,239,230,.03)', borderRadius: '10px', border: '1px solid rgba(243,239,230,.12)', fontSize: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ color: s.text, fontWeight: 600 }}>📅 {fmtDate(date)}</span>
                            <span style={{ fontSize: '11px', color: s.muted }}>Dive #{i + 1} · {(time ?? 'am').toUpperCase()}</span>
                          </div>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '12px', background: 'rgba(243,239,230,.1)', color: s.accent, fontWeight: 700 }}>pre-booked</span>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}

              {sessMsg && !editingSessionId && !sessDeleteConfirm && (
                <div style={{ fontSize: '12px', color: sessMsg.startsWith('✅') ? '#4ade80' : '#ff6464', textAlign: 'center' }}>{sessMsg}</div>
              )}

              {!sessFormOpen ? (
                <button onClick={() => { setSessFormOpen(true); setSessMsg(null); setEditingSessionId(null); setSessDeleteConfirm(null) }}
                  style={{ padding: '9px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,.18)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer', fontFamily: s.font, width: '100%' }}>
                  + Add session
                </button>
              ) : (
                <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,.09)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: s.text }}>Add session</span>
                  <div>
                    <label style={lbl}>Date</label>
                    <input type="date" value={sessForm.date} onChange={e => setSessForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Time of day</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {((selected.product_name ?? '').trim().toLowerCase() === 'night dive' ? ['night'] as const : ['am', 'pm'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setSessForm(f => ({ ...f, time: t }))}
                          style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1px solid ${sessForm.time === t ? 'rgba(243,239,230,.4)' : 'rgba(255,255,255,.1)'}`, background: sessForm.time === t ? 'rgba(243,239,230,.1)' : 'transparent', color: sessForm.time === t ? s.accent : s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                          {t.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Location — required</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {([true, false] as const).map(isBoat => (
                        <button key={String(isBoat)} type="button" onClick={() => setSessForm(f => ({ ...f, isBoatDay: isBoat }))}
                          style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1px solid ${sessForm.isBoatDay === isBoat ? (isBoat ? 'rgba(243,239,230,.4)' : 'rgba(255,160,0,.4)') : 'rgba(255,255,255,.1)'}`, background: sessForm.isBoatDay === isBoat ? (isBoat ? 'rgba(243,239,230,.1)' : 'rgba(255,160,0,.08)') : 'transparent', color: sessForm.isBoatDay === isBoat ? (isBoat ? s.accent : '#ffa030') : s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                          {isBoat ? '🚤 Boat' : '🏊 Pool'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Activity / notes</label>
                    <textarea value={sessForm.notes} onChange={e => setSessForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Fun dive, Open Water Day 1, night dive…" rows={2} style={{ ...inp, resize: 'vertical', minHeight: '52px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { setSessFormOpen(false); setSessMsg(null) }}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer', fontFamily: s.font }}>
                      Cancel
                    </button>
                    <button onClick={addSession} disabled={sessAddLoading || sessForm.isBoatDay === null}
                      style={{ flex: 2, padding: '8px', borderRadius: '8px', border: 'none', background: sessForm.isBoatDay !== null ? s.accent : 'rgba(255,255,255,.15)', color: sessForm.isBoatDay !== null ? '#090909' : s.muted, fontWeight: 700, fontSize: '13px', cursor: sessForm.isBoatDay !== null ? 'pointer' : 'not-allowed', fontFamily: s.font, opacity: sessAddLoading ? .6 : 1 }}>
                      {sessAddLoading ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </>)}

            {/* ══ ADD TAB ══ */}
            {detailTab === 'add' && (<>
              {/* Existing child bookings */}
              {childBookings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: s.muted }}>Linked Add-ons</div>
                  {childBookings.map(cb => (
                    <div key={cb.id} onClick={() => openBooking(cb)}
                      style={{ padding: '8px 12px', background: 'rgba(255,255,255,.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,.06)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: s.text, fontWeight: 600 }}>{cb.product_name}</div>
                        <div style={{ fontSize: '10.5px', color: s.muted, fontFamily: 'monospace' }}>{cb.id.slice(0, 8)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, background: STATUS_BG[cb.status] ?? 'rgba(200,200,200,.12)', color: STATUS_CLR[cb.status] ?? '#aaa' }}>{cb.status}</span>
                        <span style={{ fontSize: '12px', color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(cb.amount, cb.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new items */}
              <div style={{ padding: '14px', background: 'rgba(255,255,255,.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: s.text }}>New Add-on</div>

                {/* Product selector */}
                {(() => {
                  const addNeedsDate = !!addProducts.find(p => p.id === addSelectedId && ADD_DATE_REQUIRED.includes(p.category))
                  const canAdd = !!addSelectedId && !(addNeedsDate && !addItemDate)
                  return (
                    <div>
                      <label style={lbl}>Product</label>
                      {addProducts.length === 0 ? (
                        <div style={{ fontSize: '12px', color: s.muted }}>Loading products…</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <select value={addSelectedId} onChange={e => { setAddSelectedId(e.target.value); setAddItemDate('') }}
                              style={{ ...inp, flex: 1 }}>
                              <option value=''>— Select product —</option>
                              {['addon','dives','entry','specialty','ecology','pro','equipment','excursion','insurance'].map(cat => {
                                const items = addProducts.filter(p => p.category === cat)
                                if (items.length === 0) return null
                                const catLabel: Record<string,string> = { addon:'Add-ons', dives:'Dives', entry:'Entry Courses', specialty:'Specialty Courses', ecology:'Ecology Courses', pro:'Pro Courses', equipment:'Equipment Rental', excursion:'Excursions', insurance:'Insurance' }
                                return (
                                  <optgroup key={cat} label={catLabel[cat] ?? cat}>
                                    {items.map(p => (
                                      <option key={p.id} value={p.id}>{p.name} — €{(p.price_cents / 100).toFixed(2)}</option>
                                    ))}
                                  </optgroup>
                                )
                              })}
                            </select>
                            <button
                              disabled={!canAdd}
                              onClick={() => {
                                const p = addProducts.find(x => x.id === addSelectedId)
                                if (!p) return
                                setAddCart(c => [...c, { ...p, booking_date: addNeedsDate ? addItemDate : undefined }])
                                setAddSelectedId('')
                                setAddItemDate('')
                              }}
                              style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: canAdd ? s.accent : 'rgba(255,255,255,.1)', color: canAdd ? '#090909' : s.muted, fontWeight: 700, fontSize: '13px', cursor: canAdd ? 'pointer' : 'not-allowed', fontFamily: s.font, whiteSpace: 'nowrap' }}>
                              + Add
                            </button>
                          </div>
                          {addNeedsDate && (
                            <div>
                              <label style={{ ...lbl, color: !addItemDate ? '#ffd080' : s.muted }}>📅 Booking Date {!addItemDate && <span style={{ fontSize: '10px', fontWeight: 400 }}>— required for this product</span>}</label>
                              <input
                                type='date'
                                value={addItemDate}
                                onChange={e => setAddItemDate(e.target.value)}
                                style={{ ...inp, borderColor: !addItemDate ? 'rgba(255,208,128,.5)' : undefined }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Cart */}
                {addCart.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={lbl}>Cart</label>
                    {addCart.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: 'rgba(255,255,255,.04)', borderRadius: '6px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <span style={{ color: s.text }}>{item.name}</span>
                          {item.booking_date && <span style={{ fontSize: '10px', color: s.muted }}>📅 {item.booking_date}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>€{(item.price_cents / 100).toFixed(2)}</span>
                          <button onClick={() => setAddCart(c => c.filter((_, j) => j !== i))}
                            style={{ background: 'transparent', border: 'none', color: '#ff6464', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}>×</button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '12px', fontWeight: 700, color: s.text, padding: '4px 10px 0' }}>
                      Per person: <span style={{ color: '#4ade80', marginLeft: '6px' }}>€{(addCart.reduce((s, i) => s + i.price_cents, 0) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Betroffene Personen: alle oder einzelne */}
                {selected.group_size > 1 && selectedDivers.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={lbl}>Who is it for?</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['all', 'some'] as const).map(m => (
                        <button key={m} type="button" onClick={() => setAddPersonMode(m)}
                          style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1px solid ${addPersonMode === m ? s.accent : 'rgba(255,255,255,.1)'}`, background: addPersonMode === m ? 'rgba(243,239,230,.1)' : 'transparent', color: addPersonMode === m ? s.accent : s.muted, fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: s.font }}>
                          {m === 'all' ? `Everyone (${selected.group_size})` : 'Only some people'}
                        </button>
                      ))}
                    </div>
                    {addPersonMode === 'some' && selectedDivers.map((d, i) => {
                      const name = d.guest_name ?? d.customer?.name ?? d.customer?.email ?? d.invite_email ?? `Diver ${i + 1}`
                      return (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: s.text, cursor: 'pointer' }}>
                          <input type="checkbox" checked={addPersonIds.has(d.id)} onChange={() => { const n = new Set(addPersonIds); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); setAddPersonIds(n) }} style={{ accentColor: s.accent }} />
                          {name}
                        </label>
                      )
                    })}
                    {addCart.length > 0 && (() => {
                      const cnt = addPersonMode === 'some' ? addPersonIds.size : selected.group_size
                      const unit = addCart.reduce((a, i) => a + i.price_cents, 0)
                      return <div style={{ fontSize: '11.5px', color: cnt === 0 ? '#ffa040' : s.muted }}>{cnt === 0 ? '⚠ Tick at least one person.' : `${cnt} guest(s) × €${(unit / 100).toFixed(2)} = €${((unit * cnt) / 100).toFixed(2)}`}</div>
                    })()}
                  </div>
                )}

                {/* Payment status */}
                <div>
                  <label style={lbl}>Payment</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['paid', 'pending'] as const).map(s2 => (
                      <button key={s2} onClick={() => setAddPayStatus(s2)}
                        style={{ flex: 1, padding: '7px', borderRadius: '8px', border: `1px solid ${addPayStatus === s2 ? s.accent : 'rgba(255,255,255,.1)'}`, background: addPayStatus === s2 ? 'rgba(243,239,230,.1)' : 'transparent', color: addPayStatus === s2 ? s.accent : s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>
                        {s2 === 'paid' ? '✅ Received now' : '⏳ Pending'}
                      </button>
                    ))}
                  </div>
                </div>

                {addPayStatus === 'paid' && (
                  <div>
                    <label style={lbl}>Payment method</label>
                    <select value={addPayMethod} onChange={e => setAddPayMethod(e.target.value)} style={inp}>
                      <option value='cash'>💵 Cash</option>
                      <option value='card_terminal' disabled>💳 Terminal (not available yet)</option>
                      <option value='bank'>🏦 Bank Transfer</option>
                      <option value='revolut'>⚡ Revolut</option>
                    </select>
                  </div>
                )}

                {addMsg && <div style={{ fontSize: '12px', color: addMsg.startsWith('✅') ? '#4ade80' : '#ff6464' }}>{addMsg}</div>}

                <button onClick={saveAddItems} disabled={addLoading || addCart.length === 0}
                  style={{ padding: '10px', borderRadius: '8px', border: 'none', background: addCart.length > 0 ? s.accent : 'rgba(255,255,255,.1)', color: addCart.length > 0 ? '#090909' : s.muted, fontWeight: 700, fontSize: '13px', cursor: addCart.length > 0 ? 'pointer' : 'not-allowed', fontFamily: s.font, opacity: addLoading ? .6 : 1 }}>
                  {addLoading ? 'Creating…' : `Save & Create Booking${addCart.length > 0 ? ` (€${((addCart.reduce((s, i) => s + i.price_cents, 0) * ((selected.group_size ?? 1) > 1 && selectedDivers.length > 0 ? (addPersonMode === 'some' ? addPersonIds.size : selected.group_size) : 1)) / 100).toFixed(2)})` : ''}`}
                </button>
              </div>
            </>)}

            {/* ══ CHANGELOG TAB ══ */}
            {detailTab === 'changelog' && (<>
              {changelogLoading ? (
                <div style={{ color: s.muted, fontSize: '12px', textAlign: 'center', padding: '8px 0' }}>Loading…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(() => {
                    type LogRow = { id: string | number; description: string | null; changed_at: string; changed_by_email: string | null; old_value: string | null; new_value: string | null; action: string; synthetic?: boolean }
                    const synth: LogRow[] = []
                    // Synthetic "Booking created" only for bookings without a real log entry (online / pre-logging bookings)
                    const hasRealCreated = changelog.some(c => c.action === 'booking_created')
                    if (!hasRealCreated && (selected as unknown as Record<string, unknown>).created_at) {
                      synth.push({ id: 'booking_created', description: '📋 Booking created', changed_at: (selected as unknown as Record<string, unknown>).created_at as string, changed_by_email: null, old_value: null, new_value: null, action: 'booking_created', synthetic: true })
                    }
                    const all = ([...changelog, ...synth] as LogRow[]).sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
                    if (all.length === 0) return <div style={{ color: s.muted, fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>No changes recorded yet</div>
                    return all.map(entry => (
                      <div key={String(entry.id)} style={{ padding: '10px 14px', background: entry.synthetic ? 'rgba(255,255,255,.015)' : 'rgba(255,255,255,.03)', borderRadius: '10px', border: `1px solid ${entry.synthetic ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.06)'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                          <LogText text={entry.description ?? entry.action} muted={!!entry.synthetic} />
                          <span style={{ fontSize: '10px', color: s.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDateTime(entry.changed_at)}</span>
                        </div>
                        {entry.action === 'notes_update' && entry.new_value && (
                          <div style={{ fontSize: '11.5px', color: s.muted, fontStyle: 'italic', marginTop: '3px', lineHeight: '1.5', padding: '5px 8px', background: 'rgba(255,255,255,.03)', borderRadius: '6px', borderLeft: '2px solid rgba(255,255,255,.12)' }}>{entry.new_value}</div>
                        )}
                        {entry.action !== 'notes_update' && entry.old_value && entry.new_value && (
                          <div style={{ fontSize: '11px', color: s.muted }}>
                            <span style={{ color: '#ff8888' }}>{entry.old_value}</span>
                            {' → '}
                            <span style={{ color: '#88ff88' }}>{entry.new_value}</span>
                          </div>
                        )}
                        {entry.changed_by_email ? (
                          <div style={{ fontSize: '10.5px', color: s.muted, marginTop: '3px', opacity: 0.7 }}>by {who(entry.changed_by_email)}</div>
                        ) : !entry.synthetic && (
                          <div style={{ fontSize: '10.5px', color: s.muted, marginTop: '3px', opacity: 0.7 }}>⚙️ by system (automatic)</div>
                        )}
                      </div>
                    ))
                  })()}
                </div>
              )}
            </>)}

            {/* ══ DIVERS TAB ══ */}
            {detailTab === 'divers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {diversLoadError && (
                  <div style={{ fontSize: '12px', color: '#ff8b70', background: 'rgba(255,96,64,.08)', border: '1px solid rgba(255,96,64,.2)', borderRadius: '8px', padding: '8px 12px' }}>
                    {diversLoadError}
                  </div>
                )}
                {selectedDivers.length === 0 && !diversLoadError && (
                  <div style={{ color: s.muted, fontSize: '12.5px', textAlign: 'center', padding: '20px 0' }}>No diver records on file.</div>
                )}
                {selectedDivers.map((d, i) => {
                  const name = d.guest_name ?? d.customer?.name ?? (i === 0 ? selected.customer_name : null) ?? d.customer?.email ?? d.invite_email ?? (i === 0 ? selected.customer_email : null) ?? `Diver ${i + 1}`
                  const isOpen = expandedDiverIds.has(d.id)
                  const diver: GuestFileDiver = d as GuestFileDiver
                  const ciDone    = !!d.checkin_completed_at
                  const ciStarted = !!d.checkin_started_at && !ciDone
                  return (
                    <div key={d.id} style={{ background: 'rgba(255,255,255,.025)', borderRadius: '10px', border: '1px solid rgba(255,255,255,.07)' }}>
                      <button
                        onClick={() => setExpandedDiverIds(prev => {
                          const next = new Set(prev)
                          if (next.has(d.id)) next.delete(d.id); else next.add(d.id)
                          return next
                        })}
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: s.font, gap: '8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: s.text }}>{name}</span>
                          <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700,
                            background: ciDone ? 'rgba(79,227,200,.12)' : ciStarted ? 'rgba(255,208,128,.1)' : 'rgba(255,255,255,.05)',
                            color: ciDone ? '#4fe3c8' : ciStarted ? '#ffd080' : '#888',
                            border: `1px solid ${ciDone ? 'rgba(79,227,200,.25)' : ciStarted ? 'rgba(255,208,128,.2)' : 'rgba(255,255,255,.1)'}` }}>
                            {ciDone ? '✓ Check-in' : ciStarted ? '⏳ In progress' : 'No check-in'}
                          </span>
                        </span>
                        <span style={{ fontSize: '14px', color: s.muted }}>{isOpen ? '▲' : '▼'}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 13px 13px' }}>
                          <GuestFile diver={diver} booked={i === 0 ? { name: selected.customer_name, email: selected.customer_email } : d.guest_name ? { name: d.guest_name, email: null } : undefined} bookingId={selected.id} onSaved={() => { loadCustomerDetails(selected.id, selected.customer_email); loadChangelog(selected.id) }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
