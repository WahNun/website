import type { SupabaseClient } from '@supabase/supabase-js'

export const SIMULATION_EVENT = 'azd:simulation'

/**
 * Browser: Simulationsmodus global umschalten (nur Admin, mit Audit-Log) und alle offenen Ansichten
 * (Dashboard-Banner, Finances) per Event informieren. Gibt eine sichtbare Fehlermeldung zurück oder null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function switchSimulation(supabase: SupabaseClient | any, enabled: boolean): Promise<string | null> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
    const res = await fetch('/api/admin/simulation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return `Simulation switch ${res.status}: ${(j as { error?: string }).error ?? res.statusText}`
    }
    window.dispatchEvent(new CustomEvent(SIMULATION_EVENT, { detail: enabled }))
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
