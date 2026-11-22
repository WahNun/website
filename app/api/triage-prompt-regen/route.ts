import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function verifyAdmin(supabase: ReturnType<typeof getServiceClient>, bearerToken: string) {
  const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
  if (error || !user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return null
  return { user, profile }
}

// ── POST /api/triage-prompt-regen ─────────────────────────────────────────────
// action: 'activate' + promptId — set prompt as active
// Prompt generation is done via Claude in the Cowork desktop app (reads
// email_triage_log via Supabase MCP, writes new draft to triage_config).
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const admin = await verifyAdmin(supabase, authHeader.slice(7))
  if (!admin) return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  let action = 'activate'
  let promptId: string | undefined
  try {
    const body = await req.json() as { action?: string; promptId?: string }
    action = body.action ?? 'activate'
    promptId = body.promptId
  } catch {
    // No body
  }

  if (action === 'activate') {
    if (!promptId) return NextResponse.json({ error: 'promptId required' }, { status: 400 })
    await supabase.from('triage_config').update({ is_active: false }).eq('is_active', true)
    const { error } = await supabase.from('triage_config').update({ is_active: true }).eq('id', promptId)
    if (error) return NextResponse.json({ error: 'Failed to activate prompt' }, { status: 500 })
    return NextResponse.json({ success: true, activated: promptId })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
