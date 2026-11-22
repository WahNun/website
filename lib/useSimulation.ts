'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/components/pages/_shared'
import { switchSimulation, SIMULATION_EVENT } from '@/lib/simulationClient'

/**
 * In welcher Welt arbeitet diese Person? (gleiche Regel wie private.my_scope_is_test() in der Datenbank)
 *   - Admin: folgt dem globalen Sandbox/Production-Schalter (app_settings.simulation_mode).
 *   - Mitarbeiter mit Datenzugriff "production": immer Production, egal wie der Schalter steht (Lucas 06.11.2026).
 *   - alle anderen: immer Sandbox.
 * Der Schalter wird nur über /api/admin/simulation geschrieben (Admin, mit Audit-Log); offene Admin-Ansichten
 * bleiben über das Browser-Event synchron. sandbox === null: noch nicht geladen.
 */
export function useSimulation() {
  const [sandbox, setSandbox] = useState<boolean | null>(null)
  // Darf diese Person Produktionsdaten sehen und live arbeiten? (Admin oder Data access = production)
  const [canProduction, setCanProduction] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let followsSwitch = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      let admin = false, production = false
      if (uid) {
        const { data: prof } = await supabase.from('profiles').select('role,data_access').eq('id', uid).maybeSingle()
        admin = prof?.role === 'admin'
        production = prof?.data_access === 'production'
      }
      if (!alive) return
      followsSwitch = admin
      setCanProduction(admin || production)
      if (!admin) { setSandbox(!production); return }
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'simulation_mode').maybeSingle()
      if (alive) setSandbox(Boolean((data?.value as { enabled?: boolean } | null)?.enabled))
    })()
    const h = (e: Event) => { if (followsSwitch) setSandbox(Boolean((e as CustomEvent).detail)) }
    window.addEventListener(SIMULATION_EVENT, h)
    return () => { alive = false; window.removeEventListener(SIMULATION_EVENT, h) }
  }, [])

  const toggle = useCallback(async () => {
    if (sandbox === null) return
    setBusy(true); setError(null)
    const err = await switchSimulation(supabase, !sandbox)
    if (err) setError(err)
    setBusy(false)
  }, [sandbox])

  return { sandbox, busy, error, toggle, canProduction }
}
