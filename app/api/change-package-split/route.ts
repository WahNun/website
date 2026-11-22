import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { refundLedger } from '@/lib/refunds'
import { recomputePaymentState } from '@/lib/paymentState'
import { computeInsuranceBlocks } from '@/lib/insurance'
import { isProgramProduct } from '@/lib/productType'
import { auditStaff, auditEur } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/change-package-split  (staff only)
 * Paketwechsel nur für AUSGEWÄHLTE Personen einer Gruppenbuchung (Lucas 30.10.).
 * Die gewählten Personen werden in eine neue, verknüpfte Kindbuchung (parent_booking_id) ausgegliedert:
 *   - neue Buchung mit neuem Paket, eigenen Tauchtagen, Preis und Versicherung (Preise immer aus course_prices)
 *   - Rest der Gruppe bleibt in der Ursprungsbuchung, Betrag/Seats/Versicherung werden verkleinert
 *   - bereits bezahltes Geld, das die Ursprungsbuchung nach der Verkleinerung zu viel hält, wandert per
 *     booking_payments-Umbuchung (method "transfer", Minus-Zeile hier, Plus-Zeile dort) mit
 * Alles-oder-nichts: schlägt ein Schritt fehl, werden die bisherigen Schritte zurückgenommen.
 * Gilt nur für Teilmengen — „alle Personen" bleibt der bestehende Weg im Front Office.
 * Equipment / Add-ons / Custom-Positionen bleiben in der Ursprungsbuchung.
 * Rechnung (KeyInvoice) wird NICHT automatisch angepasst — Hinweis in der Antwort.
 */
