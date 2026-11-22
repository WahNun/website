'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

const supabase = createClient()

interface TicketMessage {
 id: string
 direction: 'inbound' | 'outbound'
 from_email: string
 body_text: string
 attachments: { name: string; url: string; size?: number }[]
 created_at: string
}

function formatTs(iso: string) {
 const d = new Date(iso)
 return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
 ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Strip quoted reply chain and outbound signature for cleaner display */
function trimBody(body: string, direction: 'inbound' | 'outbound'): { text: string; clipped: boolean } {
 let text = body ?? ''

 // Remove "On [date] ... wrote:" quoted chain (Gmail / Outlook style)
 const onWrote = text.search(/\nOn .{10,200} wrote:\s*\n/m)
 if (onWrote > 0) text = text.slice(0, onWrote)

 // Remove lines starting with > (quoted text)
 const lines = text.split('\n')
 const clean: string[] = []
 for (const ln of lines) {
 if (!ln.startsWith('>')) clean.push(ln)
 }
 text = clean.join('\n')

 // For outbound: strip the standard "Kind regards" signature block
 if (direction === 'outbound') {
 const sigIdx = text.search(/\n\nKind regards,\n/)
 if (sigIdx > 0) text = text.slice(0, sigIdx)
 }

 const trimmed = text.trim()
 const clipped = trimmed.length < (body ?? '').trim().length
 return { text: trimmed, clipped }
}

export default function TicketMessages({
 ticketId,
 refreshTrigger,
 onLastMessageRead,
}: {
 ticketId: string
 refreshTrigger?: string
 onLastMessageRead?: () => void
}) {
 const [messages, setMessages] = useState<TicketMessage[]>([])
 const [loading, setLoading] = useState(true)
 const [expanded, setExpanded] = useState<Set<string>>(new Set())
 const lastMsgRef = useRef<HTMLDivElement | null>(null)

 // Initial fetch + re-fetch on refreshTrigger
 useEffect(() => {
 setLoading(true)
 supabase
 .from('ticket_messages')
 .select('*')
 .eq('ticket_id', ticketId)
 .order('created_at', { ascending: true })
 .then(({ data }) => {
 setMessages((data ?? []) as TicketMessage[])
 setLoading(false)
 })
 }, [ticketId, refreshTrigger])

 // Realtime: new messages appear automatically
 useEffect(() => {
 const channel = supabase
 .channel('ticket-msgs-' + ticketId)
 .on(
 'postgres_changes',
 { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` },
 payload => {
 setMessages(prev => {
 const exists = prev.some(m => m.id === (payload.new as TicketMessage).id)
 return exists ? prev : [...prev, payload.new as TicketMessage]
 })
 }
 )
 .subscribe()
 return () => { supabase.removeChannel(channel) }
 }, [ticketId])


 // Mark as read when last message scrolls into view
 useEffect(() => {
 if (!lastMsgRef.current || !onLastMessageRead) return
 const obs = new IntersectionObserver(
 ([entry]) => { if (entry.isIntersecting) { onLastMessageRead(); obs.disconnect() } },
 { threshold: 0.5 }
 )
 obs.observe(lastMsgRef.current)
 return () => obs.disconnect()
 }, [messages, onLastMessageRead])

 if (loading) return null
 if (messages.length === 0) return null

 const toggleExpand = (id: string) =>
 setExpanded(prev => {
 const next = new Set(prev)
 next.has(id) ? next.delete(id) : next.add(id)
 return next
 })

 return (
 <div style={{ marginBottom: '14px' }}>
 <div style={{
 fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,.35)',
 textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px',
 }}>
 Email Thread ({messages.length})
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
 {messages.map((msg, idx) => {
 const isOut = msg.direction === 'outbound'
 const senderLabel = isOut
 ? msg.from_email.split('@')[0]
 : msg.from_email
 const { text, clipped } = trimBody(msg.body_text, msg.direction)
 const isExpanded = expanded.has(msg.id)
 const displayText = isExpanded ? (msg.body_text ?? '').trim() : text

 return (
 <div key={msg.id} ref={idx === messages.length - 1 ? lastMsgRef : null} style={{ display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start' }}>
 <div style={{
 width: '92%',
 padding: '10px 14px 8px',
 borderRadius: isOut ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
 background: isOut ? 'rgba(243,239,230,.07)' : 'rgba(212,160,122,.07)',
 border: `1px solid ${isOut ? 'rgba(243,239,230,.18)' : 'rgba(212,160,122,.18)'}`,
 }}>
 {/* Sender + time */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px', gap: '8px' }}>
 <span style={{
 fontSize: '14px', fontWeight: 500,
 color: isOut ? 'rgba(243,239,230,.75)' : 'rgba(212,160,122,.75)',
 textTransform: 'uppercase', letterSpacing: '.06em',
 }}>
 {isOut ? '' : ''} {senderLabel}
 </span>
 <span style={{ fontSize: '14px', color: 'rgba(255,255,255,.25)', whiteSpace: 'nowrap', flexShrink: 0 }}>
 {formatTs(msg.created_at)}
 </span>
 </div>

 {/* Body */}
 <div style={{
 fontSize: '14px',
 color: 'rgba(243,239,230,.92)',
 lineHeight: 1.65,
 whiteSpace: 'pre-wrap',
 wordBreak: 'break-word',
 }}>
 {displayText || <span style={{ color: 'rgba(255,255,255,.3)', fontStyle: 'italic' }}>(no content)</span>}
 </div>

 {/* Show full / collapse toggle */}
 {clipped && (
 <button
 onClick={() => toggleExpand(msg.id)}
 style={{
 marginTop: '7px', background: 'none', border: 'none', cursor: 'pointer',
 fontSize: '14px', color: isOut ? 'rgba(243,239,230,.55)' : 'rgba(212,160,122,.55)',
 padding: '0', fontFamily: 'inherit', textDecoration: 'underline',
 }}
 >
 {isExpanded ? ' Show less' : ' Show full email'}
 </button>
 )}

 {/* Attachments */}
 {msg.attachments?.length > 0 && (
 <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
 {msg.attachments.map((a, i) => (
 <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{
 fontSize: '14px', color: '#f3efe6', textDecoration: 'none',
 padding: '3px 8px', borderRadius: 0,
 background: 'rgba(243,239,230,.08)', border: '1px solid rgba(243,239,230,.2)',
 }}>
 {a.name}
 </a>
 ))}
 </div>
 )}
 </div>
 </div>
 )
 })}
 </div>
 </div>
 )
}
