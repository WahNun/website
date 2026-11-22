import { NextRequest, NextResponse } from 'next/server'
import { createDraft, getDraft } from '@/lib/draft-bookings'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { items, ...params } = body
    // Audit AZD-008: IP-Limit (3 aktive Drafts / 10 min) galt nur im Chatbot-Pfad — jetzt auch hier
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    const draft = await createDraft(params, items, ip)
    return NextResponse.json({ draft_id: draft.id, expires_at: draft.expires_at })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    if (message === 'RATE_LIMIT_EXCEEDED') return NextResponse.json({ error: 'Our booking system is a bit busy from your connection right now — please try again in about 10 minutes.' }, { status: 429 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }
  try {
    const draft = await getDraft(id)
    return NextResponse.json(draft)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
