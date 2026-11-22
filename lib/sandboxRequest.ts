import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Entscheidet serverseitig, ob ein Zahlungs-Request im Stripe-Testmodus läuft.
 * Dem Browser wird nie geglaubt: Test gilt nur mit gültigem Mitarbeiter-Token.
 *  - Mitarbeiter mit Data access = sandbox: immer Test.
 *  - Admin oder Data access = production: nur wenn ausdrücklich verlangt (requested = true).
 *  - Kein Token (öffentliche Gäste): nie Test.
 */
export async function isSandboxRequest(req: NextRequest, requested: boolean): Promise<{ test: boolean; role: string | null }> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return { test: false, role: null }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: { user } } = await db.auth.getUser(auth.slice(7))
  if (!user) return { test: false, role: null }
  const { data: profile } = await db.from('profiles').select('role,data_access').eq('id', user.id).maybeSingle()
  const role = (profile?.role as string | undefined) ?? null
  if (!role) return { test: false, role: null }
  if (role === 'admin' || profile?.data_access === 'production') return { test: requested === true, role }
  return { test: true, role }
}
