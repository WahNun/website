import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSetting } from '@/lib/site-settings'

// Workshop-Feedback (26.10.2026): Tester ohne Login schreiben ihr Feedback hierher.
// Zugriff nur mit gültigem Mitarbeiter-Login (Bearer-Token) UND solange site_settings.workshop_feedback_open = 'true'.
// Nach dem Workshop: Setting auf 'false' setzen oder diese Route + public/workshop.html entfernen.
const hits = new Map<string, number[]>()
function limited(ip: string) {
  const now = Date.now()
  const t = (hits.get(ip) ?? []).filter(x => now - x < 60_000)
  if (t.length >= 120) { hits.set(ip, t); return true }
  t.push(now); hits.set(ip, t); return false
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

async function guard(req: NextRequest): Promise<NextResponse | { userId: string }> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!token) return NextResponse.json({ error: 'Not logged in. Open this page from the Testing tab in the members area.' }, { status: 401 })
  const { data: { user }, error } = await db().auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Login expired. Reload the members page and log in again.' }, { status: 401 })
  if (limited(user.id)) return NextResponse.json({ error: 'Too many requests, wait a moment.' }, { status: 429 })
  if ((await getSetting('workshop_feedback_open', 'false')) !== 'true') return NextResponse.json({ error: 'Workshop feedback is closed.' }, { status: 403 })
  return { userId: user.id }
}

const TAGS = ['Unclear text', 'Too many steps', 'Slow', 'Confusing button or label', 'Cut off or overlapping', 'Hard on a phone', 'Unhelpful error', 'Missing option', 'Other']
const CASE_RE = /^([A-Z]{1,2}\d{1,2}|FREE\d{0,2})$/
const TESTER_RE = /^(t[1-6])?$/

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind')
  const g = await guard(req)
  if (g instanceof NextResponse) return g
  const supabase = db()
  if (kind === 'feedback') {
    const { data, error } = await supabase.from('workshop_feedback').select('case_id,uid,name,tester,status,tags,text,at').limit(2000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: (data ?? []).map(r => ({ caseId: r.case_id, uid: r.uid, name: r.name, tester: r.tester, status: r.status, tags: r.tags, text: r.text, at: Number(r.at) })) })
  }
  if (kind === 'testers') {
    const { data, error } = await supabase.from('workshop_testers').select('uid,name,tester,at').limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: (data ?? []).map(r => ({ uid: r.uid, name: r.name, tester: r.tester, at: Number(r.at) })) })
  }
  return NextResponse.json({ error: 'kind must be feedback or testers' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  let body: { kind?: string; data?: Record<string, unknown> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const g = await guard(req)
  if (g instanceof NextResponse) return g
  const d = body.data ?? {}
  const uid = g.userId
  const name = String(d.name ?? '').trim().slice(0, 40)
  const tester = String(d.tester ?? '')
  if (!TESTER_RE.test(tester)) return NextResponse.json({ error: 'Invalid tester' }, { status: 400 })
  const supabase = db()
  if (body.kind === 'testers') {
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    const { error } = await supabase.from('workshop_testers').upsert({ uid, name, tester, at: Date.now() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (body.kind === 'feedback') {
    const caseId = String(d.caseId ?? '')
    const status = String(d.status ?? '')
    const text = String(d.text ?? '').slice(0, 3000)
    const tags = String(d.tags ?? '').split(',').filter(t => TAGS.includes(t)).join(',')
    if (!CASE_RE.test(caseId)) return NextResponse.json({ error: 'Invalid case' }, { status: 400 })
    if (!['ok', 'friction', 'problem', 'blocked'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    const { count } = await supabase.from('workshop_feedback').select('case_id', { count: 'exact', head: true })
    if ((count ?? 0) > 3000) return NextResponse.json({ error: 'Storage limit reached' }, { status: 507 })
    const { error } = await supabase.from('workshop_feedback').upsert({ case_id: caseId, uid, name, tester, status, tags, text, at: Date.now() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'kind must be feedback or testers' }, { status: 400 })
}
