'use client'

import { useEffect, useRef } from 'react'

/**
 * Checkout-Telemetrie für /book.
 *
 * Der Checkout ist eine einzige Seite, kein Stepper — deshalb tracken wir
 * MEILENSTEINE (Produkt gewählt, E-Mail gültig, Tage gewählt, …) statt
 * Seitenwechsel. Jeder Meilenstein wird einmal als `step_entered` gemeldet,
 * wenn er erreicht wird, und als `step_back`, wenn er wieder verloren geht.
 * Beim Verlassen der Seite geht ein `abandoned` mit dem konkreten Blocker raus
 * (der Text, der gerade auf dem Pay-Button stand).
 *
 * Grundsatz: Telemetrie darf den Checkout NIE brechen. Alles ist in try/catch,
 * nichts wartet, Fehler landen höchstens in console.warn. Keine Personendaten.
 */

export const CHECKOUT_STEPS = [
  'checkout_opened',
  'product_selected',
  'email_entered',
  'dates_selected',
  'insurance_selected',
  'terms_accepted',
  'payment_started',
  'stripe_redirect',
  'payment_succeeded',
] as const
export type CheckoutStep = typeof CHECKOUT_STEPS[number]
export const stepIndex = (s: CheckoutStep) => CHECKOUT_STEPS.indexOf(s)

export type TelemetryEvent =
  | 'checkout_opened' | 'step_entered' | 'step_back' | 'product_selected' | 'date_selected' | 'extras_changed'
  | 'insurance_selected' | 'field_error' | 'validation_failed' | 'api_error' | 'payment_started' | 'stripe_redirect'
  | 'payment_succeeded' | 'payment_cancelled' | 'payment_failed' | 'heartbeat' | 'abandoned'

type Payload = Record<string, string | number | boolean | null | undefined>

const ENDPOINT = '/api/telemetry/checkout'
const SID_KEY = 'azd_ct_sid'
const REDIRECT_KEY = 'azd_ct_redirected'
const FLUSH_MS = 3000
const BATCH_MAX = 10

let queue: Record<string, unknown>[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let sentOpened = false

function uuid(): string {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID() } catch { /* fallthrough */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16) })
}

/** Session-ID pro Browser-Tab; überlebt den Ausflug zu Stripe und zurück. */
export function getCheckoutSessionId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    let sid = sessionStorage.getItem(SID_KEY)
    if (!sid) { sid = uuid(); sessionStorage.setItem(SID_KEY, sid) }
    return sid
  } catch { return null }
}

/** Nach erfolgreicher Zahlung: neue Session für die nächste Buchung im selben Tab. */
export function resetCheckoutSession() {
  try { sessionStorage.removeItem(SID_KEY); sessionStorage.removeItem(REDIRECT_KEY) } catch { /* ignore */ }
}

function isSandbox(): boolean {
  try { return new URLSearchParams(window.location.search).get('sandbox') === '1' } catch { return false }
}

function device(): string {
  try {
    const w = window.innerWidth
    return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop'
  } catch { return 'unknown' }
}

/** Personendaten dürfen nie ins Payload — hart filtern, auch wenn ein Aufrufer sie reinreicht. */
const PII_KEYS = /name|email|phone|mail|card|iban|address|street|birth|passport|tax/i
function clean(p?: Payload): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!p) return out
  for (const [k, v] of Object.entries(p)) {
    if (PII_KEYS.test(k)) continue
    if (v === undefined) continue
    out[k] = typeof v === 'string' ? v.slice(0, 200) : v
  }
  return out
}

function clarity(...args: unknown[]) {
  try {
    const w = window as unknown as { clarity?: (...a: unknown[]) => void }
    if (typeof w.clarity === 'function') w.clarity(...args)
  } catch { /* ignore */ }
}

function send(events: Record<string, unknown>[], beacon: boolean) {
  if (!events.length) return
  try {
    const body = JSON.stringify({ events })
    if (beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return
    }
    fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
      .catch(e => console.warn('[telemetry] send failed', e))
  } catch (e) { console.warn('[telemetry] send failed', e) }
}

export function flushTelemetry(beacon = false) {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  const batch = queue; queue = []
  send(batch, beacon)
}

/** Ein Ereignis einreihen. Nie blockierend. */
export function track(event: TelemetryEvent, opts: { step?: CheckoutStep; payload?: Payload } = {}) {
  try {
    if (typeof window === 'undefined') return
    const sid = getCheckoutSessionId()
    if (!sid) return
    const step = opts.step
    queue.push({
      session_id: sid,
      event_type: event,
      step: step ?? null,
      step_index: step ? stepIndex(step) : null,
      payload: clean(opts.payload),
      device: device(),
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      lang: navigator.language?.slice(0, 8) ?? null,
      is_test: isSandbox(),
      client_ts: Date.now(),
    })
    if (step) clarity('set', 'checkout_step', step)
    if (event === 'stripe_redirect') { try { sessionStorage.setItem(REDIRECT_KEY, '1') } catch { /* ignore */ } }
    if (event === 'payment_succeeded') clarity('event', 'checkout_converted')
    if (event === 'abandoned') clarity('event', 'checkout_abandoned')

    // Direkt vor einem Seitenwechsel sofort raus, sonst gebatcht
    if (event === 'stripe_redirect' || event === 'abandoned' || queue.length >= BATCH_MAX) { flushTelemetry(event !== 'stripe_redirect' ? true : false); return }
    if (!flushTimer) flushTimer = setTimeout(() => flushTelemetry(false), FLUSH_MS)
  } catch (e) { console.warn('[telemetry] track failed', e) }
}

