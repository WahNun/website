import { createClient } from '@/utils/supabase/client'

const supabase = createClient()

export type AuditActionType =
  | 'ticket_created'
  | 'status_changed'
  | 'message_sent'
  | 'ticket_archived'
  | 'ticket_unarchived'
  | 'insurance_proof_seen'
  | 'insurance_proof_undone'
  | 'medical_clearance_seen'
  | 'medical_clearance_undone'
  | 'minor_acknowledged'
  | 'minor_ack_undone'
  | 'refresher_completed'
  | 'refresher_undone'
  | 'medical_proof_attached'
  | 'medical_proof_removed'
  | 'dan_policy_recorded'
  | 'dan_policy_cleared'
  | 'insurance_onsite_purchased'
  | 'insurance_onsite_undone'

export async function logAuditEvent(params: {
  ticketId: string
  userId: string
  userEmail: string
  actionType: AuditActionType
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
}) {
  try {
    await supabase.from('audit_log').insert({
      ticket_id: params.ticketId,
      user_id: params.userId,
      user_email: params.userEmail,
      action_type: params.actionType,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
    })
  } catch (e) {
    console.warn('[audit] log failed:', e)
  }
}

export async function fetchTicketHistory(ticketId: string) {
  const { data } = await supabase
    .from('audit_log')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function fetchGlobalAuditLog(isAdmin: boolean, userId: string) {
  let query = supabase
    .from('audit_log')
    .select('*, support_tickets(name, email)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (!isAdmin) query = query.eq('user_id', userId)
  const { data } = await query
  const rows = data ?? []

  const userIds = [...new Set(rows.map(r => r.user_id as string).filter(Boolean))]
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds)
    if (profiles) {
      const nameMap: Record<string, string> = {}
      for (const p of profiles) {
        if (p.id && p.name) nameMap[p.id] = p.name
      }
      return rows.map(r => ({ ...r, user_name: nameMap[r.user_id as string] ?? null }))
    }
  }
  return rows
}
