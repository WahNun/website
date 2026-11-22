import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Staff-Aktionen ins audit_log schreiben (Server, Service-Role-Client).
 * Best effort: ein fehlgeschlagener Audit-Eintrag darf die Aktion selbst nie kippen.
 * Rueckgabe: Fehlertext oder null — Aufrufer koennen ihn in der Antwort als `audit_warning` mitgeben.
 * `description` (lesbarer Satz) landet in new_value und wird im Audit-Log-Tab als Detail angezeigt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient | any

export async function auditStaff(
  db: AnyDb,
  user: { id: string; email?: string | null },
  actionType: string,
  entityType: string,
  entityId: string | null,
  description: string,
  newValue: Record<string, unknown> = {},
  oldValue: Record<string, unknown> | null = null,
): Promise<string | null> {
  try {
    const { error } = await db.from('audit_log').insert({
      entity_type: entityType,
      entity_id: entityId,
      ticket_id: null,
      user_id: user.id,
      user_email: user.email ?? null,
      action_type: actionType,
      old_value: oldValue,
      new_value: { description, ...newValue },
    })
    if (error) { console.warn('[audit] insert failed:', error.message); return error.message }
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[audit] failed:', msg)
    return msg
  }
}

const eur = (cents: number | null | undefined) => `${((cents ?? 0) / 100).toFixed(2)} EUR`
export { eur as auditEur }
