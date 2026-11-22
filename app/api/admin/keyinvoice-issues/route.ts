import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auditStaff } from '@/lib/auditServer'
import { retryKeyinvoiceDocument, RETRY_SELECT } from '@/lib/keyinvoiceRetry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET  /api/admin/keyinvoice-issues        (nur Admin) → fehlgeschlagene Belege (Rechnung / Gutschrift / Annullierung)
 * POST /api/admin/keyinvoice-issues {id}   (nur Admin) → diesen Beleg erneut versuchen
 * Angezeigt im Finances-Tab, damit eine fehlende Rechnung nicht unbemerkt bleibt.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type AdminCtx = { err: NextResponse; db?: undefined; user?: undefined } | { err?: undefined; db: any; user: { id: string; email?: string | null } }
async function admin(req: NextRequest): Promise<AdminCtx> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return { err: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: { user }, error } = await db.auth.getUser(authHeader.slice(7))
  if (error || !user) return { err: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { err: NextResponse.json({ ok: false, error: 'Forbidden — admin only' }, { status: 403 }) }
  return { db, user }
}

export async function GET(req: NextRequest) {
  const a = await admin(req)
  if (a.err) return a.err
  const db = a.db!
  const { data, error } = await db.from('keyinvoice_documents')
    .select('id, kind, booking_id, stripe_session_id, amount_cents, error, created_at, updated_at')
    .is('full_doc_number', null).not('error', 'is', null).eq('is_test', false)
    .order('updated_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ ok: false, error: `Could not load invoice issues: ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true, rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  const a = await admin(req)
  if (a.err) return a.err
  const db = a.db!
  const user = a.user!
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const { data: row } = await db.from('keyinvoice_documents').select(RETRY_SELECT).eq('id', body.id).is('full_doc_number', null).maybeSingle()
  if (!row) return NextResponse.json({ ok: false, error: 'Document not found or already issued' }, { status: 404 })
  const r = await retryKeyinvoiceDocument(db, row as any)
  await auditStaff(db, user, r.success ? 'invoice_retry_ok' : 'invoice_retry_failed', 'booking', (row as { booking_id: string | null }).booking_id,
    r.success ? `KeyInvoice retry succeeded: ${r.full_doc_number ?? ''}` : `KeyInvoice retry FAILED: ${r.error}`, { doc_row: body.id, doc: r.full_doc_number ?? null, error: r.error ?? null })
  return NextResponse.json({ ok: r.success, doc: r.full_doc_number ?? null, error: r.error ?? null }, { status: r.success ? 200 : 502 })
}
