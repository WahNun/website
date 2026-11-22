import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/triage'
import { getAccessToken, ensureLabel, addLabel } from '@/lib/gmail'
import { recordHeartbeat } from '@/lib/heartbeat'

// Allow up to 30s for Gmail API calls
export const maxDuration = 30

// ── Email body extraction ────────────────────────────────────────────────────
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

// No pre-filter for automated senders: measured hit rate was 0% — every
// flagged match turned out to be a real booking inquiry from a contact form.
// A regex on the sender domain cannot distinguish "no-reply address, but real
// customer inquiry in the body". mistral-small cost at current volume is
// negligible.

// ── Main handler (called by Vercel Cron) ──────────────────────────────────────
/** Antwort eines Gastes auf ein archiviertes/erledigtes Ticket: automatisch wieder sichtbar machen (nicht nur im Posteingang). */
async function reopenTicketOnReply(supabase: ReturnType<typeof getServiceClient>, ticketId: string) {
  const { error: e1 } = await supabase.from('support_tickets').update({ archived: false }).eq('id', ticketId).eq('archived', true)
  if (e1) console.error('[ticket-reopen] unarchive failed:', e1.message)
  const { error: e2 } = await supabase.from('support_tickets').update({ status: 'open', unclaimed_since: new Date().toISOString() }).eq('id', ticketId).eq('status', 'resolved')
  if (e2) console.error('[ticket-reopen] reopen failed:', e2.message)
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    await recordHeartbeat('poll-gmail', false, 'unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'gmail_not_configured' })
  }

  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[poll-gmail] auth error:', msg)
    await recordHeartbeat('poll-gmail', false, `auth error: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const supabase = getServiceClient()

  // Resolve the marker-label ID once per invocation (cached across warm requests)
  let triagedLabelId: string | null = null
  try {
    triagedLabelId = await ensureLabel(token, 'AZD/Triaged')
  } catch (err) {
    console.error('[poll-gmail] ensureLabel error:', err instanceof Error ? err.message : err)
  }

  // 1. List unread inbox messages not yet marked as triaged
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox+-label:AZD/Triaged&maxResults=20',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const listData = await listRes.json() as { messages?: { id: string }[]; error?: { message?: string; code?: number } }
  if (!listRes.ok) {
    const detail = listData.error?.message ?? `HTTP ${listRes.status}`
    const msg = `Gmail list failed: ${detail}`
    console.error('[poll-gmail]', msg)
    await recordHeartbeat('poll-gmail', false, msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
  const messages = listData.messages ?? []

  let appended = 0, logged = 0, labelled = 0, label_errors = 0

  for (const { id } of messages) {
    // 2. Fetch full message
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const msg = await msgRes.json() as { id: string; threadId: string; payload: GmailPart }

    const headers = msg.payload.headers ?? []
    const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)'
    const fromHeader = headers.find(h => h.name === 'From')?.value ?? ''
    const body = extractText(msg.payload)

    const match = fromHeader.match(/^(.+?)\s*<([^>]+)>$/)
    const fromName = match ? match[1].replace(/"/g, '').trim() : fromHeader
    const fromEmail = match ? match[2] : fromHeader

    // 3. Check if this is a reply to an existing ticket thread.
    //    This runs ALWAYS — even in dry-run mode — so that contact-form tickets
    //    and manually-created tickets continue to receive replies.
    const { data: existingMsgs } = await supabase
      .from('ticket_messages')
      .select('ticket_id')
      .eq('gmail_message_id', msg.threadId)
      .limit(1)

    const existingMsg = existingMsgs?.[0] ?? null

    if (existingMsg?.ticket_id) {
      // Reply to existing ticket — check if this specific message was already inserted
      const { data: dupeMsgCheck } = await supabase
        .from('ticket_messages')
        .select('id')
        .eq('gmail_message_id', id)
        .limit(1)
      if (dupeMsgCheck?.length) {
        // Already processed this specific message → no second insert.
        // The label is set anyway: the dedup hit proves the message is
        // recorded, and without it the mail never leaves the query window
        // and gets re-fetched on every run, forever.
        if (triagedLabelId) {
          try { await addLabel(token, id, triagedLabelId); labelled++ }
          catch (labelErr) {
            console.error('[poll-gmail] label error (known ticket msg):', labelErr instanceof Error ? labelErr.message : labelErr)
            label_errors++
          }
        }
        continue
      }
      // Append WITHOUT marking as read — only mark as read when viewed in ticket UI
      const { error: insertErr } = await supabase.from('ticket_messages').insert({
        ticket_id: existingMsg.ticket_id,
        direction: 'inbound',
        from_email: fromEmail,
        body_text: body,
        gmail_message_id: id,
        attachments: [],
      })
      if (insertErr) {
        console.error('[poll-gmail] append error:', insertErr)
      } else {
        appended++
        console.log(`[poll-gmail] appended reply to ticket=${existingMsg.ticket_id} from=${fromEmail}`)
        await reopenTicketOnReply(supabase, existingMsg.ticket_id)
        if (triagedLabelId) {
          try {
            await addLabel(token, id, triagedLabelId)
            labelled++
          } catch (labelErr) {
            console.error('[poll-gmail] label error (append):', labelErr instanceof Error ? labelErr.message : labelErr)
            label_errors++
          }
        }
      }
      continue
    }

    // 4. New email (not a reply to existing ticket) — log to triage, no pre-filter.
    //    Classification happens asynchronously via /api/triage-classify.

    // Check if this message was already logged to triage (dedup without marking as read)
    const { data: dupeTriageCheck } = await supabase
      .from('email_triage_log')
      .select('id')
      .eq('gmail_message_id', id)
      .limit(1)
    if (dupeTriageCheck?.length) {
      // Already in triage — no second insert, and still not marked as read.
      // The label is set anyway, same reason as above: otherwise the mail
      // stays in the query window forever.
      if (triagedLabelId) {
        try { await addLabel(token, id, triagedLabelId); labelled++ }
        catch (labelErr) {
          console.error('[poll-gmail] label error (known triage row):', labelErr instanceof Error ? labelErr.message : labelErr)
          label_errors++
        }
      }
      continue
    }

    // Log to triage WITHOUT marking as read — emails stay unread in Gmail
    // until staff explicitly reads them in the ticket system.
    const { error: triageErr } = await supabase.from('email_triage_log').insert({
      from_email: fromEmail,
      from_name: fromName || null,
      subject,
      body_preview: body.slice(0, 3000),
      pre_filter_blocked: false,
      mistral_result: null,
      final_result: 'pending',
      gmail_message_id: id,
      gmail_thread_id: msg.threadId,
    })

    if (triageErr) {
      console.error('[poll-gmail] triage insert error:', triageErr)
    } else {
      logged++
      console.log(`[poll-gmail] triage-logged: ${fromEmail} | ${subject}`)
      if (triagedLabelId) {
        try {
          await addLabel(token, id, triagedLabelId)
          labelled++
        } catch (labelErr) {
          console.error('[poll-gmail] label error (triage):', labelErr instanceof Error ? labelErr.message : labelErr)
          label_errors++
        }
      }
    }
  }

  const summary = { mode: 'triage-only', processed: messages.length, appended, triage_logged: logged, labelled, label_errors }

  console.log(`[poll-gmail] ${JSON.stringify(summary)}`)
  await recordHeartbeat('poll-gmail', true, `${messages.length} fetched, ${appended} appended, ${logged} triage-logged`)
  return NextResponse.json(summary)
}
