import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

const BUCKET = 'medical-proofs'
const MAX_BYTES = 15 * 1024 * 1024

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Gleiche Regel wie resolve-flag: jede gueltige Mitarbeiter-Session. Die Identitaet kommt aus der Session.
async function requireAuth(): Promise<{ userId: string; userEmail: string } | null> {
  const cookieStore = await cookies()
  const userSupabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, userEmail: user.email ?? user.id }
}

/** POST: signierte Upload-URL (privater Bucket; der Browser laedt direkt hoch, umgeht das Body-Limit der Function). */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null) as { booking_customer_id?: string; filename?: string; content_type?: string; size?: number } /* Format egal (Lucas 25.10.): Foto, PDF, Scan … */ | null
  if (!body?.booking_customer_id || !body.filename) return NextResponse.json({ error: 'booking_customer_id and filename required' }, { status: 400 })
  if (typeof body.size === 'number' && body.size > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 15 MB' }, { status: 400 })
  const db = admin()
  const { data: bc } = await db.from('booking_customers').select('id').eq('id', body.booking_customer_id).maybeSingle()
  if (!bc) return NextResponse.json({ error: 'Diver not found' }, { status: 404 })
  const safe = body.filename.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
  const path = `${body.booking_customer_id}/${Date.now()}-${safe}`
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: `Could not prepare upload: ${error?.message ?? 'unknown'}` }, { status: 500 })
  return NextResponse.json({ path, token: data.token })
}

/** GET ?booking_customer_id=…: kurzlebiger Link zum Ansehen des hinterlegten Nachweises. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('booking_customer_id')
  if (!id) return NextResponse.json({ error: 'booking_customer_id required' }, { status: 400 })
  const db = admin()
  const { data: bc } = await db.from('booking_customers').select('medical_proof_path').eq('id', id).maybeSingle()
  if (!bc?.medical_proof_path) return NextResponse.json({ error: 'No proof on file' }, { status: 404 })
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(bc.medical_proof_path, 120)
  if (error || !data) return NextResponse.json({ error: `Could not open file: ${error?.message ?? 'unknown'}` }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
