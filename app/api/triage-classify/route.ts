import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServiceClient, getActiveSystemPrompt, classify } from '@/lib/triage'
import { getAccessToken, ensureLabel, addLabel } from '@/lib/gmail'
import { recordHeartbeat } from '@/lib/heartbeat'

const CATEGORY_LABELS: Record<string, string> = {
  ticket: 'AZD/Ticket',
  internal: 'AZD/Internal',
  ignore: 'AZD/Ignored',
  review: 'AZD/Review',
}

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''

  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    // pg_cron path — no further checks needed
  } else if (authHeader.startsWith('Bearer ')) {
    // Admin session path
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser(authHeader.slice(7))
    if (authErr || !user) {
      await recordHeartbeat('triage-classify', false, 'unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const serviceClient = getServiceClient()
    const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin') {
      await recordHeartbeat('triage-classify', false, 'forbidden — admin only')
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }
  } else {
    await recordHeartbeat('triage-classify', false, 'unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const systemPrompt = await getActiveSystemPrompt(supabase)

  // Acquire Gmail token once for labeling — failures don't abort classification
  let gmailToken: string | null = null
  try {
    gmailToken = await getAccessToken()
  } catch (err) {
    console.error('[triage-classify] Gmail token error:', err instanceof Error ? err.message : err)
  }

  const { data: rows, error: selectErr } = await supabase
    .from('email_triage_log')
    .select('id, subject, body_preview, gmail_message_id')
    .eq('final_result', 'pending')
    .order('processed_at', { ascending: true })
    .limit(20)

  if (selectErr) {
    // Still 200 — Cloudflare replaces 5xx bodies with "error code: 502"
    await recordHeartbeat('triage-classify', false, `DB select error: ${selectErr.message}`)
    return NextResponse.json({ ok: false, classified: 0, failed: 0, labelled: 0, label_errors: 0, remaining: 0, error: selectErr.message })
  }

  const batch = rows ?? []
  let classified = 0
  let failed = 0
  let labelled = 0
  let label_errors = 0

  for (const row of batch) {
    try {
      const result = await classify(row.subject ?? '', row.body_preview ?? '', systemPrompt)
      await supabase
        .from('email_triage_log')
        .update({ mistral_result: result, final_result: result })
        .eq('id', row.id)
      classified++

      const labelName = CATEGORY_LABELS[result]
      if (gmailToken && labelName && row.gmail_message_id) {
        try {
          const labelId = await ensureLabel(gmailToken, labelName)
          await addLabel(gmailToken, row.gmail_message_id, labelId)
          labelled++
        } catch (labelErr) {
          console.error(`[triage-classify] label error id=${row.id}:`, labelErr instanceof Error ? labelErr.message : labelErr)
          label_errors++
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[triage-classify] failed id=${row.id}:`, msg)
      failed++
    }
  }

  const { count: remaining } = await supabase
    .from('email_triage_log')
    .select('id', { count: 'exact', head: true })
    .eq('final_result', 'pending')

  await recordHeartbeat('triage-classify', true, `classified ${classified}, failed ${failed}, remaining ${remaining ?? 0}`)
  return NextResponse.json({ ok: true, classified, failed, labelled, label_errors, remaining: remaining ?? 0 })
}
