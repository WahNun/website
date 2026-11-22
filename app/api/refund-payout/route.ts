import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { decryptPayout } from '@/lib/payoutCrypto'
import { auditStaff } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/refund-payout  { refund_id }  — Reveal der Auszahlungsdaten (nur Admin, nur für offene Anträge).
 * Jeder Aufruf steht im Audit-Log. Nach der Auszahlung gibt es nichts mehr zu entschlüsseln (Daten gelöscht, nur maskiert).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, ['admin'])
  if (auth instanceof NextResponse) return auth
  let body: { refund_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.refund_id) return NextResponse.json({ ok: false, error: 'refund_id required' }, { status: 400 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: r } = await db.from('booking_refunds').select('id, booking_id, status, payout_details').eq('id', body.refund_id).maybeSingle()
  if (!r) return NextResponse.json({ ok: false, error: 'Refund request not found' }, { status: 404 })
  if (r.status !== 'requested') return NextResponse.json({ ok: false, error: `Refund is already ${r.status} — payout details were deleted after payout` }, { status: 409 })
  if (!r.payout_details) return NextResponse.json({ ok: false, error: 'No payout details on this request' }, { status: 404 })

  let details: string
  try { details = decryptPayout(r.payout_details) }
  catch (e) { return NextResponse.json({ ok: false, error: `Could not decrypt: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 }) }

  await auditStaff(db, auth.user, 'refund_payout_revealed', 'booking', r.booking_id, 'Refund payout details revealed', { refund_id: r.id })
  return NextResponse.json({ ok: true, details })
}
