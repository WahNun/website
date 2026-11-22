import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureLabel, addLabel } from '@/lib/gmail'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

interface GmailPart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
  headers?: { name: string; value: string }[]
}

function decodeBase64(str: string): string {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractText(part: GmailPart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
  if (part.parts) {
    for (const p of part.parts) {
      const t = extractText(p)
      if (t) return t
    }
  }
  return ''
}

/** Antwort eines Gastes auf ein archiviertes/erledigtes Ticket: automatisch wieder sichtbar machen (nicht nur im Posteingang). */
async function reopenTicketOnReply(supabase: ReturnType<typeof getServiceClient>, ticketId: string) {
  const { error: e1 } = await supabase.from('support_tickets').update({ archived: false }).eq('id', ticketId).eq('archived', true)
  if (e1) console.error('[ticket-reopen] unarchive failed:', e1.message)
  const { error: e2 } = await supabase.from('support_tickets').update({ status: 'open', unclaimed_since: new Date().toISOString() }).eq('id', ticketId).eq('status', 'resolved')
  if (e2) console.error('[ticket-reopen] reopen failed:', e2.message)
}

export async function POST(req: NextRequest) {
  // ── Auth: require logged-in staff ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const supabase = getServiceClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'front_office'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Build a map: gmail threadId → ticket_id for open/claimed tickets only ────
  // Alle Tickets, auch archivierte/erledigte: eine Gast-Antwort holt sie zurück (reopenTicketOnReply)
  const { data: activeTickets } = await supabase
    .from('support_tickets')
    .select('id')

  if (!activeTickets || activeTickets.length === 0) {
    return NextResponse.json({ appended: 0, scanned: 0, message: 'No active tickets with email threads' })
  }

  const activeTicketIds = activeTickets.map(t => t.id)

  // Get all thread IDs from messages of active tickets (non-null gmail_message_id)
  const { data: threadRows } = await supabase
    .from('ticket_messages')
    .select('ticket_id, gmail_message_id')
    .in('ticket_id', activeTicketIds)
    .not('gmail_message_id', 'is', null)

  if (!threadRows || threadRows.length === 0) {
    return NextResponse.json({ appended: 0, scanned: 0, message: 'No email threads in active tickets' })
  }

  // Map: threadId (Gmail thread ID) → ticket_id
  // Outbound messages store the thread ID; inbound messages store the message ID.
  // We need to identify which gmail_message_id values are actually thread IDs.
  // Convention from send-email: outbound rows have gmail_message_id = sentThreadId (thread-level ID).
  // Convention from poll-gmail append: inbound rows have gmail_message_id = messageId (message-level ID).
  // So we build the map from ALL stored IDs and let Gmail's threadId matching handle it.
  const threadIdToTicket = new Map<string, string>()
  for (const row of threadRows) {
    if (row.gmail_message_id) {
      threadIdToTicket.set(row.gmail_message_id, row.ticket_id)
    }
  }

  // Also collect all already-stored message IDs (to skip duplicates)
  const storedMessageIds = new Set(threadRows.map(r => r.gmail_message_id).filter(Boolean))

  // ── Fetch unread Gmail messages ───────────────────────────────────────────────
  let gmailToken: string
  try {
    gmailToken = await getAccessToken()
  } catch {
    return NextResponse.json({ error: 'Gmail auth failed' }, { status: 500 })
  }

  // Label statt Gelesen-Status: nichts in diesem System darf eine Mail aus
  // dem Posteingang des Teams nehmen oder als gelesen markieren. Wer in
  // Gmail arbeitet, soll sich auf den Ungelesen-Status verlassen koennen.
  let triagedLabelId: string | null = null
  try {
    triagedLabelId = await ensureLabel(gmailToken, 'AZD/Triaged')
  } catch (e) {
    console.error('[refresh-ticket-emails] ensureLabel failed:', e instanceof Error ? e.message : e)
  }

  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox&maxResults=50',
    { headers: { Authorization: `Bearer ${gmailToken}` } }
  )
  const listData = await listRes.json() as { messages?: { id: string }[] }
  const messages = listData.messages ?? []

  let appended = 0

  for (const { id } of messages) {
    // Skip if we already stored this message ID
    if (storedMessageIds.has(id)) continue

    // Fetch full message to get threadId
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${gmailToken}` } }
    )
    const msg = await msgRes.json() as { id: string; threadId: string; payload: GmailPart }

    // Check if this thread belongs to an active ticket
    const ticketId = threadIdToTicket.get(msg.threadId)
    if (!ticketId) continue  // not related to any active ticket — skip

    // Extract sender and body
    const headers = msg.payload.headers ?? []
    const fromHeader = headers.find(h => h.name === 'From')?.value ?? ''
    const match = fromHeader.match(/^(.+?)\s*<([^>]+)>$/)
    const fromEmail = match ? match[2] : fromHeader
    const body = extractText(msg.payload)

    // Append to ticket
    const { error: insertErr } = await supabase.from('ticket_messages').insert({
      ticket_id: ticketId,
      direction: 'inbound',
      from_email: fromEmail,
      body_text: body,
      gmail_message_id: id,
      attachments: [],
    })

    if (!insertErr) {
      // Add AZD/Triaged — never removeLabelIds, never UNREAD. The mail stays
      // unread and in the inbox; the label only keeps it out of the polling
      // query so it is not fetched again on every run.
      if (triagedLabelId) {
        try { await addLabel(gmailToken, id, triagedLabelId) }
        catch (labelErr) {
          console.error('[refresh-ticket-emails] label error:', labelErr instanceof Error ? labelErr.message : labelErr)
        }
      }
      appended++
      await reopenTicketOnReply(supabase, ticketId)
      console.log(`[refresh-ticket-emails] appended to ticket=${ticketId} from=${fromEmail}`)
    }
  }

  return NextResponse.json({ appended, scanned: messages.length })
}
