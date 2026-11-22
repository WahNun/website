'use client'

import React, { useEffect, useState } from 'react'
import { supabase, s } from '@/components/pages/_shared'

/**
 * Members Admin Checkout Analytics
 * Funnel, Abbrüche (mit Blocker), Fehler, Dauer pro Meilenstein, zuletzt verlorene Sessions.
 * Datenquelle: RPC checkout_analytics über /api/admin/checkout-analytics.
 */

type Funnel = { step_index: number; step: string; label: string; sessions: number }
type Analytics = {
 kpis: { sessions: number; reached_pay: number; redirected: number; converted: number; cancelled_at_stripe: number; abandoned: number; active: number; with_errors: number; median_convert_seconds: number | null; avg_convert_seconds: number | null; median_to_pay_seconds: number | null; avg_to_pay_seconds: number | null; pay_samples: number }
 funnel: Funnel[]
 by_device: { device: string | null; step_index: number; sessions: number }[]
 by_product: { product_id: string; sessions: number; converted: number; reached_pay: number }[]
 by_blocker: { blocker: string; sessions: number }[]
 errors: { event_type: string; step: string | null; field_or_endpoint: string | null; http_status: string | null; code: string | null; sample_message: string | null; occurrences: number; sessions: number; converted_sessions: number }[]
 durations: { step: string; step_index: number; median_ms: number | null; p90_ms: number | null; samples: number }[]
 recent: { session_id: string; first_seen: string; last_seen: string; device: string | null; product_id: string | null; guests: number | null; furthest_step: string | null; furthest_step_index: number; blocker: string | null; error_count: number; outcome: string; is_test: boolean; cohort: string | null; ms_on_page: number | null; lang: string | null; referrer: string | null }[]
 converted: { session_id: string; booking_id: string | null; booking_no: string | null; first_seen: string; paid_at: string | null; to_pay_s: number | null; to_convert_s: number | null; device: string | null; product_id: string | null; guests: number | null; error_count: number; is_test: boolean; cohort: string | null; lang: string | null; customer_email: string | null; booking_status: string | null; payment_state: string | null }[]
 products: string[]
 cohorts: string[]
}

const PRESETS: [string, number][] = [['7 days', 7], ['30 days', 30], ['90 days', 90]]
const pct = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–'
const fmtMs = (ms: number | null) => ms == null ? '–' : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
const fmtTs = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const card: React.CSSProperties = { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '16px', marginBottom: '16px', minWidth: 0, overflowX: 'auto' }
const h: React.CSSProperties = { fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, margin: '0 0 12px' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: '14px', color: s.muted, fontWeight: 500, padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,.08)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: '14px', color: s.text, padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,.04)', verticalAlign: 'top' }
const sel: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text)', border: '1px solid color-mix(in srgb, var(--text) 30%, transparent)', borderRadius: 0, padding: '7px 10px', fontSize: '14px', fontFamily: s.font }
const btn = (active: boolean): React.CSSProperties => ({ padding: '6px 12px', borderRadius: 0, fontSize: '14px', fontWeight: 500, fontFamily: s.font, cursor: 'pointer', border: `1px solid ${active ? 'color-mix(in srgb, var(--text) 50%, transparent)' : 'rgba(255,255,255,.12)'}`, background: active ? 'color-mix(in srgb, var(--text) 15%, transparent)' : 'transparent', color: active ? s.accent : s.sub })

