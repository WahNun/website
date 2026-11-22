import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staffAuth'
import { createClient } from '@supabase/supabase-js'
import { notifyPaymentRegistered } from '@/lib/booking'
import { auditStaff, auditEur } from '@/lib/auditServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/payment-registered  (staff only)
 * Body: { booking_id, amount_cents, method_label? }
 *
 * Wird vom Front Office nach jeder manuell erfassten Zahlung (Cash, Bank, Revolut, MB Way,
 * „Mark as fully paid") aufgerufen. Wendet die Deposit-Regel an und schickt dem Gast
 * entweder die Buchungsbestätigung (pending → confirmed) oder „Payment received".
 * Antwort enthält immer Status + welche Mail + ggf. Fehlertext — damit das FO ihn anzeigen kann.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  const user = auth.user

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // request_follows: fuer den offenen Rest geht gleich eine eigene Mail mit Zahlungsdaten raus (Transfer / Revolut)
  let body: { booking_id?: string; amount_cents?: number; method_label?: string; request_follows?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.booking_id || !body.amount_cents || body.amount_cents <= 0) {
    return NextResponse.json({ ok: false, error: 'booking_id and amount_cents (> 0) required' }, { status: 400 })
  }

  const r = await notifyPaymentRegistered(supabase, body.booking_id, body.amount_cents, body.method_label ?? 'manual', undefined, { requestFollows: body.request_follows === true })
  await auditStaff(supabase, user, 'payment_registered', 'booking', body.booking_id,
    `Payment registered manually: ${auditEur(body.amount_cents)} via ${body.method_label ?? 'manual'}${r.error ? ` — ERROR: ${r.error}` : ''}`,
    { amount_cents: body.amount_cents, method: body.method_label ?? 'manual', result: JSON.parse(JSON.stringify(r)) })
  return NextResponse.json({ ok: !r.error, ...r })
}
