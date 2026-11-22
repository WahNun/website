import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Darf dieser Mitarbeiter mit Live-Geld arbeiten (live kassieren, Live-Anfragen freigeben, Zahlungslinks)?
 * Admin immer; sonst nur, wenn ihm im Admin-Bereich "Data access = production" gegeben wurde.
 * Refunds und der globale Sandbox/Production-Schalter bleiben davon unberuehrt (admin-only).
 */
export async function canWorkLive(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from('profiles').select('role,data_access').eq('id', userId).maybeSingle()
  return data?.role === 'admin' || data?.data_access === 'production'
}
