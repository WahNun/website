import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { auditStaff } from '@/lib/auditServer'
import { getBookingMode, loadBookingWindows } from '@/lib/bookingMode'
import type { WindowMode } from '@/lib/bookingWindows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/booking-windows            — public: Default-Modus + aktive Fenster (ohne interne Begründung). /book löst damit auf.
 * GET /api/booking-windows?all=1      — Staff: alle Fenster inkl. reason/active/created_by.
 * POST   { id?, from_date, to_date, mode, session?, product_id?, reason?, guest_text?, active? }  — Admin: anlegen / ändern
 * DELETE { id }                                                                                   — Admin: löschen
 */
export async function GET(req: NextRequest) {
  const supabase = getServiceClient()
  const all = req.nextUrl.searchParams.get('all') === '1'
  if (all) {
    const auth = await requireStaff(req)
    if (auth instanceof NextResponse) return auth
    const { data, error } = await supabase.from('booking_windows').select('*').order('from_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ default_mode: await getBookingMode(supabase), windows: data ?? [] })
  }
  const windows = await loadBookingWindows(supabase)
  return NextResponse.json({ default_mode: await getBookingMode(supabase), windows })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, ['admin'])
  if (auth instanceof NextResponse) return auth
  let body: { id?: string; from_date?: string; to_date?: string; mode?: string; session?: string | null; product_id?: string | null; reason?: string | null; guest_text?: string | null; active?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const mode = body.mode as WindowMode
  if (!['open', 'request', 'blocked'].includes(mode)) return NextResponse.json({ error: 'mode must be open, request or blocked' }, { status: 400 })
  if (!body.from_date || !body.to_date || !DATE_RE.test(body.from_date) || !DATE_RE.test(body.to_date)) return NextResponse.json({ error: 'from_date and to_date (YYYY-MM-DD) required' }, { status: 400 })
  if (body.to_date < body.from_date) return NextResponse.json({ error: 'to_date must not be before from_date' }, { status: 400 })
  const session = body.session && ['am', 'pm', 'night'].includes(body.session) ? body.session : null
  const supabase = getServiceClient()
  let productId: string | null = null
  if (body.product_id) {
    const { data: p } = await supabase.from('course_prices').select('id').eq('id', body.product_id).maybeSingle()
    if (!p) return NextResponse.json({ error: `Unknown product_id ${body.product_id}` }, { status: 400 })
    productId = p.id as string
  }
  const row = {
    from_date: body.from_date, to_date: body.to_date, mode, session, product_id: productId,
    reason: (body.reason ?? '').trim() || null, guest_text: (body.guest_text ?? '').trim() || null,
    active: body.active !== false, updated_at: new Date().toISOString(),
  }
  const actor = auth.user.email ?? auth.user.id
  if (body.id) {
    const { data: prev } = await supabase.from('booking_windows').select('*').eq('id', body.id).maybeSingle()
    if (!prev) return NextResponse.json({ error: 'Window not found' }, { status: 404 })
    const { data, error } = await supabase.from('booking_windows').update(row).eq('id', body.id).select('*').single()
    if (error) return NextResponse.json({ error: `Could not save window: ${error.message}` }, { status: 500 })
    await auditStaff(supabase, auth.user, 'booking_window_updated', 'booking_window', body.id, `Booking window updated: ${row.from_date}–${row.to_date} ${row.mode}${row.session ? ` ${row.session}` : ''}${productId ? ` ${productId}` : ''}${row.active ? '' : ' (inactive)'}`, row, prev)
    return NextResponse.json({ ok: true, window: data })
  }
  const { data, error } = await supabase.from('booking_windows').insert({ ...row, created_by_email: actor }).select('*').single()
  if (error) return NextResponse.json({ error: `Could not create window: ${error.message}` }, { status: 500 })
  await auditStaff(supabase, auth.user, 'booking_window_created', 'booking_window', data.id, `Booking window created: ${row.from_date}–${row.to_date} ${row.mode}${row.session ? ` ${row.session}` : ''}${productId ? ` ${productId}` : ''}`, row)
  return NextResponse.json({ ok: true, window: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff(req, ['admin'])
  if (auth instanceof NextResponse) return auth
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = getServiceClient()
  const { data: prev } = await supabase.from('booking_windows').select('*').eq('id', body.id).maybeSingle()
  if (!prev) return NextResponse.json({ error: 'Window not found' }, { status: 404 })
  const { error } = await supabase.from('booking_windows').delete().eq('id', body.id)
  if (error) return NextResponse.json({ error: `Could not delete window: ${error.message}` }, { status: 500 })
  await auditStaff(supabase, auth.user, 'booking_window_deleted', 'booking_window', body.id, `Booking window deleted: ${prev.from_date}–${prev.to_date} ${prev.mode}`, {}, prev)
  return NextResponse.json({ ok: true })
}
