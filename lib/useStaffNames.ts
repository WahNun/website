'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/components/pages/_shared'

// E-Mail → Anzeigename (profiles.name). Einmal pro Seitenaufruf geladen, dann gecacht.
let cache: Record<string, string> | null = null
let inflight: Promise<Record<string, string>> | null = null

async function load(): Promise<Record<string, string>> {
  if (cache) return cache
  if (!inflight) {
    inflight = (async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return {}
      const res = await fetch('/api/staff-names', { headers: { authorization: `Bearer ${token}` } })
      if (!res.ok) { const t = await res.text().catch(() => ''); console.warn('[staff-names]', res.status, t.slice(0, 300)); return {} }
      const j = await res.json().catch(() => ({}))
      cache = (j.names ?? {}) as Record<string, string>
      return cache
    })().finally(() => { inflight = null })
  }
  return inflight
}

/** who(email) → Name, sonst die E-Mail (bzw. „—"). */
export function useStaffNames() {
  const [names, setNames] = useState<Record<string, string>>(cache ?? {})
  useEffect(() => { let alive = true; load().then(n => { if (alive) setNames(n) }); return () => { alive = false } }, [])
  const who = (email: string | null | undefined): string => {
    if (!email) return '—'
    return names[email.toLowerCase()] ?? email
  }
  // who.id(userId) → Name oder null (z. B. booking_payments.recorded_by)
  who.id = (id: string | null | undefined): string | null => (id ? names[`id:${id.toLowerCase()}`] ?? null : null)
  return who
}
