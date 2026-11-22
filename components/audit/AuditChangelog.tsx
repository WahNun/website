'use client'
import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { fetchGlobalAuditLog } from '@/lib/auditLog'

type AuditRow = Record<string, unknown>

const ACTION_LABELS: Record<string, string> = {
 ticket_created: ' Ticket created',
 status_changed: ' Status changed',
 message_sent: ' Message sent',
 ticket_archived: ' Archived',
 ticket_unarchived: ' Unarchived',
 email_sent: ' Email sent',
 insurance_proof_seen: ' Insurance proof seen',
 insurance_proof_undone: ' Insurance proof undone',
 medical_clearance_seen: ' Medical clearance seen',
 medical_clearance_undone: ' Medical clearance undone',
 minor_acknowledged: ' Under-18 diver acknowledged',
 minor_ack_undone: ' Under-18 acknowledgement undone',
 refresher_completed: ' Refresher completed',
 refresher_undone: ' Refresher undone',
 medical_proof_attached: ' Medical proof uploaded',
 medical_proof_removed: ' Medical proof removed',
 dan_policy_recorded: ' DAN policy number recorded',
 dan_policy_cleared: ' DAN policy number cleared',
 insurance_onsite_purchased: '€ DAN day cover sold on-site',
 insurance_onsite_undone: ' On-site day cover flag undone',
 refund_requested: '€ Refund requested',
 refund_authorized: '€ Refund authorized & paid',
 refund_failed: ' Refund failed at Stripe',
 refund_method_override: ' Refund payout method overridden',
 payment_registered: '€ Payment registered manually',
 payment_request_sent: ' Payment request sent',
 checkout_link_created: ' Stripe checkout link created',
 booking_cancelled: ' Booking cancelled',
 invoice_created: ' Invoice created',
 invoice_failed: ' Invoice failed',
 sessions_changed: ' Dive days / times changed',
 start_times_sent: ' Start times sent',
 instructor_ticket: ' Instructor ticket',
 customer_profile_updated: ' Guest profile updated',
 confirmation_sent: ' Confirmation + check-in link sent',
 attendance_recorded: ' Attendance recorded',
 insurance_reconciled: ' Insurance reconciled',
 setting_changed: ' Setting changed',
}

const ACTION_GROUPS = [
 { label: 'All Actions', value: '' },
 { label: 'Status Changes', value: 'status_changed' },
 { label: 'Emails sent', value: 'email_sent' },
 { label: 'Ticket created', value: 'ticket_created' },
 { label: 'Archived', value: 'ticket_archived' },
 { label: 'Unarchived', value: 'ticket_unarchived' },
 { label: 'Messages', value: 'message_sent' },
 { label: 'Refund requested', value: 'refund_requested' },
 { label: 'Refund authorized', value: 'refund_authorized' },
 { label: 'Manual payments', value: 'payment_registered' },
 { label: 'Cancellations', value: 'booking_cancelled' },
 { label: 'Settings', value: 'setting_changed' },
]

