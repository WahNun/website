import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredDrafts } from '@/lib/draft-bookings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await cleanupExpiredDrafts()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cron/expire-drafts]', err)
    return NextResponse.json({ error: 'cleanup failed' }, { status: 500 })
  }
}
