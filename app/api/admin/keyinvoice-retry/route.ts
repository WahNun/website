/**
 * Admin-Route: Keyinvoice-Rechnungen nachholen / Fehler diagnostizieren
 *
 * Sicherung: Authorization: Bearer $CRON_SECRET  (selbe Env-Variable wie Cron-Routes)
 *
 * GET  ?check=1       Verbindungstest + VAT-Modus (ohne Rechnung zu erstellen)
 * GET                 Alle offenen / fehlgeschlagenen Einträge auflisten
 * POST ?id=<uuid>     Einen bestimmten Eintrag neu versuchen
 * POST               Alle fehlgeschlagenen Einträge neu versuchen (max 10 auf einmal)
 *
 * Curl-Beispiel:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://azoresdiving.com/api/admin/keyinvoice-retry?check=1
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSid, pricesIncludeVAT } from '@/lib/keyinvoice'
import { retryKeyinvoiceDocument, RETRY_SELECT, type RetryResult } from '@/lib/keyinvoiceRetry'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─── Auth ─────────────────────────────────────────────────────────────────────

function checkAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ─── GET: Verbindungstest oder Fehlerliste ────────────────────────────────────

export async function GET(req: NextRequest) {
  const authErr = checkAuth(req)
  if (authErr) return authErr

  const { searchParams } = new URL(req.url)

  // ?check=1 → Verbindungstest + VAT-Modus
  if (searchParams.get('check') === '1') {
    try {
      const sid       = await getSid()
      const withVAT   = await pricesIncludeVAT()
      return NextResponse.json({
        ok:           true,
        sid_prefix:   sid.slice(0, 8) + '…',   // nicht den ganzen SID loggen
        prices_mode:  withVAT ? 'brutto (inkl. 16% MwSt)' : 'netto (ohne MwSt)',
        prices_with_vat: withVAT,
        note: withVAT
          ? 'Stripe-Beträge (brutto) werden direkt übergeben ✓'
          : 'Stripe-Beträge werden durch 1.16 geteilt bevor sie an Keyinvoice gehen',
      })
    } catch (err) {
      return NextResponse.json({
        ok:    false,
        error: err instanceof Error ? err.message : String(err),
      }, { status: 500 })
    }
  }

  // Ohne ?check: offene / fehlgeschlagene Einträge auflisten
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('keyinvoice_documents')
    .select('id, stripe_session_id, booking_id, full_doc_number, at_status, pdf_sent_at, error, is_test, created_at, updated_at')
    .is('full_doc_number', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const failed  = (data ?? []).filter(r => r.error)
  const pending = (data ?? []).filter(r => !r.error)

  return NextResponse.json({
    total_open:   (data ?? []).length,
    failed:       failed.length,
    pending:      pending.length,
    rows:         data,
    hint:         failed.length > 0
      ? 'POST /api/admin/keyinvoice-retry zum Nachholen aller Fehler'
      : 'Keine fehlgeschlagenen Einträge',
  })
}

// ─── POST: Einzeln oder alle nachholen ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const authErr = checkAuth(req)
  if (authErr) return authErr

  const { searchParams } = new URL(req.url)
  const specificId = searchParams.get('id')

  const supabase = getSupabase()

  // Einträge ermitteln
  let query = supabase
    .from('keyinvoice_documents')
    .select(RETRY_SELECT)
    .is('full_doc_number', null)

  if (specificId) {
    query = query.eq('id', specificId)
  } else {
    // Nur fehlgeschlagene (haben error), nicht einfach noch-nicht-verarbeitete
    query = query.not('error', 'is', null).limit(10)
  }

  const { data: rows, error: listErr } = await query
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ message: 'Nichts zu verarbeiten' })

  const results: RetryResult[] = []

  for (const row of rows) {
    results.push(await retryKeyinvoiceDocument(supabase, row))
  }

  const succeeded = results.filter(r => r.success).length
  const failed    = results.filter(r => !r.success).length

  return NextResponse.json({ processed: results.length, succeeded, failed, results })
}