function formatTs(iso: string) {
 const d = new Date(iso)
 return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
 ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function detailText(entry: Record<string, unknown>) {
 if (entry.action_type === 'status_changed') {
 const ov = entry.old_value as Record<string, unknown> | null
 const nv = entry.new_value as Record<string, unknown> | null
 const oldStatus = ov?.status ?? '?'
 const newStatus = nv?.status ?? '?'
 const claimedBy = nv?.claimed_by as string | null | undefined
 const oldClaimedBy = ov?.claimed_by as string | null | undefined
 if (claimedBy && oldStatus !== newStatus) return `${oldStatus} ${newStatus} · Claimed by ${claimedBy}`
 if (claimedBy && oldStatus === newStatus) return `Taken over by ${claimedBy} (was ${oldClaimedBy ?? '?'})`
 if (nv?.claimed_by === null) return `${oldStatus} ${newStatus} · Unclaimed`
 return `${oldStatus} ${newStatus}`
 }
 const nv = entry.new_value as Record<string, unknown> | null
 if (typeof nv?.description === 'string' && nv.description) return nv.description
 return '—'
}

export default function AuditChangelog({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
 const [rows, setRows] = useState<AuditRow[]>([])
 const [loading, setLoading] = useState(true)
 const [filterStaff, setFilterStaff] = useState('')
 const [filterTicket, setFilterTicket] = useState('')
 const [filterFrom, setFilterFrom] = useState('')
 const [filterTo, setFilterTo] = useState('')
 const [filterAction, setFilterAction] = useState('')

 function load() {
 setLoading(true)
 fetchGlobalAuditLog(isAdmin, userId).then(data => {
 setRows(data as AuditRow[])
 setLoading(false)
 })
 }

 useEffect(() => { load() }, [isAdmin, userId]) // eslint-disable-line react-hooks/exhaustive-deps

 const staffOptions = useMemo(() => {
 const seen = new Set<string>()
 const opts: { email: string; name: string }[] = []
 for (const r of rows) {
 const email = r.user_email as string
 if (email && !seen.has(email)) {
 seen.add(email)
 const firstName = (r.user_name as string | null) ?? email.split('@')[0]
 opts.push({ email, name: firstName })
 }
 }
 return opts.sort((a, b) => a.name.localeCompare(b.name))
 }, [rows])

 const filtered = useMemo(() => {
 return rows.filter((r: AuditRow) => {
 if (filterAction && r.action_type !== filterAction) return false
 if (filterStaff && r.user_email !== filterStaff) return false
 if (filterTicket) {
 const tkt = r.support_tickets as Record<string, unknown> | null
 const email = (tkt?.email as string ?? '').toLowerCase()
 const name = (tkt?.name as string ?? '').toLowerCase()
 const id = (r.ticket_id as string ?? '').toLowerCase()
 const q = filterTicket.toLowerCase()
 if (!email.includes(q) && !name.includes(q) && !id.includes(q)) return false
 }
 if (filterFrom) {
 if (new Date(r.created_at as string) < new Date(filterFrom)) return false
 }
 if (filterTo) {
 const to = new Date(filterTo)
 to.setDate(to.getDate() + 1)
 if (new Date(r.created_at as string) >= to) return false
 }
 return true
 })
 }, [rows, filterAction, filterStaff, filterTicket, filterFrom, filterTo])

 const inputStyle: CSSProperties = {
 background: 'rgba(255,255,255,.05)',
 border: '1px solid rgba(255,255,255,.1)',
 borderRadius: 0,
 color: 'rgba(255,255,255,.8)',
 fontSize: '14px',
 padding: '6px 10px',
 fontFamily: 'inherit',
 outline: 'none',
 }

 return (
 <div>
 {/* Filter panel */}
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
 <select value={filterAction} onChange={(e: { target: { value: string } }) => setFilterAction(e.target.value)} style={{ ...inputStyle, minWidth: '150px' }}>
 {ACTION_GROUPS.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
 </select>
 {isAdmin && (
 <select value={filterStaff} onChange={(e: { target: { value: string } }) => setFilterStaff(e.target.value)} style={{ ...inputStyle, minWidth: '140px' }}>
 <option value=''>All Staff</option>
 {staffOptions.map(({ email, name }) => <option key={email} value={email}>{name}</option>)}
 </select>
 )}
 <input
 placeholder='Ticket ID, name or email'
 value={filterTicket}
 onChange={(e: { target: { value: string } }) => setFilterTicket(e.target.value)}
 style={{ ...inputStyle, minWidth: '200px' }}
 />
 <input
 type='date'
 value={filterFrom}
 onChange={(e: { target: { value: string } }) => setFilterFrom(e.target.value)}
 style={{ ...inputStyle }}
 />
 <input
 type='date'
 value={filterTo}
 onChange={(e: { target: { value: string } }) => setFilterTo(e.target.value)}
 style={{ ...inputStyle }}
 />
 {(filterAction || filterStaff || filterTicket || filterFrom || filterTo) && (
 <button
 onClick={() => { setFilterAction(''); setFilterStaff(''); setFilterTicket(''); setFilterFrom(''); setFilterTo('') }}
 style={{ ...inputStyle, cursor: 'pointer', color: 'rgba(201,146,140,.8)', borderColor: 'rgba(201,146,140,.2)' }}
 >
 Clear filters
 </button>
 )}
 <button
 onClick={load}
 disabled={loading}
 style={{ ...inputStyle, cursor: loading ? 'default' : 'pointer', marginLeft: 'auto', opacity: loading ? 0.5 : 1 }}
 >
 {loading ? '' : ''} Refresh
 </button>
 </div>

 {loading ? (
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', padding: '24px 0', textAlign: 'center' }}>
 Loading changelog…
 </div>
 ) : filtered.length === 0 ? (
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', padding: '24px 0', textAlign: 'center' }}>
 No entries found.
 </div>
 ) : (
 <div style={{ overflowX: 'auto' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
 <thead>
 <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 {['Date', 'Staff', 'Ticket', 'Action', 'Details'].map(h => (
 <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'rgba(255,255,255,.4)', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {filtered.map((r: AuditRow) => {
 const tkt = r.support_tickets as Record<string, unknown> | null
 return (
 <tr key={r.id as string} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
 <td style={{ padding: '9px 10px', color: 'rgba(255,255,255,.55)', whiteSpace: 'nowrap' }}>{formatTs(r.created_at as string)}</td>
 <td style={{ padding: '9px 10px', color: 'rgba(255,255,255,.75)' }}>{(r.user_name as string | null) ?? (r.user_email as string ?? '').split('@')[0]}</td>
 <td style={{ padding: '9px 10px', color: 'rgba(255,255,255,.6)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
 {tkt
 ? `${tkt.name ?? ''} (${tkt.email ?? ''})`
 : r.entity_type === 'booking_customer'
 ? <span style={{ color: 'rgba(255,255,255,.3)', fontStyle: 'italic' }}>Diver log</span>
 : r.entity_type === 'booking' && r.entity_id
 ? <span style={{ fontFamily: 'monospace' }}>Booking {(r.entity_id as string).slice(0, 8).toUpperCase()}</span>
 : r.entity_type && r.entity_type !== 'ticket'
 ? <span style={{ color: 'rgba(255,255,255,.3)', fontStyle: 'italic' }}>{r.entity_type as string}</span>
 : (r.ticket_id as string ?? '—').slice(0, 8) + '…'}
 </td>
 <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
 <span style={{ fontSize: '14px' }}>{ACTION_LABELS[r.action_type as string] ?? ((r.action_type as string).startsWith('fo_') ? ' ' + (r.action_type as string).slice(3).replace(/_/g, ' ') : r.action_type as string)}</span>
 </td>
 <td style={{ padding: '9px 10px', color: 'rgba(255,255,255,.45)' }}>{detailText(r)}</td>
 </tr>
 )
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 )
}
