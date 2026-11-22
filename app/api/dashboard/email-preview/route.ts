import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

// ── Auth ──────────────────────────────────────────────────────────────────────
async function requireAdmin(): Promise<{ userId: string; email: string } | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminSb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
  const { data: profile } = await adminSb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { userId: user.id, email: user.email ?? user.id }
}

// ── Shell ─────────────────────────────────────────────────────────────────────
import {
  capturePreview,
  sendBookingConfirmation,
  sendMedicalClearanceRequired,
  sendCheckinReminderAfterBooking,
  sendCheckinReminderWeekBefore,
  sendCheckinReminderTwoDays,
  sendCheckinReminderFinal,
  sendCheckinInvite,
  sendPostDive,
  sendWishGranted,
  sendPaymentRequestEmail,
  sendCancellationEmail,
  sendPaymentReceived,
  sendRefundEmail,
  sendSessionTimesEmail,
  sendBookingRequestReceived,
  sendBookingRequestApproved,
  sendBookingRequestDeclined,
  sendBookingRequestReopened,
  type CapturedMail,
} from '@/lib/email'

/**
 * Vorschau = die ECHTEN Versandfunktionen aus lib/email.ts mit Beispieldaten, abgefangen über
 * capturePreview(). Es gibt keinen zweiten Template-Satz mehr — was hier steht, geht so raus.
 * Neue Mail-Variante? Hier einen Eintrag ergänzen (und in Members.tsx EMAIL_KINDS das Label).
 */

const SAMPLE = {
  to: 'preview@azoresdiving.com',
  name: 'Maria Costa',
  email: 'maria@example.com',
  date1: '2026-10-15',
  date2: '2026-10-16',
  product: 'Daily Double Dive',
  checkinUrl: 'https://www.azoresdiving.com/checkin?token=sample123',
  bookingId: 'a1b2c3d4-0000-4000-8000-000000000000',
  spotSlug: 'arco-do-espelho',
  spotName: 'Arco do Espelho',
  checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_sample',
}
const sessions1 = [{ date: SAMPLE.date1, session: 'am' }]
const sessions2 = [{ date: SAMPLE.date1, session: 'am' }, { date: SAMPLE.date2, session: 'pm' }]
type Diver = { name: string | null; slotIndex: number; checkinUrl: string }
const divers1: Diver[] = [{ name: SAMPLE.name, slotIndex: 0, checkinUrl: SAMPLE.checkinUrl }]
const divers2: Diver[] = [{ name: SAMPLE.name, slotIndex: 0, checkinUrl: SAMPLE.checkinUrl }, { name: null, slotIndex: 1, checkinUrl: SAMPLE.checkinUrl + '&slot=1' }]

const EMAIL_KINDS = [
  'booking_confirmation',
  'booking_confirmation_deposit',
  'booking_confirmation_group',
  'after_booking',
  'week_before',
  'two_days',
  'final',
  'checkin_invite',
  'medical',
  'post_dive',
  'post_dive_wish_granted',
  'wish_granted',
  'session_times',
  'cancellation',
  'cancellation_with_refund',
  'refund_full',
  'refund_partial',
  'refund_cash',
  'refund_bank',
  'refund_revolut',
  'booking_request_received',
  'booking_request_approved',
  'booking_request_approved_deposit',
  'booking_request_approved_moved',
  'booking_request_approved_shortened',
  'booking_request_renewed',
  'booking_request_reopened',
  'booking_request_declined',
  'payment_request_link',
  'payment_request_revolut',
  'payment_request_bank',
  'payment_request_link_full',
  'payment_request_revolut_full',
  'payment_request_bank_full',
  'payment_received_partial',
  'payment_received_full',
  'payment_received_full_checkin',
  'payment_received_overpaid',
] as const
type EmailKind = (typeof EMAIL_KINDS)[number]

