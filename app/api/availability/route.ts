import { NextRequest, NextResponse } from 'next/server'
import { getAvailability, addDays, azoresNow } from '@/lib/availability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 120

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const today = azoresNow().date
  const from = searchParams.get('from') ?? today
  const to = searchParams.get('to') ?? addDays(from, 60)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }
  const span = (Date.parse(to) - Date.parse(from)) / 86400000
  if (span < 0 || span > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'Range too large' }, { status: 400 })
  }

  try {
    const sessions = await getAvailability(from, to, undefined, searchParams.get('sandbox') === '1')
    return NextResponse.json({ from, to, today, sessions })
  } catch (e) {
    console.error('[availability]', e)
    return NextResponse.json({ error: 'Could not load availability' }, { status: 500 })
  }
}
