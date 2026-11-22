import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

const BUCKET = 'waivers'

/** GET ?path=…: nur für eingeloggte Mitarbeiter. Leitet auf eine 2-Minuten-Signed-URL des privaten Buckets weiter. */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const userSupabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized (401)' }, { status: 401 })

  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required (400)' }, { status: 400 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // Nur Pfade ausliefern, die tatsächlich an einem Kunden hängen
  const { data: cu } = await db.from('customers').select('id').eq('waiver_pdf_url', path).limit(1).maybeSingle()
  if (!cu) return NextResponse.json({ error: 'No signature on file for this path (404)' }, { status: 404 })

  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error || !data) return NextResponse.json({ error: `Could not open signature (500): ${error?.message ?? 'unknown'}` }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