export type CheckoutProgress = {
  /** Produkt-ID, sobald ein Produkt gewählt ist */
  product_id: string | null
  request_only: boolean
  email_entered: boolean
  dates_selected: boolean
  insurance_selected: boolean
  terms_accepted: boolean
  guests: number
  split: boolean
  /** Text des Pay-Buttons, wenn noch nicht gebucht werden kann — das ist der Blocker */
  blocker: string | null
}

/**
 * Hook für app/book/page.tsx: meldet Meilensteine, Öffnen und Verlassen.
 * Muss VOR jedem early return aufgerufen werden (Hook-Regeln).
 */
export function useCheckoutTelemetry(progress: CheckoutProgress) {
  const prev = useRef<Partial<Record<CheckoutStep, boolean>>>({})
  const latest = useRef(progress)
  useEffect(() => { latest.current = progress })
  const opened = useRef<number>(0)

  // Öffnen + Verlassen (einmal pro Mount)
  useEffect(() => {
    try {
      const sid = getCheckoutSessionId()
      if (!sid) return
      opened.current = Date.now()
      // Zurück von Stripe (Cancel landet auf /, aber Browser-Back landet hier): Redirect-Flag zurücksetzen
      try { sessionStorage.removeItem(REDIRECT_KEY) } catch { /* ignore */ }
      if (!sentOpened) {
        sentOpened = true
        let utm: Record<string, string> | null = null
        try {
          const q = new URLSearchParams(window.location.search)
          const u: Record<string, string> = {}
          for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) { const v = q.get(k); if (v) u[k] = v.slice(0, 100) }
          if (q.get('product')) u.prefill_product = q.get('product')!.slice(0, 60)
          if (q.get('draft_id')) u.from_draft = '1'
          u.origin = q.get('src') === 'chatbot' || q.get('draft_id') ? 'chatbot' : 'website'
          utm = Object.keys(u).length ? u : null
        } catch { /* ignore */ }
        track('checkout_opened', { step: 'checkout_opened', payload: { referrer: (() => { try { return document.referrer.slice(0, 200) || null } catch { return null } })(), ...(utm ?? {}) } })
        clarity('set', 'telemetry_session', sid)
      }
    } catch (e) { console.warn('[telemetry] open failed', e) }

    const onHide = () => {
      try {
        let redirected = false
        try { redirected = sessionStorage.getItem(REDIRECT_KEY) === '1' } catch { /* ignore */ }
        if (redirected) { flushTelemetry(true); return }
        const p = latest.current
        track('abandoned', {
          step: undefined,
          payload: {
            blocker: p.blocker,
            product_id: p.product_id,
            guests: p.guests,
            split: p.split,
            ms_on_page: Date.now() - opened.current,
          },
        })
      } catch (e) { console.warn('[telemetry] abandon failed', e) }
    }
    const onVis = () => { if (document.visibilityState === 'hidden') flushTelemetry(true) }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVis)
    return () => { window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Meilensteine
  useEffect(() => {
    try {
      const now: Partial<Record<CheckoutStep, boolean>> = {
        product_selected: Boolean(progress.product_id),
        email_entered: progress.email_entered,
        dates_selected: progress.dates_selected,
        insurance_selected: progress.insurance_selected,
        terms_accepted: progress.terms_accepted,
      }
      for (const [k, v] of Object.entries(now) as [CheckoutStep, boolean][]) {
        const was = prev.current[k] ?? false
        if (v && !was) track('step_entered', { step: k, payload: { product_id: progress.product_id, guests: progress.guests, split: progress.split, request_only: progress.request_only } })
        else if (!v && was) track('step_back', { step: k, payload: { product_id: progress.product_id } })
        prev.current[k] = v
      }
    } catch (e) { console.warn('[telemetry] milestone failed', e) }
  }, [progress.product_id, progress.email_entered, progress.dates_selected, progress.insurance_selected, progress.terms_accepted, progress.guests, progress.split, progress.request_only])

  // Produktwechsel separat (für Heatmap-Filter in Clarity + Produktstatistik)
  const lastProduct = useRef<string | null>(null)
  useEffect(() => {
    try {
      if (progress.product_id && progress.product_id !== lastProduct.current) {
        if (lastProduct.current !== null) track('product_selected', { payload: { product_id: progress.product_id, request_only: progress.request_only } })
        lastProduct.current = progress.product_id
        clarity('set', 'product', progress.product_id)
      }
    } catch { /* ignore */ }
  }, [progress.product_id, progress.request_only])
}
