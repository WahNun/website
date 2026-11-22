import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { reportError } from '@/lib/errors'
import { sendCheckinInvite } from '@/lib/email'

export const runtime = 'nodejs'

const TOKEN_RE = /^[a-f0-9]{32}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

function serviceClient(): Db {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function genToken(): string {
  return randomBytes(16).toString('hex')
}

interface InviteRequest {
  token: string
  invites: Array<{ slot_index: number; email: string }>
}

export interface InviteResult {
  slot_index: number
  email: string
  ok: boolean
  error?: string
  ref?: string
  http_status?: number
}

// POST /api/checkin/invite
//
// Erzeugt je Eintrag einen invite_token, schreibt invite_email und
// invite_sent_at und verschickt die Einladungs-Mail. Nur der Buchungs-Token
// (bookings.checkin_token) ist zulässig — ein Eingeladener darf nicht
// weiterleiten.
export async function POST(req: NextRequest) {
  let body: InviteRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, invites } = body

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
  }
  if (!Array.isArray(invites) || invites.length === 0) {
    return NextResponse.json({ success: false, error: 'No invites provided' }, { status: 400 })
  }

  const supabase = serviceClient()

  // Nur Buchungs-Token zulässig
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, checkin_token_expires_at, status, is_test, customer_email, product_name, booking_date')
    .eq('checkin_token', token)
    .maybeSingle()

  if (!booking) {
    return NextResponse.json({ success: false, error: 'Invalid or expired token', http_status: 400 }, { status: 400 })
  }
  if (booking.status === 'cancelled') {
    return NextResponse.json({ success: false, error: 'Booking is no longer active', http_status: 400 }, { status: 400 })
  }
  if (booking.checkin_token_expires_at && new Date(booking.checkin_token_expires_at) < new Date()) {
    return NextResponse.json({ success: false, error: 'Token expired', http_status: 400 }, { status: 400 })
  }

  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://azoresdiving.com').replace(/\/$/, '')
  const results: InviteResult[] = []
  const now = new Date().toISOString()

  for (const invite of invites) {
    const { slot_index, email } = invite

    if (!EMAIL_RE.test(email)) {
      results.push({ slot_index, email, ok: false, error: 'Invalid email address', http_status: 422 })
      continue
    }

    const { data: slot, error: slotErr } = await supabase
      .from('booking_customers')
      .select('id, checkin_completed_at')
      .eq('booking_id', booking.id)
      .eq('slot_index', slot_index)
      .maybeSingle()

    if (slotErr || !slot) {
      results.push({ slot_index, email, ok: false, error: 'Slot not found', http_status: 404 })
      continue
    }
    if (slot.checkin_completed_at) {
      results.push({ slot_index, email, ok: false, error: 'Slot already completed', http_status: 409 })
      continue
    }

    const inviteToken = genToken()
    const checkinUrl = `${siteOrigin}/checkin?token=${inviteToken}`

    // Token zuerst schreiben; scheitert der Versand danach, liegt ein gültiger
    // Token vor, den der nächste Sendeversuch überschreibt.
    const { error: updateErr } = await supabase
      .from('booking_customers')
      .update({
        invite_email: email.toLowerCase().trim(),
        invite_token: inviteToken,
        invite_sent_at: now,
        updated_at: now,
      })
      .eq('id', slot.id)

    if (updateErr) {
      const ref = await reportError('chk', updateErr, {
        route: '/api/checkin/invite', step: 'slot_update', slot_index, booking_id: booking.id,
      })
      results.push({ slot_index, email, ok: false, error: updateErr.message, ref, http_status: 500 })
      continue
    }

    const mailResult = await sendCheckinInvite({
      to: email,
      inviterEmail: booking.customer_email ?? null,
      productName: booking.product_name ?? 'your dive',
      diveDate: booking.booking_date ?? null,
      checkinUrl,
      isTest: booking.is_test,
      bookingId: booking.id,
    })

    if (!mailResult.ok) {
      const ref = await reportError('chk', new Error(mailResult.error ?? 'mail send failed'), {
        route: '/api/checkin/invite', step: 'send_mail', slot_index, booking_id: booking.id,
      })
      results.push({ slot_index, email, ok: false, error: mailResult.error ?? 'Mail delivery failed', ref, http_status: 502 })
      continue
    }

    results.push({ slot_index, email, ok: true })
  }

  const allOk = results.every(r => r.ok)
  const anyOk = results.some(r => r.ok)

  return NextResponse.json(
    { success: anyOk || results.length === 0, partial: !allOk && anyOk, results },
    { status: allOk ? 200 : anyOk ? 207 : 422 }
  )
}