export default function CheckoutAnalytics() {
 const [days, setDays] = useState(30)
 const [device, setDevice] = useState('')
 const [product, setProduct] = useState('')
 const [channel, setChannel] = useState('online')
 const [includeTest, setIncludeTest] = useState(false)
 const [data, setData] = useState<Analytics | null>(null)
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const [selectedStep, setSelectedStep] = useState<string | null>(null)
 const [reloadKey, setReloadKey] = useState(0)
 // Messbucket (app_settings.telemetry_cohort) — gleiche Logik wie Check-in Telemetry:
 // null = automatisch (aktiver Bucket, sonst Standard), '' = Standard (ohne Bucket-Daten), sonst Bucket-Name
 const [cohortSel, setCohortSel] = useState<string | null>(null)
 const [bucket, setBucket] = useState<{ active: boolean; name: string }>({ active: false, name: '' })
 useEffect(() => {
 supabase.from('app_settings').select('value').eq('key', 'telemetry_cohort').maybeSingle().then(({ data }) => {
 const v = data?.value as { active?: boolean; name?: string } | undefined
 if (v) setBucket({ active: !!v.active, name: v.name ?? '' })
 })
 }, [])
 const cohort = cohortSel !== null ? cohortSel : (bucket.active ? bucket.name : '')

 useEffect(() => {
 let cancelled = false
 ;(async () => {
 setLoading(true); setError(null)
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 if (!token) { setError('Not signed in — no session token.'); setLoading(false); return }
 const to = new Date(); to.setMinutes(to.getMinutes() + 1)
 const from = new Date(Date.now() - days * 86400_000)
 const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), device, product, channel, include_test: includeTest ? '1' : '0', cohort })
 const res = await fetch(`/api/admin/checkout-analytics?${params}`, { headers: { Authorization: `Bearer ${token}` } })
 const body = await res.json().catch(() => ({}))
 if (!res.ok) { if (!cancelled) setError(`HTTP ${res.status} — ${body.error ?? res.statusText}`); return }
 if (!cancelled) setData(body as Analytics)
 } catch (e) {
 if (!cancelled) setError(`Request failed — ${e instanceof Error ? e.message : String(e)}`)
 } finally { if (!cancelled) setLoading(false) }
 })()
 return () => { cancelled = true }
 }, [days, device, product, channel, includeTest, cohort, reloadKey])

 const k = data?.kpis
 const funnel = data?.funnel ?? []
 const started = funnel[0]?.sessions ?? 0
 const devices = Array.from(new Set((data?.by_device ?? []).map(d => d.device ?? 'unknown')))
 const deviceStep = (dev: string, idx: number) => data?.by_device.find(d => (d.device ?? 'unknown') === dev && d.step_index === idx)?.sessions ?? 0
 const errors = (data?.errors ?? []).filter(e => !selectedStep || e.step === selectedStep)
 const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID

 return (
 <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 16px 60px', fontFamily: s.font }}>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
 {PRESETS.map(([l, d]) => <button key={d} type="button" onClick={() => setDays(d)} style={btn(days === d)}>{l}</button>)}
 <select value={channel} onChange={e => setChannel(e.target.value)} style={sel} title="Online = customers booking on the website (/book). Front Office = payment links sold by staff (no funnel, only the payment)">
 <option value="online">Online bookings</option><option value="front_office">Front Office sales</option><option value="all">Online + Front Office</option>
 </select>
 <select value={device} onChange={e => setDevice(e.target.value)} style={sel}>
 <option value="">All devices</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option>
 </select>
 <select value={product} onChange={e => setProduct(e.target.value)} style={sel}>
 <option value="">All products</option>
 {(data?.products ?? []).map(p => <option key={p} value={p}>{p}</option>)}
 </select>
 {(bucket.name || (data?.cohorts ?? []).length > 0) && (
 <select value={cohort} onChange={e => setCohortSel(e.target.value)} style={sel} title="Measurement bucket — same setting as Check-in Telemetry (app_settings.telemetry_cohort)">
 <option value="">Standard (no bucket)</option>
 {Array.from(new Set([...(data?.cohorts ?? []), bucket.name].filter(Boolean))).sort().map(c => <option key={c} value={c}> {c}{bucket.active && c === bucket.name ? ' (active)' : ''}</option>)}
 </select>
 )}
 {cohort ? (
 <span style={{ fontSize: '14px', color: 'var(--text)' }}> Bucket &quot;{cohort}&quot; — all sessions (test + real)</span>
 ) : (
 <label style={{ fontSize: '14px', color: s.sub, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
 <input type="checkbox" checked={includeTest} onChange={e => setIncludeTest(e.target.checked)} /> Include test sessions
 </label>
 )}
 <button type="button" onClick={() => setReloadKey(x => x + 1)} style={btn(false)}> Refresh</button>
 {loading && <span style={{ fontSize: '14px', color: s.muted }}>Loading…</span>}
 {clarityId && <a href={`https://clarity.microsoft.com/projects/view/${clarityId}/heatmaps`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: '14px', color: s.accent, textDecoration: 'underline' }}>Heatmaps & recordings in Clarity </a>}
 </div>

 {error && <div style={{ ...card, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontSize: '14px' }}>Could not load checkout analytics: {error}</div>}

 {data && started === 0 && !error && <div style={{ ...card, color: s.sub, fontSize: '14px' }}>No checkout sessions in this range yet.</div>}

 {k && started > 0 && (
 <>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
 {([
 ['Sessions started', String(k.sessions)],
 ['Reached Pay', `${k.reached_pay} · ${pct(k.reached_pay, k.sessions)}`],
 ['Redirected to Stripe', `${k.redirected} · ${pct(k.redirected, k.sessions)}`],
 ['Converted', `${k.converted} · ${pct(k.converted, k.sessions)}`],
 ['Cancelled at Stripe', String(k.cancelled_at_stripe)],
 ['Abandoned', `${k.abandoned} · ${pct(k.abandoned, k.sessions)}`],
 ['Sessions with errors', `${k.with_errors} · ${pct(k.with_errors, k.sessions)}`],
 ['Avg checkout time (open Pay)', k.avg_to_pay_seconds == null ? '–' : `${fmtMs(k.avg_to_pay_seconds * 1000)} · median ${fmtMs((k.median_to_pay_seconds ?? 0) * 1000)}`],
 ['Avg time to paid (open success)', k.avg_convert_seconds == null ? '–' : `${fmtMs(k.avg_convert_seconds * 1000)} · median ${fmtMs((k.median_convert_seconds ?? 0) * 1000)}`],
 ] as [string, string][]).map(([l, v]) => (
 <div key={l} style={{ ...card, marginBottom: 0 }}>
 <div style={{ fontSize: '14px', color: s.muted, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase' }}>{l}</div>
 <div style={{ fontSize: '20px', fontWeight: 500, color: s.text, marginTop: '4px' }}>{v}</div>
 </div>
 ))}
 </div>

 <div style={card}>
 <p style={h}>Funnel — click a step to filter errors</p>
 {funnel.map((f, i) => {
 const next = funnel[i + 1]
 const drop = next ? f.sessions - next.sessions : 0
 const w = started > 0 ? Math.max(2, (f.sessions / started) * 100) : 0
 const active = selectedStep === f.step
 return (
 <div key={f.step} onClick={() => setSelectedStep(active ? null : f.step)} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 170px', gap: '10px', alignItems: 'center', padding: '6px 8px', borderRadius: 0, cursor: 'pointer', background: active ? 'color-mix(in srgb, var(--text) 8%, transparent)' : 'transparent' }}>
 <div style={{ fontSize: '14px', color: active ? s.accent : s.text, fontWeight: 500 }}>{f.step_index}. {f.label}</div>
 <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 0, height: '18px', overflow: 'hidden' }}>
 <div style={{ width: `${w}%`, height: '100%', background: f.step === 'payment_succeeded' ? 'var(--text)' : s.accent, opacity: .85 }} />
 </div>
 <div style={{ fontSize: '14px', color: s.sub, textAlign: 'right' }}>
 <b style={{ color: s.text }}>{f.sessions}</b> · {pct(f.sessions, started)}
 {next && drop > 0 && <span style={{ color: 'var(--text)', marginLeft: '6px' }}>−{drop} ({pct(drop, f.sessions)})</span>}
 </div>
 </div>
 )
 })}
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '16px' }}>
 <div style={card}>
 <p style={h}>Abandoned — what blocked them</p>
 {data.by_blocker.length === 0 ? <div style={{ fontSize: '14px', color: s.sub }}>No abandoned sessions.</div> : (
 <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Blocker (Pay button text at exit)</th><th style={{ ...th, textAlign: 'right' }}>Sessions</th><th style={{ ...th, textAlign: 'right' }}>Share</th></tr></thead>
 <tbody>{data.by_blocker.map(b => <tr key={b.blocker}><td style={td}>{b.blocker}</td><td style={{ ...td, textAlign: 'right' }}>{b.sessions}</td><td style={{ ...td, textAlign: 'right' }}>{pct(b.sessions, k.abandoned)}</td></tr>)}</tbody></table>
 )}
 </div>
 <div style={card}>
 <p style={h}>Drop-off by step × device</p>
 <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Step</th>{devices.map(d => <th key={d} style={{ ...th, textAlign: 'right' }}>{d}</th>)}</tr></thead>
 <tbody>{funnel.map(f => <tr key={f.step}><td style={td}>{f.label}</td>{devices.map(d => { const n = deviceStep(d, f.step_index); const base = deviceStep(d, 0); return <td key={d} style={{ ...td, textAlign: 'right' }}>{n} <span style={{ color: s.muted }}>({pct(n, base)})</span></td> })}</tr>)}</tbody></table>
 </div>
 <div style={card}>
 <p style={h}>Conversion by product</p>
 <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Product</th><th style={{ ...th, textAlign: 'right' }}>Sessions</th><th style={{ ...th, textAlign: 'right' }}>Reached Pay</th><th style={{ ...th, textAlign: 'right' }}>Converted</th><th style={{ ...th, textAlign: 'right' }}>Rate</th></tr></thead>
 <tbody>{data.by_product.map(p => <tr key={p.product_id}><td style={td}>{p.product_id}</td><td style={{ ...td, textAlign: 'right' }}>{p.sessions}</td><td style={{ ...td, textAlign: 'right' }}>{p.reached_pay}</td><td style={{ ...td, textAlign: 'right' }}>{p.converted}</td><td style={{ ...td, textAlign: 'right' }}>{pct(p.converted, p.sessions)}</td></tr>)}</tbody></table>
 </div>
 <div style={card}>
 <p style={h}>Time between milestones</p>
 <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>From step</th><th style={{ ...th, textAlign: 'right' }}>Median</th><th style={{ ...th, textAlign: 'right' }}>p90</th><th style={{ ...th, textAlign: 'right' }}>Samples</th></tr></thead>
 <tbody>{data.durations.map(d => <tr key={d.step}><td style={td}>{d.step}</td><td style={{ ...td, textAlign: 'right' }}>{fmtMs(d.median_ms)}</td><td style={{ ...td, textAlign: 'right' }}>{fmtMs(d.p90_ms)}</td><td style={{ ...td, textAlign: 'right' }}>{d.samples}</td></tr>)}</tbody></table>
 </div>
 </div>

 <div style={card}>
 <p style={h}>Errors {selectedStep ? `— step: ${selectedStep}` : ''}</p>
 {errors.length === 0 ? <div style={{ fontSize: '14px', color: s.sub }}>No errors recorded.</div> : (
 <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Type</th><th style={th}>Step</th><th style={th}>Field / endpoint</th><th style={th}>Status</th><th style={th}>Code</th><th style={th}>Sample message</th><th style={{ ...th, textAlign: 'right' }}>Count</th><th style={{ ...th, textAlign: 'right' }}>Sessions</th><th style={{ ...th, textAlign: 'right' }}>Still converted</th></tr></thead>
 <tbody>{errors.map((e, i) => <tr key={i}><td style={td}>{e.event_type}</td><td style={td}>{e.step ?? '–'}</td><td style={td}>{e.field_or_endpoint ?? '–'}</td><td style={td}>{e.http_status ?? '–'}</td><td style={td}>{e.code ?? '–'}</td><td style={{ ...td, color: s.sub, maxWidth: '320px' }}>{e.sample_message ?? '–'}</td><td style={{ ...td, textAlign: 'right' }}>{e.occurrences}</td><td style={{ ...td, textAlign: 'right' }}>{e.sessions}</td><td style={{ ...td, textAlign: 'right' }}>{e.converted_sessions} ({pct(e.converted_sessions, e.sessions)})</td></tr>)}</tbody></table></div>
 )}
 </div>

 <div style={card}>
 <p style={h}>Converted sessions — booking no. checkout</p>
 {(data.converted ?? []).length === 0 ? <div style={{ fontSize: '14px', color: s.sub }}>No converted sessions in this range.</div> : (
 <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Paid at</th><th style={th}>Booking no.</th><th style={th}>Guest</th><th style={th}>Product</th><th style={th}>Guests</th><th style={th}>Device</th><th style={th}>Open Pay</th><th style={th}>Open Paid</th><th style={th}>Errors</th><th style={th}>Booking</th></tr></thead>
 <tbody>{data.converted.map(c => (
 <tr key={c.session_id}>
 <td style={td}>{c.paid_at ? fmtTs(c.paid_at) : '–'}{c.is_test && <span style={{ marginLeft: '6px', fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>TEST</span>}</td>
 <td style={{ ...td, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>{c.booking_no ? <>#{c.booking_no}<button type="button" onClick={() => { navigator.clipboard?.writeText(c.booking_id ?? '').catch(() => {}) }} style={{ marginLeft: '6px', background: 'none', border: 'none', color: s.accent, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>copy</button></> : <span style={{ color: 'var(--text)' }} title="Payment succeeded but no booking linked yet — webhook may still be running">not linked</span>}</td>
 <td style={{ ...td, color: s.sub }}>{c.customer_email ?? '–'}</td>
 <td style={td}>{c.product_id ?? '–'}</td><td style={td}>{c.guests ?? '–'}</td><td style={td}>{c.device ?? '–'}</td>
 <td style={td}>{c.to_pay_s == null ? '–' : fmtMs(c.to_pay_s * 1000)}</td>
 <td style={td}>{c.to_convert_s == null ? '–' : fmtMs(c.to_convert_s * 1000)}</td>
 <td style={{ ...td, color: c.error_count > 0 ? 'var(--text)' : s.text }}>{c.error_count}</td>
 <td style={{ ...td, color: s.sub }}>{c.booking_status ?? '–'}{c.payment_state ? ` · ${c.payment_state}` : ''}</td>
 </tr>
 ))}</tbody></table></div>
 )}
 </div>

 <div style={card}>
 <p style={h}>Recently lost sessions</p>
 {data.recent.length === 0 ? <div style={{ fontSize: '14px', color: s.sub }}>None.</div> : (
 <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Last seen</th><th style={th}>Outcome</th><th style={th}>Device</th><th style={th}>Product</th><th style={th}>Guests</th><th style={th}>Furthest step</th><th style={th}>Blocker</th><th style={th}>Errors</th><th style={th}>On page</th><th style={th}>Session</th></tr></thead>
 <tbody>{data.recent.map(r => (
 <tr key={r.session_id}>
 <td style={td}>{fmtTs(r.last_seen)}{r.is_test && <span style={{ marginLeft: '6px', fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>TEST</span>}</td>
 <td style={td}>{r.outcome}</td><td style={td}>{r.device ?? '–'}</td><td style={td}>{r.product_id ?? '–'}</td><td style={td}>{r.guests ?? '–'}</td>
 <td style={td}>{r.furthest_step ?? '–'}</td><td style={{ ...td, color: 'var(--text)' }}>{r.blocker ?? '–'}</td><td style={td}>{r.error_count}</td><td style={td}>{fmtMs(r.ms_on_page)}</td>
 <td style={{ ...td, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', color: s.muted }} title="Clarity: filter recordings by custom tag telemetry_session = this value">{r.session_id.slice(0, 8)}…
 <button type="button" onClick={() => { navigator.clipboard?.writeText(r.session_id).catch(() => {}) }} style={{ marginLeft: '6px', background: 'none', border: 'none', color: s.accent, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>copy</button></td>
 </tr>
 ))}</tbody></table></div>
 )}
 </div>
 </>
 )}
 </div>
 )
}
