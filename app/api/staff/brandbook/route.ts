import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireStaff } from '@/lib/staffAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/staff/brandbook — AZD Brand Guide (PDF, „Confidential — internal use").
 * Liegt bewusst NICHT in /public, sondern in /private und wird nur an eingeloggte Mitarbeiter ausgeliefert
 * (Bearer-Token, Rolle admin | staff | front_office).
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (auth instanceof NextResponse) return auth
  try {
    const file = await readFile(path.join(process.cwd(), 'private', 'AZD_Brandbook.pdf'))
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="AZD_Brand_Guide_2026.pdf"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    console.error('[brandbook] read failed', e)
    return NextResponse.json({ ok: false, error: `Brand guide file not found on the server (${e instanceof Error ? e.message : String(e)})` }, { status: 500 })
  }
}
