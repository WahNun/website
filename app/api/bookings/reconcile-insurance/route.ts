import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staffAuth'
import { reconcileInsuranceForDates } from '@/lib/dayCover'
import { auditStaff } from '@/lib/auditServer'

/** POST { booking_id } — Versicherung an die aktuellen Tauchtage anpassen (Sessions-Tab nach Add/Datumsänderung, DAN-Export „Fix“). */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  let body: { booking_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.booking_id) return NextResponse.json({ ok: false, error: 'booking_id required' }, { status: 400 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  try {
    const r = await reconcileInsuranceForDates(db, body.booking_id, auth.user.email ?? null)
    await auditStaff(db, auth.user, 'insurance_reconciled', 'booking', body.booking_id, `Insurance reconciled after date change: ${JSON.stringify(r ?? { no_insurance: true })}`, { result: r ?? { no_insurance: true } })
    return NextResponse.json({ ok: true, ...(r ?? { diffCents: 0, perDiverCents: 0, days: 0, no_insurance: true }) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
