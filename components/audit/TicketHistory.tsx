'use client'
import { useEffect, useState } from 'react'
import { fetchTicketHistory } from '@/lib/auditLog'

const ACTION_ICONS: Record<string, string> = {
 ticket_created: '',
 status_changed: '',
 message_sent: '',
 ticket_archived: '',
 ticket_unarchived: '',
}

function formatTs(iso: string) {
 const d = new Date(iso)
 return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
 ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function describeAction(entry: Record<string, unknown>) {
 const email = (entry.user_email as string | null) ?? 'Unknown'
 const name = email.split('@')[0]
 switch (entry.action_type) {
 case 'ticket_created':
 return `Ticket created by ${name}`
 case 'status_changed': {
 const nv = entry.new_value as Record<string, unknown> | null
 const ov = entry.old_value as Record<string, unknown> | null
 return `${name} changed status from "${ov?.status ?? '?'}" to "${nv?.status ?? '?'}"`
 }
 case 'message_sent':
 return `${name} sent a message`
 case 'ticket_archived':
 return `${name} archived the ticket`
 case 'ticket_unarchived':
 return `${name} unarchived the ticket`
 default:
 return `${name}: ${entry.action_type}`
 }
}

export default function TicketHistory({ ticketId }: { ticketId: string }) {
 const [history, setHistory] = useState<Record<string, unknown>[]>([])
 const [loading, setLoading] = useState(true)

 useEffect(() => {
 setLoading(true)
 fetchTicketHistory(ticketId).then(data => {
 setHistory(data as Record<string, unknown>[])
 setLoading(false)
 })
 }, [ticketId])

 if (loading) return (
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', padding: '8px 0' }}>
 Loading history…
 </div>
 )

 if (history.length === 0) return (
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', padding: '8px 0' }}>
 No events recorded yet.
 </div>
 )

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
 {history.map((entry: Record<string, unknown>, i: number) => {
 const icon = ACTION_ICONS[entry.action_type as string] ?? ''
 const isLast = i === history.length - 1
 return (
 <div key={entry.id as string} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
 {/* Timeline spine */}
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
 <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(243,239,230,.1)', border: '1px solid rgba(243,239,230,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
 {icon}
 </div>
 {!isLast && <div style={{ width: '1px', flex: 1, minHeight: '16px', background: 'rgba(255,255,255,.08)', margin: '3px 0' }} />}
 </div>
 {/* Content */}
 <div style={{ paddingBottom: isLast ? 0 : '14px', paddingTop: '4px' }}>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.85)', lineHeight: 1.4 }}>
 {describeAction(entry)}
 </div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', marginTop: '2px' }}>
 {formatTs(entry.created_at as string)}
 {!!entry.user_email && (
 <span style={{ marginLeft: '8px', color: 'rgba(255,255,255,.2)' }}>
 · {entry.user_email as string}
 </span>
 )}
 </div>
 </div>
 </div>
 )
 })}
 </div>
 )
}
