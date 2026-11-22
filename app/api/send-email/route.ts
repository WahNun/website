import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`Token exchange failed ${res.status}: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

function buildMime(opts: {
  to: string
  subject: string
  textBody: string
  htmlBody: string
  attachments?: Array<{ filename: string; content: string; mimeType: string }>
}): string {
  const innerBoundary = 'azd_alt_' + Date.now()
  const outerBoundary = 'azd_mix_' + (Date.now() + 1)
  const hasAtt = opts.attachments && opts.attachments.length > 0

  const lines: string[] = [
    `From: "Azores Diving" <azoresdiving@gmail.com>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/${hasAtt ? 'mixed' : 'alternative'}; boundary="${hasAtt ? outerBoundary : innerBoundary}"`,
    ``,
  ]

  if (hasAtt) {
    lines.push(
      `--${outerBoundary}`,
      `Content-Type: multipart/alternative; boundary="${innerBoundary}"`,
      ``,
    )
  }

  lines.push(
    `--${innerBoundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    opts.textBody,
    ``,
    `--${innerBoundary}`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    opts.htmlBody,
    ``,
    `--${innerBoundary}--`,
  )

  if (hasAtt) {
    for (const att of opts.attachments!) {
      lines.push(
        ``,
        `--${outerBoundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        att.content.match(/.{1,76}/g)!.join('\r\n'),
      )
    }
    lines.push(``, `--${outerBoundary}--`)
  }

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildHtml(text: string, staffName: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Azores Diving</title>
</head>
<body bgcolor="#04101F" style="margin:0;padding:0;background-color:#04101F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#04101F" style="min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td bgcolor="#0A1F3D" style="border-radius:12px;padding:40px 36px;">
              <p style="margin:0 0 24px 0;font-size:17px;line-height:1.7;color:#E8F1FB;">${escaped}</p>
              <hr style="border:none;border-top:1px solid rgba(53,208,255,0.15);margin:28px 0;">
              <p style="margin:0 0 16px 0;font-size:14px;color:#7FA6C9;line-height:1.8;">
                Kind regards,<br>
                <strong style="color:#E8F1FB;">${staffName}</strong><br>
                Azores Diving Team<br>
                <a href="https://www.azoresdiving.com" style="color:#35D0FF;text-decoration:none;">azoresdiving.com</a>
              </p>

            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:32px;">
              <img src="https://www.azoresdiving.com/logo.png" alt="Azores Diving" width="110" style="display:block;max-width:110px;margin:0 auto 16px;">
              <p style="margin:0;font-size:11px;color:#4A6A8A;line-height:1.9;letter-spacing:0.03em;">
                Marina P&ecirc;ro de Teive, Quiosque A &middot; 9500-771 Ponta Delgada, S&atilde;o Miguel, Azores<br>
                +351 927 382 023 &middot; azoresdiving@gmail.com<br>
                Daily 8:00&ndash;20:00
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:20px;">
              <p style="margin:0;font-size:11px;color:#2E4A63;line-height:1.7;max-width:480px;">Make the most of your stay! You can book activities with us such as whale watching, swimming with dolphins, van or jeep tours, hiking trails, and much more. For car rentals, we recommend getting in touch with our partners at <a href="https://primeazores.pt/" style="color:#2E6A8A;text-decoration:none;">primeazores</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────
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

  // ── 2. Role check ────────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'front_office'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const staffName: string = (profile as { role: string; name?: string }).name
    ?? user.email?.split('@')[0]
    ?? 'Azores Diving'

  // ── 3. Parse body ────────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { to, subject, text, ticket_id, attachments } = body as {
    to?: string; subject?: string; text?: string; ticket_id?: string
    attachments?: Array<{ filename: string; content: string; mimeType: string }>
  }

  if (!to || !subject || !text) {
    return NextResponse.json({ error: 'Missing required fields: to, subject, text' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // ── 4. Look up existing Gmail thread for this ticket ─────────────────────────
  // So the reply lands in the same thread and poll-gmail can match future replies
  let existingThreadId: string | null = null
  if (ticket_id) {
    const { data: existingMsg } = await supabase
      .from('ticket_messages')
      .select('gmail_message_id')
      .eq('ticket_id', ticket_id)
      .not('gmail_message_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    existingThreadId = existingMsg?.gmail_message_id ?? null
  }

  // ── 5. Build email content ───────────────────────────────────────────────────
  const signature = `\n\nKind regards,\n${staffName}\nAzores Diving Team\nazoresdiving.com\n\n---\nMake the most of your stay! You can book activities with us such as whale watching, swimming with dolphins, van or jeep tours, hiking trails, and much more. For car rentals, we recommend getting in touch with our partners at https://primeazores.pt/`
  const fullText = text + signature
  const raw = buildMime({ to, subject, textBody: fullText, htmlBody: buildHtml(text, staffName), attachments: attachments ?? [] })

  // ── 6. Send via Gmail API ────────────────────────────────────────────────────
  let sentThreadId: string | null = null
  try {
    const gmailToken = await getAccessToken()
    const sendBody: Record<string, string> = { raw }
    if (existingThreadId) sendBody.threadId = existingThreadId

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gmailToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendBody),
    })

    if (!sendRes.ok) {
      const errData = await sendRes.json()
      console.error('[send-email] Gmail API error:', errData)
      return NextResponse.json({ error: `Gmail API ${sendRes.status}: ${JSON.stringify(errData)}` }, { status: 500 })
    }

    const sent = await sendRes.json() as { id: string; threadId: string }
    sentThreadId = sent.threadId ?? null
    console.log(`[send-email] sent message=${sent.id} thread=${sentThreadId}`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to send email'
    console.error('[send-email] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ── 7. Persist to ticket_messages + audit_log ────────────────────────────────
  if (ticket_id) {
    const [msgResult, auditResult] = await Promise.all([
      supabase.from('ticket_messages').insert({
        ticket_id,
        direction: 'outbound',
        from_email: user.email ?? 'azoresdiving@gmail.com',
        body_text: fullText,
        // Save thread ID so poll-gmail can match future inbound replies
        gmail_message_id: sentThreadId,
        attachments: [],
      }),
      supabase.from('audit_log').insert({
        ticket_id,
        user_id: user.id,
        user_email: user.email,
        action_type: 'email_sent',
        new_value: { to, subject, preview: text.slice(0, 300), thread_id: sentThreadId },
      }),
    ])
    if (msgResult.error) console.error('[send-email] ticket_messages error:', msgResult.error)
    if (auditResult.error) console.error('[send-email] audit_log error:', auditResult.error)
  }

  return NextResponse.json({ success: true })
}
