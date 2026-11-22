import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Staff-Auth für mutierende API-Routen (Audit AZD-001/002/005/006, 23.10.2026).
 * Erwartet `Authorization: Bearer <supabase access_token>` und profiles.role ∈ roles.
 * Rückgabe: { user, role } oder eine fertige 401/403-Response.
 */
export async function requireStaff(
  req: NextRequest,
  // front_office = die Rolle, die den Front-Office-Tab bedient — ohne sie liefen Cancel/Refund/Payments für das Team ins 403
  roles: string[] = ['admin'],
): Promise<{ user: { id: string; email?: string | null }; role: string } | NextResponse> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return NextResponse.json({ ok: false, error: 'Unauthorized — staff login required' }, { status: 401 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized — session invalid or expired' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role ?? ''
  if (!roles.includes(role)) return NextResponse.json({ ok: false, error: `Forbidden — role '${role || 'none'}' may not do this` }, { status: 403 })

  return { user: { id: user.id, email: user.email }, role }
}

/** Client-Helfer: Authorization-Header aus der aktuellen Supabase-Session. */
export function bearer(accessToken: string | null | undefined): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {}
}
