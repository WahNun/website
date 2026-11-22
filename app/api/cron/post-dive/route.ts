import { NextRequest, NextResponse } from 'next/server'
import { runPostDive } from '@/lib/postDive'
import { recordHeartbeat } from '@/lib/heartbeat'

export const runtime = 'nodejs'
export const maxDuration = 60

// 18:00 UTC = 18:00 Azores in summer (UTC+0), 17:00 in winter (UTC-1)
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Audit AZD-017: Testbuchungen separat mit isTest=true ([TEST]-Prefix), nie als Live-Mail
    const result = await runPostDive({ isTest: false })
    const testResult = await runPostDive({ isTest: true }).catch(e => ({ date: result.date, bookings: 0, mailed: 0, wishGranted: 0, skipped: 0, errors: [e instanceof Error ? e.message : String(e)] }))
    const detail = `date=${result.date} bookings=${result.bookings} mailed=${result.mailed} wishGranted=${result.wishGranted} skipped=${result.skipped} errors=${result.errors.length} | test: mailed=${testResult.mailed} errors=${testResult.errors.length}`
    await recordHeartbeat('post-dive', result.errors.length === 0, detail)
    return NextResponse.json({ ...result, test: testResult })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await recordHeartbeat('post-dive', false, msg)
    console.error('[cron/post-dive]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
