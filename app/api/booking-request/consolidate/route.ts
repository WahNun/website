import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { canWorkLive } from '@/lib/liveAccess'
import { auditStaff } from '@/lib/auditServer'
import { validateGuest, bookingMetadataFor, lineItemsFor, type GuestInput } from '@/lib/checkoutGuest'
import type { BookingSessionKey } from '@/lib/availability'
import { planAssignments, slotKey, type PlanRequest } from '@/lib/requestPlanning'
import { getAvailability } from '@/lib/availability'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

/**
 * POST /api/booking-request/consolidate  { booking_ids: string[], slots: [{ date, session }], date?, session? }  (Staff)
 * Low Season (Lucas 28.10.): mehrere Anfragen auf gemeinsame Tauchtage legen, die sich lohnen. Jede Anfrage bekommt die
 * gewählten Slots, die ihren Wunschtagen am nächsten liegen (lib/requestPlanning.assignSlots). Sind weniger Slots
 * gewählt als Tauchtage, wird die Anfrage GEKÜRZT (Lucas 28.10.): Produkt → das Produkt derselben Kategorie mit passender
 * Tagezahl (4-Dive Pack → Daily Double Dive), Betrag/Extras/DAN per validateGuest neu gerechnet, Spec aktualisiert, übrige Tage
 * gelöscht. Kurse (tbd) und Split → Sessions-Tab. Keine Mail — die kommt erst mit Approve (nennt Alt → Neu).
 * `preview: true` rechnet nur und ändert nichts (Planner zeigt, was passieren würde).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  let body: { booking_ids?: string[]; slots?: { date?: string; session?: string }[]; date?: string; session?: string; preview?: boolean; not_earlier?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const ids = Array.isArray(body.booking_ids) ? body.booking_ids.filter(x => typeof x === 'string').slice(0, 50) : []
  const rawSlots = Array.isArray(body.slots) && body.slots.length ? body.slots : (body.date ? [{ date: body.date, session: body.session ?? 'am' }] : [])
  const slots = rawSlots.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) && ['am', 'pm', 'night'].includes(String(x.session))).map(x => ({ date: String(x.date), session: String(x.session) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session))
  if (ids.length === 0) return NextResponse.json({ error: 'booking_ids required' }, { status: 400 })
  if (slots.length === 0) return NextResponse.json({ error: 'Pick at least one dive day (date + AM/PM)' }, { status: 400 })
  const slotLabel = (x: { date: string; session: string }) => `${x.date} ${x.session.toUpperCase()}`

  const supabase = getServiceClient()
  const actor = auth.user.email ?? auth.user.id
  const preview = body.preview === true
  const notEarlier = body.not_earlier !== false
  // ── Gemeinsame Verteilung (nächster Tag, nicht früher, Kapazität) — erst alle laden, dann planen, dann je Buchung umsetzen ──
  const loaded = new Map<string, { b: Record<string, unknown>; live: { id: string; session_date: string; session: string; status: string | null }[] }>()
  for (const id of ids) {
    const { data: b } = await supabase.from('bookings').select('id, status, request_state, parent_booking_id, is_test, product_name, customer_email, group_size, amount, request_spec_id, booking_extras, insurance_product_id, insurance_amount, last_dive_date').eq('id', id).maybeSingle()
    if (!b) continue
    const { data: sess } = await supabase.from('booking_sessions').select('id, session_date, session, status').eq('booking_id', id).order('session_date')
    loaded.set(id, { b: b as Record<string, unknown>, live: ((sess ?? []) as { id: string; session_date: string; session: string; status: string | null }[]).filter(x => !x.status || x.status === 'booked') })
  }
  const planReqs: PlanRequest[] = [...loaded.entries()].filter(([, v]) => v.live.length > 0 && !v.live.some(x => x.session === 'tbd')).map(([id, v]) => ({
    id, sessions: v.live.map(x => ({ date: x.session_date, session: x.session })), divers: Math.max(1, Number(v.b.group_size ?? 1)), night: /night/i.test(String(v.b.product_name ?? '')),
  }))
  const capacityLeft = new Map<string, number>()
  if (slots.length) {
    const dates = slots.map(x => x.date).sort()
    const isTest = [...loaded.values()].some(v => v.b.is_test === true)
    try {
      const avail = await getAvailability(dates[0], dates[dates.length - 1], undefined, isTest)
      for (const a of avail) capacityLeft.set(slotKey({ date: a.date, session: a.session }), Math.max(0, a.capacity - a.booked))
    } catch (e) { console.warn('[consolidate] availability failed, planning without capacity:', e instanceof Error ? e.message : e) }
  }
  const plan = new Map(planAssignments(planReqs, slots, { notEarlier, capacityLeft }).map(a => [a.id, a]))
  const results: { booking_id: string; ok: boolean; moved_from?: string; moved_to?: string; note?: string; error?: string; shortened?: { from_product: string; to_product: string; from_cents: number; to_cents: number } }[] = []
  for (const id of ids) {
    const entry = loaded.get(id)
    if (!entry) { results.push({ booking_id: id, ok: false, error: 'not found' }); continue }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = entry.b as any
    if (b.parent_booking_id) { results.push({ booking_id: id, ok: false, error: 'linked guest booking — move via the main booking' }); continue }
    if (b.status !== 'pending' || !['requested', 'expired'].includes(b.request_state ?? '')) { results.push({ booking_id: id, ok: false, error: `not an open request (${b.status}/${b.request_state ?? '—'})` }); continue }
    if (!b.is_test && !(await canWorkLive(supabase, auth.user.id))) { results.push({ booking_id: id, ok: false, error: 'live requests: admin or Production data access only' }); continue }
    const { count: kids } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('parent_booking_id', id)
    if ((kids ?? 0) > 0) { results.push({ booking_id: id, ok: false, error: 'split request — adjust in the Sessions tab' }); continue }
    const live = entry.live
    if (live.length === 0) { results.push({ booking_id: id, ok: false, error: 'no sessions' }); continue }
    if (live.some(x => x.session === 'tbd')) { results.push({ booking_id: id, ok: false, error: 'course day (instructor sets times) — adjust in the Sessions tab' }); continue }
    const isNightProduct = /night/i.test(b.product_name ?? '')
    if (isNightProduct && slots.some(x => x.session !== 'night')) { results.push({ booking_id: id, ok: false, error: 'night dive — pick a NIGHT slot for it' }); continue }
    if (!isNightProduct && slots.some(x => x.session === 'night')) { results.push({ booking_id: id, ok: false, error: 'day dive — pick an AM/PM slot for it' }); continue }
    const from = live.map(x => slotLabel({ date: x.session_date, session: x.session })).join(' · ')
    const assignment = plan.get(id)
    if (!assignment || assignment.target.length === 0) { results.push({ booking_id: id, ok: false, error: 'no suitable slot in the picked days' }); continue }
    const target = assignment.target
    const moveCount = target.length
    const dropped = live.slice(moveCount)
    if (assignment.over && !preview) { results.push({ booking_id: id, ok: false, error: `boat full on ${target.map(slotLabel).join(' · ')} — pick another day for this request` }); continue }

    // ── Kürzen: weniger Slots als Tauchtage → Produkt mit passender Tagezahl, Betrag neu ──
    let shorten: { newProductId: string; newProductName: string; newAmount: number; meta: Record<string, string>; lineItems: Array<Record<string, unknown>>; extras: Record<string, unknown> | null; insuranceProductId: string | null; insuranceAmount: number | null } | null = null
    if (dropped.length > 0) {
      const { data: cur } = await supabase.from('course_prices').select('id, name, category, sessions_included').ilike('name', (b.product_name ?? '').trim()).limit(2)
      const curProd = cur && cur.length === 1 ? cur[0] : null
      if (!curProd) { results.push({ booking_id: id, ok: false, error: `cannot shorten — product "${b.product_name}" not found in course_prices` }); continue }
      // Gleiche Tauchgänge pro Tag wie das Original (Pack = 2/Tag → 1 Tag = Daily Double Dive, nie Single Dive; Test 4, 28.10.)
      const divesPerDay = (name: string, days: number) => { const m = /^(\d+)-Dive Pack/i.exec(name); if (m) return Math.max(1, Math.round(Number(m[1]) / Math.max(1, days))); if (/double/i.test(name)) return 2; return 1 }
      const curPerDay = divesPerDay(curProd.name, curProd.sessions_included ?? 1)
      const { data: cand } = await supabase.from('course_prices').select('id, name, price_cents, sessions_included').eq('category', curProd.category).eq('bookable_online', true).eq('sessions_included', moveCount).gt('price_cents', 0).order('price_cents')
      const newProd = (cand ?? []).find(c => divesPerDay(c.name, c.sessions_included ?? 1) === curPerDay && !/night/i.test(c.name)) as { id: string; name: string; price_cents: number } | undefined
      if (!newProd) { results.push({ booking_id: id, ok: false, error: `cannot shorten ${b.product_name} to ${moveCount} day${moveCount === 1 ? '' : 's'} — no matching product; pick ${live.length} days or adjust in the Sessions tab` }); continue }
      // Bisherige Positionen aus dem Spec (Extras, Versicherung, Last-Dive) übernehmen, Mengen auf die neue Tagezahl skalieren
      const { data: specRow } = b.request_spec_id ? await supabase.from('checkout_specs').select('spec').eq('id', b.request_spec_id).maybeSingle() : { data: null }
      const g0 = ((specRow?.spec as { guests?: Record<string, string>[] } | null)?.guests ?? [])[0] ?? {}
      let extrasOld: { equipment?: { product_id: string; quantity: number }[]; addons?: { product_id: string; quantity: number }[]; custom?: { label: string; amount_cents: number }[] } = {}
      try { extrasOld = g0.booking_extras_json ? JSON.parse(g0.booking_extras_json) : {} } catch { extrasOld = {} }
      const size = Math.max(1, b.group_size as number)
      const oldDays = new Set(live.map(x => x.session_date)).size || 1
      const newDays = new Set(target.map(x => x.date)).size || 1
      const scale = (q: number) => Math.max(1, Math.round(q * newDays / oldDays))
      const addons = [...(extrasOld.equipment ?? []), ...(extrasOld.addons ?? [])].map(a => ({ product_id: a.product_id, quantity: scale(a.quantity) }))
      const input: GuestInput = {
        product_id: newProd.id, sessions: target.map(x => ({ date: x.date, session: x.session as BookingSessionKey })), size,
        addons, custom_items: extrasOld.custom,
        insurance_choice: g0.insurance_choice === 'azd' || g0.insurance_choice === 'own' ? g0.insurance_choice : undefined,
        insurance_requested: g0.insurance_choice === 'azd',
        last_dive_dates: g0.last_dive_dates ? g0.last_dive_dates.split(',').map(x => x.trim() || null) : b.last_dive_date ? Array.from({ length: size }, () => b.last_dive_date as string) : undefined,
        skip_refresher: true,
      }
      const v = await validateGuest(supabase, input, { staffOverride: true })
      if (!v.ok) { results.push({ booking_id: id, ok: false, error: `cannot shorten — ${(v.body as { error?: string }).error ?? 'validation failed'}` }); continue }
      const meta = bookingMetadataFor(v.g, 100000)
      let extras: Record<string, unknown> | null = null
      try { extras = meta.booking_extras_json ? JSON.parse(meta.booking_extras_json) : null } catch { extras = null }
      shorten = { newProductId: newProd.id, newProductName: newProd.name, newAmount: v.g.totalCents, meta, lineItems: lineItemsFor(v.g), extras, insuranceProductId: v.g.insuranceProductId, insuranceAmount: v.g.insuranceTotalPerDiver > 0 ? v.g.insuranceTotalPerDiver * size : null }
    }

    const to = target.map(slotLabel).join(' · ')
    if (!shorten && target.every((t, i) => t.date === live[i].session_date && t.session === live[i].session)) { results.push({ booking_id: id, ok: true, moved_from: from }); continue }
    if (preview) {
      results.push({ booking_id: id, ok: !assignment.over, moved_from: from, moved_to: target.map(slotLabel).join(' · '), ...(assignment.over ? { error: `boat full on ${target.map(slotLabel).join(' · ')}` } : {}), ...(shorten ? { shortened: { from_product: b.product_name ?? '', to_product: shorten.newProductName, from_cents: (b.amount as number | null) ?? 0, to_cents: shorten.newAmount } } : {}) })
      continue
    }
    let failed: string | null = null
    for (let i = 0; i < moveCount; i++) {
      const { error: sErr } = await supabase.from('booking_sessions').update({ session_date: target[i].date, session: target[i].session, is_boat_day: target[i].session !== 'night' }).eq('id', live[i].id)
      if (sErr) { failed = sErr.message; break }
    }
    if (!failed && dropped.length > 0) {
      const { error: dErr } = await supabase.from('booking_sessions').delete().in('id', dropped.map(x => x.id))
      if (dErr) failed = dErr.message
    }
    if (failed) { results.push({ booking_id: id, ok: false, error: failed }); continue }
    const sorted = [...target].sort((a, c) => a.date.localeCompare(c.date))
    const upd: Record<string, unknown> = { booking_date: sorted[0].date, session: sorted[0].session, updated_at: new Date().toISOString() }
    if (shorten) {
      Object.assign(upd, { product_name: shorten.newProductName, amount: shorten.newAmount, sessions_expected: moveCount, booking_extras: shorten.extras, insurance_product_id: shorten.insuranceProductId, insurance_amount: shorten.insuranceAmount })
      {
        // Ohne Spec (z. B. geseedete Test-Anfragen) wird beim ersten Kürzen einer angelegt — sonst gäbe es kein „Restore original" (Test 4, 28.10.)
        const { data: sr } = b.request_spec_id ? await supabase.from('checkout_specs').select('spec').eq('id', b.request_spec_id).maybeSingle() : { data: null }
        const spec = (sr?.spec as Record<string, unknown> | null) ?? {}
        // shortened_from trägt alles, was „Restore original" braucht — nur beim ersten Kürzen setzen (sonst ginge das Original verloren)
        const shortenedFrom = (spec as { shortened_from?: unknown }).shortened_from ?? { product_name: b.product_name, amount: b.amount, sessions: live.map(x => `${x.session_date}:${x.session}`), guests: (spec as { guests?: unknown }).guests, line_items: (spec as { line_items?: unknown }).line_items, booking_extras: b.booking_extras, insurance_product_id: b.insurance_product_id, insurance_amount: b.insurance_amount }
        const newSpec = { ...spec, guests: [shorten.meta], line_items: shorten.lineItems, shortened_from: shortenedFrom }
        if (b.request_spec_id) await supabase.from('checkout_specs').update({ spec: newSpec }).eq('id', b.request_spec_id)
        else {
          const { data: ins } = await supabase.from('checkout_specs').insert({ spec: newSpec }).select('id').single()
          if (ins?.id) upd.request_spec_id = ins.id
        }
      }
    }
    await supabase.from('bookings').update(upd).eq('id', id)
    const desc = shorten
      ? `✂️ Request shortened & consolidated by ${actor}: ${b.product_name} (${from}, €${(((b.amount as number | null) ?? 0) / 100).toFixed(2)}) → ${shorten.newProductName} (${to}, €${(shorten.newAmount / 100).toFixed(2)}) — guest will see old vs. new in the approval email`
      : `📅 Request consolidated by ${actor}: ${from} → ${to} (guest will see the new dates in the approval email)`
    await supabase.from('booking_changelog').insert({ booking_id: id, action: shorten ? 'request_shortened' : 'session_updated', description: desc, changed_by_email: actor })
    results.push({ booking_id: id, ok: true, moved_from: from, ...(shorten ? { shortened: { from_product: b.product_name ?? '', to_product: shorten.newProductName, from_cents: (b.amount as number | null) ?? 0, to_cents: shorten.newAmount }, note: `shortened to ${shorten.newProductName}, €${(shorten.newAmount / 100).toFixed(2)}` } : {}) })
  }
  const moved = results.filter(r => r.ok).length
  if (!preview) await auditStaff(supabase, auth.user, 'requests_consolidated', 'booking', null, `Requests consolidated to ${slots.map(slotLabel).join(' · ')}: ${moved} of ${ids.length}${results.some(r => r.shortened) ? ' (some shortened)' : ''}`, { slots, results })
  return NextResponse.json({ ok: true, results, moved })
}
