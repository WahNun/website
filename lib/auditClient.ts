import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser-Seite: Staff-Aktion, die direkt per Supabase-Client geschrieben wurde, zusaetzlich ins audit_log
 * (ueber /api/audit/log). Schlaegt der Eintrag fehl, bleibt die Aktion bestehen — der Fehler wird in der
 * Konsole gemeldet und zurueckgegeben, damit der Aufrufer ihn anzeigen kann.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function auditFromClient(supabase: SupabaseClient | any, p: {
  bookingId: string; action: string; description: string; field?: string | null; oldVal?: string | null; newVal?: string | null
}): Promise<string | null> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
    const res = await fetch('/api/audit/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ booking_id: p.bookingId, action: p.action, description: p.description, field: p.field ?? null, old_value: p.oldVal ?? null, new_value: p.newVal ?? null }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      const msg = `Audit log ${res.status}: ${(j as { error?: string }).error ?? res.statusText}`
      console.warn('[audit]', msg)
      return msg
    }
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[audit] failed:', msg)
    return msg
  }
}