async function triggerEmail(kind: EmailKind, isTest: boolean): Promise<void> {
  const base = { isTest, bookingId: SAMPLE.bookingId }
  const reminder = (divers: Diver[]) => ({ to: SAMPLE.to, divers, firstDiveDate: SAMPLE.date1, productName: SAMPLE.product, favouriteSpot: { slug: SAMPLE.spotSlug, name: SAMPLE.spotName }, ...base })
  switch (kind) {
    case 'booking_confirmation':
      await sendBookingConfirmation({ to: SAMPLE.to, customerName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions1, checkinUrl: SAMPLE.checkinUrl, groupSize: 1, amountCents: 9900, hasOwnInsurance: true, favouriteSpot: { slug: SAMPLE.spotSlug, name: SAMPLE.spotName }, ...base }); return
    case 'booking_confirmation_deposit':
      await sendBookingConfirmation({ to: SAMPLE.to, customerName: SAMPLE.name, productName: '4-Dive Pack', sessions: sessions2, checkinUrl: SAMPLE.checkinUrl, groupSize: 1, amountCents: 13950, balanceDueCents: 13950, hasOwnInsurance: false, ...base }); return
    case 'booking_confirmation_group':
      await sendBookingConfirmation({ to: SAMPLE.to, customerName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions1, checkinUrl: SAMPLE.checkinUrl, groupSize: 3, amountCents: 29700, hasOwnInsurance: false, ...base }); return
    case 'after_booking':  await sendCheckinReminderAfterBooking(reminder(divers1)); return
    case 'week_before':    await sendCheckinReminderWeekBefore(reminder(divers2)); return
    case 'two_days':       await sendCheckinReminderTwoDays(reminder(divers1)); return
    case 'final':          await sendCheckinReminderFinal(reminder(divers1)); return
    case 'checkin_invite':
      await sendCheckinInvite({ to: SAMPLE.to, inviterEmail: SAMPLE.email, productName: SAMPLE.product, diveDate: SAMPLE.date1, checkinUrl: SAMPLE.checkinUrl + '&slot=1', ...base }); return
    case 'medical':
      await sendMedicalClearanceRequired({ to: SAMPLE.to, customerName: SAMPLE.name, reasons: ['Asthma or wheezing in the last 12 months', 'Currently taking prescription medication'], medical_answers: { q3: true, q10: true }, firstDiveDate: SAMPLE.date1, ...base }); return
    case 'post_dive':
      await sendPostDive({ to: SAMPLE.to, firstName: SAMPLE.name.split(' ')[0], spots: ['Dori Wreck', SAMPLE.spotName], wishGranted: false, wishSpotName: null, ...base }); return
    case 'post_dive_wish_granted':
      await sendPostDive({ to: SAMPLE.to, firstName: SAMPLE.name.split(' ')[0], spots: [SAMPLE.spotName, 'Dori Wreck'], wishGranted: true, wishSpotName: SAMPLE.spotName, ...base }); return
    case 'wish_granted':
      await sendWishGranted({ to: SAMPLE.to, firstName: SAMPLE.name.split(' ')[0], spotName: SAMPLE.spotName, ...base }); return
    case 'session_times':
      await sendSessionTimesEmail({ to: SAMPLE.to, customerName: SAMPLE.name, productName: 'Open Water Diver', sessions: [{ date: SAMPLE.date1, session: 'am' }, { date: SAMPLE.date2, session: 'pm', notes: 'Boat dives' }], ...base }); return
    case 'cancellation':
      await sendCancellationEmail({ customerName: SAMPLE.name, customerEmail: SAMPLE.to, productName: SAMPLE.product, sessions: `${SAMPLE.date1}:am`, amountCents: 9900, isTest, refunded: false }); return
    case 'cancellation_with_refund':
      await sendCancellationEmail({ customerName: SAMPLE.name, customerEmail: SAMPLE.to, productName: SAMPLE.product, sessions: `${SAMPLE.date1}:am`, amountCents: 9900, isTest, refunded: true }); return
    case 'refund_full':
      await sendRefundEmail({ customerName: SAMPLE.name, customerEmail: SAMPLE.to, productName: SAMPLE.product, amountCents: 9900, isPartial: false, isTest, method: 'stripe', bookingId: SAMPLE.bookingId, description: 'Trip cancelled by guest' }); return
    case 'refund_partial':
      await sendRefundEmail({ customerName: SAMPLE.name, customerEmail: SAMPLE.to, productName: '4-Dive Pack', amountCents: 2000, isPartial: true, isTest, method: 'stripe', bookingId: SAMPLE.bookingId, description: 'Gloves not used' }); return
    case 'refund_cash':
      await sendRefundEmail({ customerName: SAMPLE.name, customerEmail: SAMPLE.to, productName: SAMPLE.product, amountCents: 1000, isPartial: true, isTest, method: 'cash', bookingId: SAMPLE.bookingId, description: '15L tank not needed' }); return
    case 'refund_bank':
      await sendRefundEmail({ customerName: SAMPLE.name, customerEmail: SAMPLE.to, productName: SAMPLE.product, amountCents: 9900, isPartial: false, isTest, method: 'bank', bookingId: SAMPLE.bookingId, description: 'Weather cancellation' }); return
    case 'refund_revolut':
      await sendRefundEmail({ customerName: SAMPLE.name, customerEmail: SAMPLE.to, productName: SAMPLE.product, amountCents: 4950, isPartial: true, isTest, method: 'revolut', bookingId: SAMPLE.bookingId, description: 'Day 2 cancelled' }); return
    case 'booking_request_received':
      await sendBookingRequestReceived({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions2, groupSize: 2, totalCents: 39600, ...base }); return
    case 'booking_request_approved':
      await sendBookingRequestApproved({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions2, groupSize: 2, totalCents: 39600, confirmUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000', declineUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000?reply=1', amountCents: 39600, isDeposit: false, approvedUntil: new Date(Date.now() + 72 * 3600_000).toISOString(), ...base }); return
    case 'booking_request_approved_deposit':
      await sendBookingRequestApproved({ to: SAMPLE.to, guestName: SAMPLE.name, productName: 'Open Water Diver', sessions: sessions2, groupSize: 1, totalCents: 46000, confirmUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000', declineUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000?reply=1', amountCents: 23000, isDeposit: true, approvedUntil: new Date(Date.now() + 72 * 3600_000).toISOString(), ...base }); return
    case 'booking_request_approved_moved':
      await sendBookingRequestApproved({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: [{ date: SAMPLE.date2, session: 'am' }], groupSize: 2, totalCents: 19800, confirmUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000', declineUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000?reply=1', amountCents: 19800, isDeposit: false, approvedUntil: new Date(Date.now() + 72 * 3600_000).toISOString(), requestedSessions: [{ date: SAMPLE.date1, session: 'am' }], ...base }); return
    case 'booking_request_approved_shortened':
      await sendBookingRequestApproved({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: [{ date: SAMPLE.date2, session: 'am' }], groupSize: 2, totalCents: 19800, confirmUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000', declineUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000?reply=1', amountCents: 19800, isDeposit: false, approvedUntil: new Date(Date.now() + 72 * 3600_000).toISOString(), requestedSessions: [{ date: SAMPLE.date1, session: 'am' }, { date: SAMPLE.date2, session: 'am' }], shortenedFrom: { productName: '4-Dive Pack', amountCents: 37800 }, ...base }); return
    case 'booking_request_renewed':
      await sendBookingRequestApproved({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions1, groupSize: 1, totalCents: 9900, confirmUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000', declineUrl: 'https://www.azoresdiving.com/request/sampletoken0000000000000000000000?reply=1', amountCents: 9900, isDeposit: false, approvedUntil: new Date(Date.now() + 48 * 3600_000).toISOString(), renewed: true, ...base }); return
    case 'booking_request_reopened':
      await sendBookingRequestReopened({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, message: 'The 16th is my arrival day — anything from the 17th works.', ...base }); return
    case 'booking_request_declined':
      await sendBookingRequestDeclined({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions2, groupSize: 2, totalCents: 39600, reason: 'No boat on 15 October (private charter). We have space on 16 or 17 October — just reply with the day that suits you and we send a new link.', ...base }); return
    case 'payment_request_link':
      await sendPaymentRequestEmail({ to: SAMPLE.to, guestName: SAMPLE.name, productName: '4-Dive Pack', sessions: sessions2, amountCents: 13950, totalAmountCents: 27900, isDeposit: true, checkoutUrl: SAMPLE.checkoutUrl, paymentMethod: 'link', ...base }); return
    case 'payment_request_revolut':
      await sendPaymentRequestEmail({ to: SAMPLE.to, guestName: SAMPLE.name, productName: '4-Dive Pack', sessions: sessions2, amountCents: 13950, totalAmountCents: 27900, isDeposit: true, paymentMethod: 'revolut', ...base }); return
    case 'payment_request_bank':
      await sendPaymentRequestEmail({ to: SAMPLE.to, guestName: SAMPLE.name, productName: '4-Dive Pack', sessions: sessions2, amountCents: 13950, totalAmountCents: 27900, isDeposit: true, paymentMethod: 'bank', ...base }); return
    case 'payment_request_link_full':
      await sendPaymentRequestEmail({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions1, amountCents: 9900, isDeposit: false, checkoutUrl: SAMPLE.checkoutUrl, paymentMethod: 'link', ...base }); return
    case 'payment_request_revolut_full':
      await sendPaymentRequestEmail({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions1, amountCents: 9900, isDeposit: false, paymentMethod: 'revolut', ...base }); return
    case 'payment_request_bank_full':
      await sendPaymentRequestEmail({ to: SAMPLE.to, guestName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions1, amountCents: 9900, isDeposit: false, paymentMethod: 'bank', ...base }); return
    case 'payment_received_partial':
      await sendPaymentReceived({ to: SAMPLE.to, customerName: SAMPLE.name, productName: '4-Dive Pack', sessions: sessions2, amountCents: 5000, paidTotalCents: 18950, totalCents: 27900, methodLabel: 'bank transfer', checkinUrl: SAMPLE.checkinUrl, ...base }); return
    case 'payment_received_full':
      await sendPaymentReceived({ to: SAMPLE.to, customerName: SAMPLE.name, productName: '4-Dive Pack', sessions: sessions2, amountCents: 13950, paidTotalCents: 27900, totalCents: 27900, methodLabel: 'card (Stripe)', checkinUrl: null, ...base }); return
    case 'payment_received_full_checkin':
      await sendPaymentReceived({ to: SAMPLE.to, customerName: SAMPLE.name, productName: '4-Dive Pack', sessions: sessions2, amountCents: 13950, paidTotalCents: 27900, totalCents: 27900, methodLabel: 'cash', checkinUrl: SAMPLE.checkinUrl, ...base }); return
    case 'payment_received_overpaid':
      await sendPaymentReceived({ to: SAMPLE.to, customerName: SAMPLE.name, productName: SAMPLE.product, sessions: sessions1, amountCents: 1000, paidTotalCents: 10900, totalCents: 9900, methodLabel: 'cash', checkinUrl: null, ...base }); return
  }
}

async function renderEmail(kind: EmailKind, isTest: boolean): Promise<{ subject: string; html: string; text: string }> {
  const captured: CapturedMail[] = await capturePreview(() => triggerEmail(kind, isTest))
  const m = captured[0]
  if (!m) throw new Error(`Template for "${kind}" produced no email`)
  return { subject: m.subject, html: m.html, text: m.text }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const kind = (searchParams.get('kind') ?? 'booking_confirmation') as EmailKind
  const isTest = searchParams.get('test') === '1'

  if (!EMAIL_KINDS.includes(kind)) {
    return NextResponse.json({ error: `Unknown kind. Valid: ${EMAIL_KINDS.join(', ')}` }, { status: 400 })
  }
  if (searchParams.get('list') === '1') return NextResponse.json({ kinds: EMAIL_KINDS })

  try {
    const result = await renderEmail(kind, isTest)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// ── POST — send test email (an den eingeloggten Admin; gleiche Vorlage wie die Vorschau) ──
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.kind) return NextResponse.json({ error: 'kind required' }, { status: 400 })

  const kind = body.kind as EmailKind
  if (!EMAIL_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
  }

  let subject: string, html: string, text: string
  try { ({ subject, html, text } = await renderEmail(kind, true)) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }) }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 503 })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({ from: 'Azoresdiving <info@azoresdiving.com>', to: [auth.email], subject, html, text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: 'Send failed', detail: err }, { status: 502 })
  }
  return NextResponse.json({ ok: true, to: auth.email, subject })
}