type Body = { booking_id?: string; booking_customer_ids?: string[]; new_product_id?: string; sessions?: { date: string; session: string }[]; dry_run?: boolean }
type Ins = { product_id?: string; name?: string; per_diver_cents: number; guests: number; total_cents: number }
type Extras = { insurance?: Ins; equipment?: { total_cents: number }[]; addons?: { total_cents: number }[]; custom?: { amount_cents: number }[] } | null
const COURSE_CATS = ['entry', 'specialty', 'ecology', 'pro']

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  let body: Body
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status })

  const { booking_id, new_product_id } = body
  const ids = [...new Set((body.booking_customer_ids ?? []).filter(x => typeof x === 'string'))]
  const sessions = (body.sessions ?? []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && ['am', 'pm', 'night'].includes(x.session))
  if (!booking_id || !new_product_id || ids.length === 0) return fail(400, 'booking_id, booking_customer_ids and new_product_id are required')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: b } = await db.from('bookings').select('*').eq('id', booking_id).maybeSingle()
  if (!b) return fail(404, 'Booking not found')
  if (b.status === 'cancelled') return fail(409, 'Booking is cancelled')
  const N = Math.max(1, b.group_size ?? 1)
  const k = ids.length
  if (k >= N) return fail(400, 'All people selected — use the normal "Change package" for the whole booking')

  const { data: custs } = await db.from('booking_customers').select('id, slot_index, insurance_source, guest_name, customer:customers!booking_customers_customer_id_fkey(first_name, last_name, name)').eq('booking_id', booking_id).order('slot_index')
  const mine = (custs ?? []).filter(c => ids.includes(c.id))
  if (mine.length !== k) return fail(400, 'Some selected people do not belong to this booking')
  if ((custs ?? []).length !== N) return fail(409, `Booking says ${N} guests but has ${(custs ?? []).length} diver records — fix the diver list first`)

  const { data: np } = await db.from('course_prices').select('id, name, category, price_cents, sessions_included, duration_days_min').eq('id', new_product_id).maybeSingle()
  if (!np || !np.price_cents) return fail(404, 'New package not found or has no price')
  const required = COURSE_CATS.includes(np.category ?? '') ? (isProgramProduct(np.id) ? 1 : (np.duration_days_min ?? 1)) : (np.sessions_included ?? 1)
  if (sessions.length !== required) return fail(400, `New package needs ${required} dive day(s), got ${sessions.length}`)
  sessions.sort((x, y) => x.date.localeCompare(y.date))

  // ── Beträge ──────────────────────────────────────────────────────────────────
  const ex = (b.booking_extras ?? null) as Extras
  const extrasTotal = (ex?.insurance?.total_cents ?? 0) + (ex?.equipment ?? []).reduce((a, i) => a + i.total_cents, 0) + (ex?.addons ?? []).reduce((a, i) => a + i.total_cents, 0) + (ex?.custom ?? []).reduce((a, i) => a + i.amount_cents, 0)
  const oldPkgPer = Math.round(Math.max(0, (b.amount ?? 0) - extrasTotal) / N)
  const insOld = ex?.insurance && ex.insurance.total_cents > 0 ? ex.insurance : null
  const movedIns = insOld ? Math.min(insOld.guests, mine.filter(c => c.insurance_source === 'azd_day').length || (mine.every(c => c.insurance_source == null) ? Math.round(insOld.guests * k / N) : 0)) : 0
  let newPerDiver = 0
  if (movedIns > 0) {
    const blocks = computeInsuranceBlocks([...new Set(sessions.map(x => x.date))])
    const { data: plans } = await db.from('course_prices').select('id, price_cents').eq('category', 'insurance')
    const priceFor = (planId: string) => (plans ?? []).find(p => p.id === planId)?.price_cents ?? 0
    newPerDiver = blocks.reduce((a, bl) => a + priceFor(bl.planId) * bl.units, 0)
    if (newPerDiver <= 0) return fail(500, 'Insurance price missing in course_prices for the new dive days')
  }
  const bInsGuests = insOld ? insOld.guests - movedIns : 0
  const bExtrasNew: Extras = ex ? { ...ex, ...(insOld ? { insurance: bInsGuests > 0 ? { ...insOld, guests: bInsGuests, total_cents: insOld.per_diver_cents * bInsGuests } : undefined } : {}) } : null
  if (bExtrasNew && insOld && bInsGuests <= 0) delete bExtrasNew.insurance
  const movedOldShare = k * oldPkgPer + (insOld ? movedIns * insOld.per_diver_cents : 0)
  const bNewAmount = Math.max(0, (b.amount ?? 0) - movedOldShare)
  const b2Amount = np.price_cents * k + movedIns * newPerDiver
  const b2Extras: Extras = movedIns > 0 && insOld ? { insurance: { ...insOld, per_diver_cents: newPerDiver, guests: movedIns, total_cents: newPerDiver * movedIns } } : null

  const led = await refundLedger(db, booking_id)
  const transfer = Math.max(0, Math.min(led.availableCents - bNewAmount, movedOldShare, b2Amount))
  // Vorschau für das Front Office: gleiche Rechnung, aber nichts schreiben
  if (body.dry_run) {
    return NextResponse.json({ ok: true, dry_run: true, old_amount_cents: b.amount ?? 0, original_amount_cents: bNewAmount, new_booking_amount_cents: b2Amount,
      moved_old_share_cents: movedOldShare, transfer_cents: transfer, open_cents: Math.max(0, b2Amount - transfer), paid_available_cents: led.availableCents })
  }

  // ── Ausführen mit Rücknahme ─────────────────────────────────────────────────
  const undo: (() => Promise<unknown>)[] = []
  const rollback = async () => { for (const fn of undo.reverse()) { try { await fn() } catch (e) { console.error('[change-package-split] rollback step failed', e) } } }
  const now = new Date().toISOString()
  const root = b.parent_booking_id ?? b.id
  const step = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) throw new Error(`${label}: ${error.message}`)
  }

  let b2Id: string | null = null
  try {
    const { data: ins, error: insErr } = await db.from('bookings').insert({
      source: b.source, origin: b.origin ?? 'front_office', product_name: np.name, booking_date: sessions[0]?.date ?? b.booking_date, session: null,
      group_size: k, status: b.status, amount: b2Amount, currency: b.currency ?? 'eur',
      customer_name: b.customer_name, customer_email: b.customer_email, is_test: b.is_test,
      parent_booking_id: root, sessions_expected: required, booking_extras: b2Extras, insurance_choice: b.insurance_choice ?? null,
      payment_method: b.payment_method ?? null,
    }).select('id').single()
    if (insErr || !ins) throw new Error(`create new booking: ${insErr?.message ?? 'no row'}`)
    b2Id = ins.id as string
    undo.push(async () => { await db.from('booking_payments').delete().eq('booking_id', b2Id!); await db.from('booking_sessions').delete().eq('booking_id', b2Id!); await db.from('bookings').delete().eq('id', b2Id!) })

    // Personen umziehen (slot_index in der neuen Buchung 0..k-1; invite_token bleibt → alte Einladungslinks gelten weiter)
    const moved: { id: string; slot: number }[] = []
    undo.push(async () => { for (const m of moved) await db.from('booking_customers').update({ booking_id, slot_index: m.slot }).eq('id', m.id) })
    for (let i = 0; i < mine.length; i++) {
      await step(`move diver ${i + 1}`, db.from('booking_customers').update({ booking_id: b2Id, slot_index: i, updated_at: now }).eq('id', mine[i].id))
      moved.push({ id: mine[i].id, slot: mine[i].slot_index })
    }

    // Sessions: neue Tage für die neue Buchung, Ursprungs-Tage um k Plätze verkleinern
    await step('new sessions', db.from('booking_sessions').insert(sessions.map(x => ({ booking_id: b2Id, session_date: x.date, session: x.session, seats: k, status: 'booked', is_test: b.is_test, is_boat_day: true }))))
    const { data: oldSess } = await db.from('booking_sessions').select('id, seats').eq('booking_id', booking_id).eq('status', 'booked')
    const changedSess: { id: string; seats: number }[] = []
    undo.push(async () => { for (const c of changedSess) await db.from('booking_sessions').update({ seats: c.seats }).eq('id', c.id) })
    for (const sx of oldSess ?? []) {
      await step('shrink old sessions', db.from('booking_sessions').update({ seats: Math.max(1, (sx.seats ?? N) - k) }).eq('id', sx.id))
      changedSess.push({ id: sx.id, seats: sx.seats ?? N })
    }

    // Ursprungsbuchung verkleinern
    await step('update original booking', db.from('bookings').update({ group_size: N - k, amount: bNewAmount, booking_extras: bExtrasNew, updated_at: now }).eq('id', booking_id))
    undo.push(async () => { await db.from('bookings').update({ group_size: N, amount: b.amount, booking_extras: b.booking_extras, updated_at: now }).eq('id', booking_id) })

    // Geld umbuchen
    if (transfer > 0) {
      await step('transfer out', db.from('booking_payments').insert({ booking_id, amount: -transfer, currency: b.currency ?? 'eur', status: 'paid', method: 'transfer', paid_at: now, recorded_by: auth.user.id, notes: `Moved to linked booking ${b2Id!.slice(0, 8)} (package change for ${k} guest${k === 1 ? '' : 's'})` }))
      undo.push(async () => { await db.from('booking_payments').delete().eq('booking_id', booking_id).eq('method', 'transfer').eq('amount', -transfer).eq('paid_at', now) })
      await step('transfer in', db.from('booking_payments').insert({ booking_id: b2Id, amount: transfer, currency: b.currency ?? 'eur', status: 'paid', method: 'transfer', paid_at: now, recorded_by: auth.user.id, notes: `Moved from booking ${booking_id.slice(0, 8)} (package change)` }))
    }
  } catch (e) {
    await rollback()
    return fail(500, `Not changed — everything was rolled back. ${e instanceof Error ? e.message : String(e)}`)
  }

  const stateB = await recomputePaymentState(db, booking_id)
  const stateB2 = await recomputePaymentState(db, b2Id!)
  const diffTxt = `${b2Amount - movedOldShare >= 0 ? '+' : '-'}${auditEur(Math.abs(b2Amount - movedOldShare))}`
  // Namen der betroffenen Gäste ins Log (statt nur „1 of 3 guests")
  type CustJoin = { first_name: string | null; last_name: string | null; name: string | null }
  const guestNames = mine.map((c, i) => {
    const cu = (Array.isArray(c.customer) ? c.customer[0] : c.customer) as CustJoin | null | undefined
    const n = (c.guest_name as string | null)?.trim() || [cu?.first_name, cu?.last_name].filter(Boolean).join(' ').trim() || cu?.name?.trim() || ''
    return n || `Guest ${(c.slot_index ?? i) + 1}`
  })
  const names = `${guestNames.join(', ')} (${k} of ${N} guests)`
  await db.from('booking_changelog').insert([
    { booking_id, action: 'package_split', changed_by_email: auth.user.email ?? null, description: `📦 Package changed for ${names}: moved to linked booking ${b2Id!.slice(0, 8)} (${np.name}). This booking now ${N - k} guest(s), ${auditEur(bNewAmount)} (was ${auditEur(b.amount)})${transfer > 0 ? `; ${auditEur(transfer)} of the payment moved over` : ''}` },
    { booking_id: b2Id, action: 'booking_created', changed_by_email: auth.user.email ?? null, description: `📦 Created from booking ${booking_id.slice(0, 8)} by package change: ${b.product_name ?? '?'} → ${np.name} × ${k} — ${auditEur(b2Amount)} (${diffTxt} vs. old share), ${auditEur(transfer)} moved over, ${required} dive day(s)` },
  ])
  const audit_warning = await auditStaff(db, auth.user, 'package_split', 'booking', booking_id,
    `Package change for ${names}: ${b.product_name ?? '?'} → ${np.name}; new linked booking ${b2Id}`,
    { new_booking_id: b2Id, moved_customers: ids, original_amount_cents: b.amount, new_original_amount_cents: bNewAmount, new_booking_amount_cents: b2Amount, transfer_cents: transfer })

  return NextResponse.json({
    ok: true, new_booking_id: b2Id, original_amount_cents: bNewAmount, new_booking_amount_cents: b2Amount, transfer_cents: transfer,
    open_cents: Math.max(0, b2Amount - transfer), original_state: stateB, new_state: stateB2,
    warnings: [
      'The invoice already issued is not adjusted automatically — tell the accountant if the amounts changed.',
      ...(extrasTotal - (insOld?.total_cents ?? 0) > 0 ? ['Equipment / add-ons stayed with the original booking.'] : []),
      ...(audit_warning ? [`Audit log: ${audit_warning}`] : []),
    ],
  })
}
