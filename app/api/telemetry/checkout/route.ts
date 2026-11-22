import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/telemetry/checkout — nimmt gebatchte Checkout-Events vom Browser entgegen.
 *
 * Antwortet IMMER 204 (auch bei Teilfehlern), damit der Checkout nie an der
 * Telemetrie hängt. Personendaten-Keys werden hart verworfen, Rate-Limit pro
 * Session, Insert mit Service Role (die Tabelle hat keine Insert-Policy).
 */

export const runtime = 'nodejs'

const EVENT_TYPES = new Set([
  'checkout_opened', 'step_entered', 'step_back', 'product_selected', 'date_selected', 'extras_changed',
  'insurance_selected', 'field_error', 'validation_failed', 'api_error', 'payment_started', 'stripe_redirect',
  'payment_succeeded', 'payment_cancelled', 'payment_failed', 'heartbeat', 'abandoned',
])
const PII_KEYS = /name|email|phone|mail|card|iban|address|street|birth|passport|tax/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_EVENTS_PER_SESSION_PER_HOUR = 400
const MAX_BATCH = 50

type Incoming = {
  session_id?: unknown; event_type?: unknown; step?: unknown; step_index?: unknown; payload?: unknown
  device?: unknown; viewport_w?: unknown; viewport_h?: unknown; lang?: unknown; is_test?: unknown
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null
}
function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null
}

function cleanPayload(p: unknown): Record<string, unknown> {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
  const out: Record<string, unknown> = {}
  let size = 0
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (PII_KEYS.test(k)) continue
    if (k === 'referrer' || k === 'utm_source' || k === 'utm_medium' || k === 'utm_campaign' || k === 'utm_content' || k === 'utm_term' || k === 'prefill_product' || k === 'from_draft') { out[k] = typeof v === 'string' ? v.slice(0, 200) : v; continue }
    let val: unknown
    if (typeof v === 'string') val = v.includes('@') ? '[redacted]' : v.slice(0, 200)
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) val = v
    else continue
    size += k.length + String(val).length
    if (size > 2048) break
    out[k] = val
  }
  return out
}

export async function POST(req: NextRequest) {
  const noContent = () => new NextResponse(null, { status: 204 })
  try {
    // sendBeacon schickt text/plain oder application/json — beides als Text lesen
    const raw = await req.text()
    if (!raw || raw.length > 200_000) return noContent()
    let body: { events?: unknown }
    try { body = JSON.parse(raw) } catch { return noContent() }
    const list = Array.isArray(body?.events) ? (body.events as Incoming[]).slice(0, MAX_BATCH) : []
    if (!list.length) return noContent()

    const ua = (req.headers.get('user-agent') ?? '').slice(0, 300) || null
    const rows: Record<string, unknown>[] = []
    const sessions = new Set<string>()
    const successes: { session_id: string; stripe_session_id: string }[] = []

    for (const ev of list) {
      const sid = typeof ev.session_id === 'string' && UUID.test(ev.session_id) ? ev.session_id.toLowerCase() : null
      const type = typeof ev.event_type === 'string' && EVENT_TYPES.has(ev.event_type) ? ev.event_type : null
      if (!sid || !type) continue
      const payload = cleanPayload(ev.payload)
      const referrer = type === 'checkout_opened' ? str(payload.referrer, 200) : null
      const utmEntries = Object.entries(payload).filter(([k]) => k.startsWith('utm_') || k === 'prefill_product' || k === 'from_draft')
      const utm = type === 'checkout_opened' && utmEntries.length ? Object.fromEntries(utmEntries) : null
      delete payload.referrer
      for (const [k] of utmEntries) delete payload[k]
      sessions.add(sid)
      if (type === 'payment_succeeded' && typeof payload.stripe_session_id === 'string') successes.push({ session_id: sid, stripe_session_id: payload.stripe_session_id })
      rows.push({
        session_id: sid,
        event_type: type,
        step: str(ev.step, 64),
        step_index: int(ev.step_index),
        payload,
        device: str(ev.device, 16),
        viewport_w: int(ev.viewport_w),
        viewport_h: int(ev.viewport_h),
        referrer,
        utm,
        lang: str(ev.lang, 8),
        user_agent: ua,
        is_test: ev.is_test === true,
      })
    }
    if (!rows.length) return noContent()

    const supabase = db()

    // Messbucket (app_settings.telemetry_cohort, gleicher Mechanismus wie checkin_step_events):
    // solange aktiv, werden neue Zeilen damit markiert — unabhängig von is_test.
    let cohort: string | null = null
    try {
      const { data: cfg } = await supabase.from('app_settings').select('value').eq('key', 'telemetry_cohort').maybeSingle()
      const v = cfg?.value as { active?: boolean; name?: string } | undefined
      if (v?.active && typeof v.name === 'string' && v.name) cohort = v.name.slice(0, 64)
    } catch (e) { console.warn('[telemetry] cohort lookup failed', e instanceof Error ? e.message : e) }
    for (const r of rows) r.cohort = cohort

    // Rate-Limit pro Session (einfacher Count, keine neue Dependency)
    const since = new Date(Date.now() - 3600_000).toISOString()
    for (const sid of sessions) {
      const { count, error } = await supabase.from('checkout_events').select('id', { count: 'exact', head: true }).eq('session_id', sid).gte('created_at', since)
      if (error) console.warn('[telemetry] rate-limit count failed', error.message)
      if ((count ?? 0) > MAX_EVENTS_PER_SESSION_PER_HOUR) {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].session_id === sid) rows.splice(i, 1)
      }
    }
    if (!rows.length) return noContent()

    const { error } = await supabase.from('checkout_events').insert(rows)
    if (error) console.warn('[telemetry] insert failed', error.message)

    // Erfolgreiche Zahlung: Buchung nachtragen + is_test aus der Buchung übernehmen (die ist verbindlich)
    for (const s of successes) {
      const { data: b } = await supabase.from('bookings').select('id,is_test,product_name').eq('stripe_session_id', s.stripe_session_id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (b?.id) {
        const { error: e1 } = await supabase.from('checkout_events').update({ booking_id: b.id }).eq('session_id', s.session_id).is('booking_id', null)
        if (e1) console.warn('[telemetry] booking link failed', e1.message)
        // Zahlung ohne vorherige Checkout-Events (z. B. Rückkehr in anderer Session/Browser): Produkt aus der Buchung nachtragen,
        // sonst erscheint die Session in "Conversion by product" als "(none)".
        if (b.product_name) {
          const { data: has } = await supabase.from('checkout_events').select('id').eq('session_id', s.session_id).not('payload->>product_id', 'is', null).limit(1)
          if (!has?.length) {
            const { data: ev } = await supabase.from('checkout_events').select('id,payload').eq('session_id', s.session_id).eq('event_type', 'payment_succeeded')
            for (const r of ev ?? []) {
              const { error: e3 } = await supabase.from('checkout_events').update({ payload: { ...(r.payload as Record<string, unknown> ?? {}), product_id: String(b.product_name).slice(0, 80) } }).eq('id', r.id)
              if (e3) console.warn('[telemetry] product backfill failed', e3.message)
            }
          }
        }
        if (b.is_test) {
          const { error: e2 } = await supabase.from('checkout_events').update({ is_test: true }).eq('session_id', s.session_id).eq('is_test', false)
          if (e2) console.warn('[telemetry] is_test sync failed', e2.message)
        }
      }
    }
  } catch (e) {
    console.warn('[telemetry] route failed', e instanceof Error ? e.message : e)
  }
  return noContent()
}
