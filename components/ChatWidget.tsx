'use client'

import { useState, useEffect, useRef } from 'react'
import BookingCardView, { asBookingCard, type BookingCardData } from '@/components/BookingCardView'
import { usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const supabase = createClient()

const accent = '#35d0ff'
const textColor = '#e8f1fb'
const mutedColor = '#7fa6c9'
const bgMain = '#04101f'
const font = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`

type MessageRole = 'bot' | 'user' | 'team'

interface Message {
  role: MessageRole
  text: string
  sender?: string
  card?: BookingCardData
}

const MOCK: Record<string, string> = {
  price:    'Our prices: Double Dive €99 · Basic Diver €139 · Open Water Course €460 · Formigas Expedition €255. Want details on a specific option?',
  formigas: 'The Formigas & Dollabarat expedition is our flagship trip — 42 nm offshore, mantas, mobulas and huge groupers. €255 · weather-dependent only. Want to join the waitlist?',
  course:   'We run full SSI courses — Basic Diver (€139), Open Water Diver (€460), Advanced (€380), Stress & Rescue (€360) and Divemaster (€950). What level are you at?',
  site:     'Our main sites: Dori Wreck, Arco do Espelho, Arco do Cavaco and the offshore Formigas reserve. Each has its own unique marine life!',
  book:     'You can book directly on our website — hit "Book now" at the top. For groups or special requests, email us at azoresdiving@gmail.com 🙏',
  cancel:   'More than 72 h before your dive: full refund. 48–72 h before: 50 %. Under 48 h or no-show: no refund. If we cancel for weather or safety, you choose — full refund or another date. Full terms: /terms',
  equip:    'All equipment is included in every package — wetsuit, BCD, regulator, computer. Just bring your swimwear and towel!',
  default:  "I'm not sure I have the right answer for that. Let me know if I can help with prices, courses, dive sites or bookings! Or I can open a support ticket 🎫",
}

// Nur echte Eskalation (Beschwerde, Mensch verlangt). Verfuegbarkeitsfragen oeffnen das Ticket-Formular nicht mehr per Stichwort; es oeffnet, wenn der Bot selbst ein Ticket anbietet (31.10.2026)
const ESCALATION = /manager|complaint|problem|issue|speak to|human|team member|angry|frustrated|wrong|broken|escalate|ticket|support ticket/i
const SENSITIVE_TOPICS = /special need|disability|disabilit|wheelchair|medical|medication|condition|illness|pregnant|pregnancy|heart|epilep|asthma|allerg|diabete|anxiety|panic|phobia|claustro|deaf|blind|amput|prosthe|besondern|medizin|gesundheit|schwanger|behinderung/i

// Macht http(s)-Links in Bot-Antworten klickbar (z.B. der persoenliche Buchungslink).
function linkify(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g)
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part
    const m = part.match(/^(.*?)([.,;:!?)*_\]>]*)$/)
    const url = m ? m[1] : part
    const tail = m ? m[2] : ''
    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#35d0ff', textDecoration: 'underline', wordBreak: 'break-all' }}>{url}</a>
        {tail}
      </span>
    )
  })
}

// Leichtes Markdown für Bot-Antworten (Lucas 28.10.): **fett**, [Text](url), Zeilenumbrüche, nummerierte/Bullet-Listen auf
// eigene Zeilen — die rohen Sternchen und Einzeiler-Listen waren schwer lesbar. Kein HTML, nur bekannte Muster.
export function renderRich(text: string): React.ReactNode {
  // Listenpunkte, die der Bot inline schreibt ("… 1. **A** 2. **B**"), auf eigene Zeilen holen
  const normalized = text
    .replace(/\s+(\d+)\.\s+(?=\*\*|[A-Z])/g, (m, n, off, str) => (off === 0 ? m : `\n${n}. `))
    .replace(/\s+[-•]\s+(?=\*\*|[A-Z])/g, '\n• ')
  const lines = normalized.split('\n')
  const inline = (s: string, key: string): React.ReactNode[] => {
    const out: React.ReactNode[] = []
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
    let last = 0, m: RegExpExecArray | null, i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(<span key={`${key}-t${i++}`}>{linkify(s.slice(last, m.index))}</span>)
      if (m[1] !== undefined) out.push(<strong key={`${key}-b${i++}`}>{m[1]}</strong>)
      else out.push(<a key={`${key}-a${i++}`} href={m[3]} target="_blank" rel="noopener noreferrer" style={{ color: '#35d0ff', textDecoration: 'underline', wordBreak: 'break-all' }}>{m[2]}</a>)
      last = m.index + m[0].length
    }
    if (last < s.length) out.push(<span key={`${key}-t${i++}`}>{linkify(s.slice(last))}</span>)
    return out
  }
  return lines.map((ln, idx) => {
    const list = /^\s*(\d+\.|[-•])\s+/.exec(ln)
    const body = list ? ln.slice(list[0].length) : ln
    return (
      <div key={idx} style={list ? { display: 'flex', gap: '6px', margin: '3px 0 3px 2px' } : { minHeight: ln.trim() ? undefined : '6px' }}>
        {list && <span style={{ flexShrink: 0, color: '#8fb3d0' }}>{list[1] === '-' ? '•' : list[1]}</span>}
        <span>{inline(body, String(idx))}</span>
      </div>
    )
  })
}

export default function ChatWidget() {
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)
  const pathname = usePathname()
  const inMembers = pathname?.startsWith('/members') ?? false // Sprechblase nur im oeffentlichen Teil

  // Lead capture
  const [leadName, setLeadName] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadCaptured, setLeadCaptured] = useState(false)

  // Chat state
  const [msgs, setMsgs] = useState<Message[]>([
    { role: 'bot', text: "Hi! I'm Azores Diving Support Bot 🤿 Ask me anything about dives, courses or prices!" },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [failCount, setFailCount] = useState(0)

  // Ticket state
  const [showTicketForm, setShowTicketForm] = useState(false)
  const [ticketName, setTicketName] = useState('')
  const [ticketEmail, setTicketEmail] = useState('')
  const [ticketPhone, setTicketPhone] = useState('')
  const [ticketChannel, setTicketChannel] = useState<'email' | 'whatsapp'>('email')
  const [ticketCreated, setTicketCreated] = useState(false)
  const [submittingTicket, setSubmittingTicket] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36),
  )
  const shownRepliesRef = useRef<Set<string>>(new Set())

  // Chat ueberlebt Seitenwechsel und Neuladen (nur dieser Browser-Tab, 6 Stunden): Verlauf, Session-ID, Kontaktdaten, Ticketstatus
  const CHAT_STORE = 'azd_chat_v1'
  const [chatHydrated, setChatHydrated] = useState(false)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_STORE)
      if (raw) {
        const d = JSON.parse(raw) as { t?: number; sid?: string; msgs?: Message[]; lead?: { name?: string; phone?: string; email?: string; captured?: boolean }; ticketCreated?: boolean; open?: boolean }
        if (d && typeof d.t === 'number' && Date.now() - d.t < 6 * 3600_000 && typeof d.sid === 'string' && Array.isArray(d.msgs) && d.msgs.length > 0) {
          sessionIdRef.current = d.sid
          setMsgs(d.msgs.filter(m => m && typeof m.text === 'string' && (m.role === 'bot' || m.role === 'user' || m.role === 'team')).slice(-60))
          if (d.lead) { setLeadName(String(d.lead.name ?? '')); setLeadPhone(String(d.lead.phone ?? '')); setLeadEmail(String(d.lead.email ?? '')); setLeadCaptured(Boolean(d.lead.captured)) }
          if (d.ticketCreated) setTicketCreated(true)
          if (d.open) setOpen(true)
        }
      }
    } catch (e) { console.warn('[chat] restore failed', e) }
    setChatHydrated(true)
  }, [])
  useEffect(() => {
    if (!chatHydrated) return
    try {
      sessionStorage.setItem(CHAT_STORE, JSON.stringify({ t: Date.now(), sid: sessionIdRef.current, msgs: msgs.slice(-60), lead: { name: leadName, phone: leadPhone, email: leadEmail, captured: leadCaptured }, ticketCreated, open }))
    } catch (e) { console.warn('[chat] persist failed', e) }
  }, [chatHydrated, msgs, leadName, leadPhone, leadEmail, leadCaptured, ticketCreated, open])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1000px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Staff reply listener
  const handleStaffReply = (replyText: string, sender?: string) => {
    if (!replyText || shownRepliesRef.current.has(replyText)) return
    shownRepliesRef.current.add(replyText)
    setMsgs(m => [...m, { role: 'team', text: replyText, sender }])
    setOpen(true)
  }

  useEffect(() => {
    if (!ticketCreated) return
    const realtimeChannel = supabase
      .channel('staff-reply-' + sessionIdRef.current)
      .on('broadcast', { event: 'staff_reply' }, ({ payload }: { payload: { text?: string; sender?: string } }) => {
        if (payload?.text) handleStaffReply(payload.text, payload.sender)
      })
      .on('broadcast', { event: 'ticket_resolved' }, () => {
        setTicketCreated(false)
        setMsgs(m => [...m, { role: 'bot', text: '✅ Our team has resolved your request! If you have any more questions, just ask — happy to help 😊' }])
      })
      .subscribe()

    const poll = setInterval(async () => {
      // Nur ueber die Funktion (session_id als Schluessel) — der Tabellenzugriff fuer anon ist gesperrt
      const { data: rows } = await supabase.rpc('chat_poll', { p_session_id: sessionIdRef.current })
      const data = (Array.isArray(rows) ? rows[0] : rows) as { messages?: unknown; staff_reply_text?: string } | null
      if (data?.messages) {
        const messages = data.messages as Array<{ role: string; text: string; sender?: string }>
        const lastTeam = [...messages].reverse().find(m => m.role === 'team')
        if (lastTeam?.text) handleStaffReply(lastTeam.text, lastTeam.sender)
      } else if (data?.staff_reply_text) {
        handleStaffReply(data.staff_reply_text)
      }
    }, 3000) // Netz unter dem Broadcast (der ist sofort); anon darf die Tabelle nicht mehr lesen, daher Abfrage per chat_poll

    return () => {
      supabase.removeChannel(realtimeChannel)
      clearInterval(poll)
    }
  }, [ticketCreated]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveConversation = async (allMsgs: Message[]) => {
    const name = leadName.trim()
    const phone = leadPhone.trim()
    const email = leadEmail.trim()
    const firstUserMsg = allMsgs.find(m => m.role === 'user')?.text || ''
    const savedFirst = leadCaptured && (name || phone || email)
      ? '[CONTACT] ' + (name ? name + ' · ' : '') + (phone ? 'WhatsApp:' + phone : '') + (email ? ' email:' + email : '')
      : firstUserMsg
    const leadEntry = leadCaptured && (name || phone || email)
      ? [{ role: 'lead' as const, name, phone, email } as any]
      : []
    const msgsToSave = leadEntry.length > 0 && !allMsgs.some((m: any) => m.role === 'lead')
      ? [...leadEntry, ...allMsgs]
      : allMsgs
    const { error } = await supabase.rpc('chat_save', {
      p_session_id: sessionIdRef.current,
      p_first_message: savedFirst,
      p_messages: msgsToSave.map((m: Record<string, unknown>) => { if ('card' in m) { const rest = { ...m }; delete rest.card; return rest } return m }),
      p_message_count: allMsgs.length,
    })
    if (error) console.error('[AZD chat save]', error.code, error.message)
  }

  const submitLead = async () => {
    if (!leadPhone.trim()) return
    const name = leadName.trim()
    const phone = leadPhone.trim()
    const email = leadEmail.trim()
    setLeadCaptured(true)
    if (name) setTicketName(name)
    if (email) setTicketEmail(email)
    setTicketPhone(phone)
    await supabase.rpc('chat_save', {
      p_session_id: sessionIdRef.current,
      p_first_message: '[CONTACT] ' + (name ? name + ' · ' : '') + 'WhatsApp:' + phone + (email ? ' email:' + email : ''),
      p_messages: [{ role: 'lead', name, phone, email }],
      p_message_count: 0,
    })
  }

  const send = async () => {
    if (!input.trim() || typing) return
    const text = input.trim()

    // Human handoff mode — ticket open, relay message to staff
    if (ticketCreated) {
      setInput('')
      const allMsgs = [...msgs, { role: 'user' as const, text }]
      setMsgs(allMsgs)
      supabase.rpc('chat_save', {
        p_session_id: sessionIdRef.current,
        p_first_message: null,
        p_messages: allMsgs,
        p_message_count: allMsgs.filter(m => m.role === 'user').length,
      }).then(() => {})
      try {
        const bc = supabase.channel('staff-reply-' + sessionIdRef.current)
        Promise.race([
          new Promise<void>(res => { bc.subscribe(st => { if (st === 'SUBSCRIBED') res() }) }),
          new Promise<void>(res => setTimeout(res, 3000)),
        ])
          .then(() => bc.send({ type: 'broadcast', event: 'customer_message', payload: { role: 'user', text } }))
          .then(() => supabase.removeChannel(bc))
          .catch(() => {})
      } catch {}
      return
    }

    const history = [...msgs]
    setMsgs(m => [...m, { role: 'user', text }])
    setInput('')
    setTyping(true)

    // Call /api/chat proxy
    let replied = false
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          // Kontaktdaten aus dem Lead-Formular: der Bot soll sie kennen und nicht erneut abfragen (Lucas 28.10.)
          lead: leadCaptured ? { name: leadName.trim(), email: leadEmail.trim(), phone: leadPhone.trim() } : null,
          messages: [
            { role: 'system', content: 'You are a helpful assistant for Azores Diving, an SSI & Mares dive center in Ponta Delgada, São Miguel, Azores. Be friendly, concise and helpful.' },
            ...history.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text })),
            { role: 'user', content: text },
          ],
          max_tokens: 300,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (!data.error) {
          const reply = data.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate a response."
          const card = asBookingCard(data.booking_card)
          const updatedMsgs = [...history, { role: 'user' as const, text }, { role: 'bot' as const, text: reply, ...(card ? { card } : {}) }]
          setTyping(false)
          setMsgs(updatedMsgs)
          setFailCount(0)
          saveConversation(updatedMsgs)
          replied = true
          if (SENSITIVE_TOPICS.test(text.toLowerCase())) {
            setTimeout(() => {
              setMsgs(m => [...m, { role: 'bot', text: "This is something our team needs to assess personally — every situation is different and we want to get it right for you. I'll open a support ticket now so someone can follow up directly. 🙋" }])
              setShowTicketForm(true)
            }, 500)
          } else if (ESCALATION.test(text.toLowerCase()) || /support ticket|open a ticket|ticket form|will pop up|ticket now/i.test(reply)) {
            setTimeout(() => setShowTicketForm(true), 400)
          }
        }
      }
    } catch {}

    if (!replied) {
      // Keyword fallback
      setTimeout(() => {
        const lo = text.toLowerCase()
        let r = MOCK.default
        let matched = true
        if (/price|preis|cost|€|how much|quanto|combien|kosten/.test(lo))              r = MOCK.price
        else if (/formigas|expedition|offshore|dollabarat|manta/.test(lo))             r = MOCK.formigas
        else if (/course|kurs|certif|open water|divemaster|rescue|specialty|ausbildung/.test(lo)) r = MOCK.course
        else if (/site|spot|wreck|dori|arco|dive site|tauchplatz/.test(lo))            r = MOCK.site
        else if (/book|reserve|reserv|buchen|buchung/.test(lo))                        r = MOCK.book
        else if (/cancel|refund|weather|storni|storno/.test(lo))                       r = MOCK.cancel
        else if (/equipment|gear|wetsuit|ausrüstung/.test(lo))                         r = MOCK.equip
        else matched = false

        setTyping(false)
        const newMsgs = [...history, { role: 'user' as const, text }, { role: 'bot' as const, text: r }]
        setMsgs(newMsgs)
        saveConversation(newMsgs)

        const newFail = matched ? 0 : failCount + 1
        setFailCount(matched ? 0 : newFail)
        if (!matched && (newFail >= 2 || ESCALATION.test(lo))) {
          setTimeout(() => {
            setMsgs(m => [...m, { role: 'bot', text: "It seems I can't fully answer that. Can I open a support ticket so one of our team members follows up with you directly? 🙋" }])
            setShowTicketForm(true)
          }, 600)
        }
      }, 900 + Math.random() * 700)
    }
  }

  const submitTicket = async () => {
    if (submittingTicket) return
    const finalName = leadName.trim() || ticketName.trim()
    const finalEmail = leadEmail.trim() || ticketEmail.trim()
    const finalPhone = leadPhone.trim() || ticketPhone.trim()
    const finalChannel: 'email' | 'whatsapp' = leadPhone.trim() ? 'whatsapp' : ticketChannel
    if (!finalName || (!finalEmail && !finalPhone)) return
    setSubmittingTicket(true)
    setShowTicketForm(false)
    setTicketCreated(true)
    setTicketName(''); setTicketEmail(''); setTicketPhone('')
    setFailCount(0)
    setMsgs(m => [...m, { role: 'bot', text: 'Done! ✅ Ticket created — our team will get back to you shortly. Hang tight!' }])

    const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')?.text || 'Support request from chat'
    let conversation = lastUserMsg
    try {
      const convText = msgs.map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.text}`).join('\n')
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: [
            { role: 'system', content: 'Summarize the following customer chat in 1–2 sentences in English. Focus on the core request, any key details (dates, special needs, activity type, medical info). Be factual and concise. No greetings or filler.' },
            { role: 'user', content: convText },
          ],
          max_tokens: 100,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const summary = data.choices?.[0]?.message?.content?.trim()
        if (summary) conversation = summary
      }
    } catch {}

    // Persist ticket to Supabase
    await supabase.from('support_tickets').insert({
      name: finalName,
      email: finalEmail,
      phone: finalPhone || null,
      preferred_channel: finalChannel,
      session_id: sessionIdRef.current,
      message: lastUserMsg,
      conversation,
    }).then(({ error }) => { if (error) console.error('[AZD ticket]', error.message) })

    setSubmittingTicket(false)

    setTimeout(() => {
      setMsgs(m => {
        if (m.some(msg => msg.role === 'team')) return m
        const contactVal = finalChannel === 'whatsapp' ? finalPhone : finalEmail
        const channelLabel = finalChannel === 'whatsapp' ? 'WhatsApp (' + contactVal + ')' : 'email (' + contactVal + ')'
        return [...m, { role: 'bot', text: 'Our team will get back to you shortly via ' + channelLabel + '. Thanks for your patience! 🙏' }]
      })
    }, 4 * 60 * 1000)
  }

  useEffect(() => {
    if (msgs.length > 1 || typing || showTicketForm) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [msgs, typing, showTicketForm])

  const inputBaseStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,.07)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '8px', padding: '9px 12px',
    fontSize: '13.5px', color: textColor,
    fontFamily: font, outline: 'none',
  }

  return (
    <>
      <style>{`@keyframes azd-blink{0%,80%,100%{opacity:.2}40%{opacity:1}}`}</style>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? 0 : '90px',
          right: isMobile ? 0 : '24px',
          left: isMobile ? 0 : 'auto',
          top: isMobile ? 0 : 'auto',
          width: isMobile ? '100%' : '340px',
          height: isMobile ? '100%' : '500px',
          background: bgMain,
          borderRadius: isMobile ? 0 : '18px',
          border: isMobile ? 'none' : '1px solid rgba(53,208,255,.22)',
          boxShadow: '0 24px 64px rgba(0,0,0,.75)',
          zIndex: 9999,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: font,
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            background: 'rgba(53,208,255,.07)',
            borderBottom: '1px solid rgba(53,208,255,.14)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%',
              background: 'linear-gradient(135deg,#35d0ff 0%,#1a6aff 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '17px', flexShrink: 0,
            }}>🤿</div>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: textColor }}>Azores Diving Support Bot</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4fe3c8', display: 'inline-block', boxShadow: '0 0 5px #4fe3c8' }} />
                <span style={{ fontSize: '10.5px', color: mutedColor }}>Online · AI Assistant</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                marginLeft: 'auto',
                background: isMobile ? 'rgba(255,255,255,.08)' : 'transparent',
                border: 'none', color: mutedColor, fontSize: '22px',
                cursor: 'pointer', lineHeight: 1,
                padding: isMobile ? '6px 10px' : '0',
                borderRadius: '8px', fontFamily: font,
              }}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {/* Lead capture */}
          {!leadCaptured && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '22px 18px', gap: '11px' }}>
              <div style={{ fontSize: '20px', textAlign: 'center' }}>📱</div>
              <div style={{ fontSize: '13.5px', color: textColor, lineHeight: 1.6, textAlign: 'center' }}>
                Leave your WhatsApp so we can help you directly if needed!
              </div>
              <input
                value={leadName}
                onChange={e => setLeadName(e.target.value)}
                placeholder="Your name (optional)"
                type="text"
                style={inputBaseStyle}
                onKeyDown={e => e.key === 'Enter' && submitLead()}
              />
              <input
                value={leadPhone}
                onChange={e => setLeadPhone(e.target.value.replace(/[^\d\s+\-()]/g, ''))}
                placeholder="WhatsApp number (e.g. +49 170…) *"
                type="tel"
                inputMode="tel"
                style={{ ...inputBaseStyle, border: '1px solid rgba(79,227,200,.35)', fontSize: '14px', padding: '10px 12px' }}
                onKeyDown={e => e.key === 'Enter' && submitLead()}
              />
              <input
                value={leadEmail}
                onChange={e => setLeadEmail(e.target.value)}
                placeholder="Email (optional)"
                type="email"
                style={inputBaseStyle}
                onKeyDown={e => e.key === 'Enter' && submitLead()}
              />
              <button
                onClick={submitLead}
                disabled={!leadPhone.trim()}
                style={{
                  padding: '11px 16px', borderRadius: '9px', border: 'none',
                  background: !leadPhone.trim() ? 'rgba(53,208,255,.3)' : accent,
                  color: bgMain, fontSize: '14px', fontWeight: 800,
                  cursor: !leadPhone.trim() ? 'default' : 'pointer',
                  fontFamily: font,
                }}
              >
                Start chatting →
              </button>
              <div style={{ fontSize: '10.5px', color: mutedColor, textAlign: 'center' }}>
                Only used to follow up if needed · never shared.
              </div>
            </div>
          )}

          {/* Messages */}
          {leadCaptured && (
            <div style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              padding: '16px', display: 'flex', flexDirection: 'column',
              gap: '10px', scrollbarWidth: 'none',
            }}>
              {msgs.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role === 'team' && (
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#ffd080', marginBottom: '3px', letterSpacing: '.05em' }}>
                      🧑‍💼 {msg.sender || 'AZD Team'}
                    </div>
                  )}
                  <div style={{
                    maxWidth: '82%', padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                    background: msg.role === 'user' ? 'rgba(53,208,255,.18)' : msg.role === 'team' ? 'rgba(255,208,128,.12)' : 'rgba(255,255,255,.07)',
                    border: msg.role === 'team' ? '1px solid rgba(255,208,128,.25)' : 'none',
                    fontSize: '13px', color: textColor, lineHeight: 1.55,
                  }}>
                    {msg.role === 'user' ? linkify(msg.text) : renderRich(msg.text)}
                  </div>
                  {msg.card && <div style={{ marginTop: 6, width: '100%' }}><BookingCardView card={msg.card} /></div>}
                </div>
              ))}

              {/* Ticket form */}
              {showTicketForm && (
                <div style={{
                  background: 'rgba(53,208,255,.08)',
                  border: '1px solid rgba(53,208,255,.25)',
                  borderRadius: '14px 14px 14px 3px',
                  padding: '14px 16px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: accent, marginBottom: '10px' }}>🎫 Open Support Ticket</div>
                  {!leadName.trim() && (
                    <input
                      value={ticketName} onChange={e => setTicketName(e.target.value)}
                      placeholder="Your name"
                      style={{ ...inputBaseStyle, marginBottom: '7px', fontSize: '12.5px', padding: '8px 10px' }}
                    />
                  )}
                  {!leadEmail.trim() && (
                    <div style={{ position: 'relative', marginBottom: '7px' }}>
                      <input
                        value={ticketEmail} onChange={e => setTicketEmail(e.target.value)}
                        placeholder={leadPhone.trim() ? 'Your email (optional)' : 'Your email'}
                        type="email"
                        style={{
                          ...inputBaseStyle, fontSize: '12.5px', padding: '8px 10px',
                          paddingRight: leadPhone.trim() ? '74px' : '10px',
                        }}
                      />
                      {leadPhone.trim() && (
                        <span style={{
                          position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)',
                          fontSize: '10px', color: mutedColor, pointerEvents: 'none',
                          background: 'rgba(255,255,255,.06)', padding: '1px 5px', borderRadius: '4px', fontWeight: 600,
                        }}>optional</span>
                      )}
                    </div>
                  )}
                  {leadPhone.trim() ? (
                    <div style={{ fontSize: '11px', color: mutedColor, marginBottom: '7px' }}>
                      📱 We&apos;ll reach you via WhatsApp ({leadPhone.trim()})
                    </div>
                  ) : (
                    <div style={{ marginBottom: '7px' }}>
                      <div style={{ fontSize: '10.5px', color: mutedColor, marginBottom: '5px', fontWeight: 600 }}>How should we reach you?</div>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                        {(['email', 'whatsapp'] as const).map(ch => (
                          <button key={ch} onClick={() => setTicketChannel(ch)} style={{
                            flex: 1, padding: '6px 10px', borderRadius: '7px',
                            border: `1px solid ${ticketChannel === ch ? 'rgba(53,208,255,.5)' : 'rgba(255,255,255,.15)'}`,
                            background: ticketChannel === ch ? 'rgba(53,208,255,.15)' : 'transparent',
                            color: ticketChannel === ch ? accent : mutedColor,
                            fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: font,
                            textTransform: 'capitalize',
                          }}>
                            {ch === 'whatsapp' ? '📱 WhatsApp' : '✉️ Email'}
                          </button>
                        ))}
                      </div>
                      {ticketChannel === 'whatsapp' && (
                        <input
                          value={ticketPhone} onChange={e => setTicketPhone(e.target.value)}
                          placeholder="WhatsApp number (e.g. +49 170 ...)" type="tel"
                          style={{ ...inputBaseStyle, fontSize: '12.5px', padding: '8px 10px' }}
                        />
                      )}
                    </div>
                  )}
                  {(() => {
                    const rName = leadName.trim() || ticketName.trim()
                    const rEmail = leadEmail.trim() || ticketEmail.trim()
                    const rPhone = leadPhone.trim() || ticketPhone.trim()
                    const canSubmit = !!rName && (!!rEmail || !!rPhone) && !submittingTicket
                    return (
                      <div style={{ display: 'flex', gap: '7px' }}>
                        <button onClick={submitTicket} disabled={!canSubmit} style={{
                          flex: 1, padding: '8px 14px', borderRadius: '7px', border: 'none',
                          background: canSubmit ? accent : 'rgba(53,208,255,.3)',
                          color: bgMain, fontSize: '12px', fontWeight: 700,
                          cursor: canSubmit ? 'pointer' : 'default', fontFamily: font,
                        }}>
                          {submittingTicket ? '⏳ Sending…' : 'Send ticket'}
                        </button>
                        <button onClick={() => setShowTicketForm(false)} style={{
                          padding: '8px 12px', borderRadius: '7px',
                          border: '1px solid rgba(255,255,255,.15)',
                          background: 'transparent', color: mutedColor,
                          fontSize: '12px', cursor: 'pointer', fontFamily: font,
                        }}>
                          Cancel
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Typing indicator */}
              {typing && (
                <div style={{ display: 'flex' }}>
                  <div style={{
                    padding: '11px 14px', borderRadius: '14px 14px 14px 3px',
                    background: 'rgba(255,255,255,.07)',
                    display: 'flex', gap: '4px', alignItems: 'center',
                  }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        width: '5px', height: '5px', borderRadius: '50%',
                        background: mutedColor, display: 'inline-block',
                        animation: `azd-blink 1.2s ${i * 0.22}s ease-in-out infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}

          {/* Input bar */}
          {leadCaptured && (
            <div style={{
              padding: '12px 14px',
              borderTop: '1px solid rgba(255,255,255,.08)',
              display: 'flex', gap: '8px', alignItems: 'center',
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask about dives, courses, prices…"
                style={{
                  flex: 1, background: 'rgba(255,255,255,.07)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: '22px', padding: '9px 15px',
                  fontSize: '16px', color: textColor,
                  outline: 'none', fontFamily: font, touchAction: 'manipulation',
                }}
              />
              <button
                onClick={send}
                disabled={typing}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: typing ? 'rgba(53,208,255,.3)' : accent,
                  cursor: typing ? 'default' : 'pointer',
                  fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: bgMain, fontWeight: 900,
                }}
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
          )}
        </div>
      )}

      {/* Speech bubble invite */}
      {!open && !bubbleDismissed && !inMembers && !isMobile && (
        <div style={{
          position: 'fixed', bottom: '92px', right: '20px', zIndex: 9997,
          background: '#ffffff', borderRadius: '14px 14px 4px 14px',
          padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,.35)',
          maxWidth: '200px', fontFamily: font,
        }}>
          <div style={{ fontSize: '13px', color: bgMain, fontWeight: 600, lineHeight: 1.4 }}>
            Questions about diving?<br />
            <span style={{ fontWeight: 400, color: '#4a6070', fontSize: '12px' }}>We&apos;re here to help!</span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setBubbleDismissed(true) }}
            style={{
              position: 'absolute', top: '6px', right: '8px',
              background: 'transparent', border: 'none',
              color: '#9ab', fontSize: '13px', cursor: 'pointer', lineHeight: 1, padding: 0,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Floating bubble button */}
      <button
        onClick={() => { setOpen(o => !o); setBubbleDismissed(true) }}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '58px', height: '58px', borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg,#35d0ff 0%,#1a6aff 100%)',
          boxShadow: '0 4px 24px rgba(53,208,255,.45)',
          cursor: 'pointer', zIndex: 9998,
          fontSize: open ? '22px' : '26px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 32px rgba(53,208,255,.6)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(53,208,255,.45)' }}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? '×' : '🤿'}
      </button>
    </>
  )
}
