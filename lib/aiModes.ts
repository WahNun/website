'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/components/pages/_shared'

/**
 * Eigene Sandbox/Production-Schalter fuer den AI-Support (site_settings, im AI-Config-Tab):
 *  - chatbot_link_mode : Zahlungslink des Chatbots (sandbox = /book?sandbox=1, Stripe-Testkonto)
 *  - chatbot_data_mode : Chat-Konversationen (neue werden so markiert, das Dashboard zeigt nur diesen Modus)
 *  - tickets_mode      : Support-Tickets (dito)
 * Unabhaengig vom globalen Sandbox-Schalter.
 */
export type AiMode = 'sandbox' | 'production'
export type AiModes = { link: AiMode | null; chat: AiMode | null; tickets: AiMode | null }
const KEYS = { link: 'chatbot_link_mode', chat: 'chatbot_data_mode', tickets: 'tickets_mode' } as const

export function useAiModes() {
  const [modes, setModes] = useState<AiModes>({ link: null, chat: null, tickets: null })
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error: e } = await supabase.from('site_settings').select('key,value').in('key', Object.values(KEYS))
    if (e) { setError(`Could not load AI modes: ${e.message}`); return }
    const m = Object.fromEntries((data ?? []).map(r => [r.key as string, r.value as string]))
    const pick = (k: string, fb: AiMode): AiMode => (m[k] === 'sandbox' ? 'sandbox' : m[k] === 'production' ? 'production' : fb)
    setError(null)
    setModes({ link: pick(KEYS.link, 'sandbox'), chat: pick(KEYS.chat, 'production'), tickets: pick(KEYS.tickets, 'production') })
  }, [])

  useEffect(() => {
    reload()
    const t = setInterval(reload, 30000)
    return () => clearInterval(t)
  }, [reload])

  /** Nur Admin (Server prueft das Token). Wirft bei Fehler mit echter Meldung. */
  const setMode = useCallback(async (which: keyof AiModes, value: AiMode) => {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) throw new Error('Not signed in')
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: KEYS[which], value }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(`HTTP ${res.status}: ${(j as { error?: string }).error ?? 'save failed'}`)
    }
    setModes(prev => ({ ...prev, [which]: value }))
  }, [])

  return { modes, error, setMode, reload }
}
