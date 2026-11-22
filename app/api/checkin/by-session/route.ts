import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, modeForSessionId } from '@/lib/stripe'
import { createBookingFromSession } from '@/lib/booking'
import { groupGuests } from '@/lib/checkinGroup'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Brücke zwischen Stripe-Erfolgsseite und Check-in.
 *
 * Der Kunde ist nach der Zahlung sofort zurück, der Webhook kann ein paar
 * hundert Millisekunden später sein. Diese Route sagt dem Frontend, ob die
 * Buchung schon existiert, und liefert dann den Check-in-Token.
 *
 * Die Session-ID kennt nur der Käufer (sie steht in seiner success_url), und
 * wir prüfen zusätzlich bei Stripe, dass wirklich bezahlt wurde.
 */
export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get('session_id')

  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return NextResponse.json({ ready: false, error: 'invalid_session' }, { status: 400 })
  }

  // Bezahlung bei Stripe gegenprüfen. Das ist die Wahrheit — nicht was bei uns
  // in der Datenbank steht — und es verhindert, dass eine geratene ID etwas
  // auslöst.
  let cs
  try {
    cs = await getStripe(modeForSessionId(sessionId)).checkout.sessions.retrieve(sessionId)
    if (cs.payment_status !== 'paid') {
      return NextResponse.json({ ready: false, reason: 'unpaid' })
    }
  } catch {
    return NextResponse.json({ ready: false, error: 'invalid_session' }, { status: 404 })
  }

  const supabase = getServiceClient()

  const load = () => supabase
    .from('bookings')
    .select('id, checkin_token, product_name, booking_date, session, group_size, request_state')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()

  let booking = (await load()).data

  // Request-Buchung (Lucas 28.10.): die Buchung existiert schon VOR der Zahlung (stripe_session_id wird bei der Freigabe
  // gesetzt). Ist sie noch nicht 'converted', hat der Webhook die Zahlung noch nicht verbucht → gleicher Rückfall wie unten,
  // über den idempotenten fo_booking_id-Pfad. Sonst bliebe die Buchung bei Webhook-Ausfall ewig pending (kein Platz).
  if (booking && booking.request_state && booking.request_state !== 'converted') {
    try {
      await createBookingFromSession(supabase, cs, !cs.livemode)
      booking = (await load()).data
    } catch (e) {
      console.error('[by-session] Request-Zahlung Rückfall fehlgeschlagen:', e)
    }
  }

  // Zweiter Weg zur Erfüllung. Der Webhook ist der Normalfall, aber er ist nicht
  // die Wahrheit — die liegt bei Stripe und ist oben geprüft. Fällt der Webhook
  // aus (falsche URL, Störung, Signaturproblem), hat der Gast bezahlt und
  // bekäme sonst nie eine Buchung. Der unique index auf stripe_session_id
  // verhindert, dass daraus eine zweite wird.
  if (!booking) {
    try {
      await createBookingFromSession(supabase, cs, !cs.livemode)
      booking = (await load()).data
      if (booking) {
        console.warn(`[by-session] Buchung als Rückfall angelegt — Webhook hat ${sessionId} nicht verarbeitet`)
      }
    } catch (e) {
      console.error('[by-session] Rückfall-Anlage fehlgeschlagen:', e)
    }
  }

  if (!booking) {
    return NextResponse.json({ ready: false, reason: 'pending' })
  }

  // Split-Zahlung: alle Gäste mit Produkt + eigenem Check-in-Link (die Erfolgsseite zeigt sie, statt nur Guest 1 zu öffnen)
  const guests = await groupGuests(supabase, booking.id, true).catch(() => [])

  return NextResponse.json({
    ready: true,
    token: booking.checkin_token,
    guests: guests.length > 1 ? guests : [],
    booking: {
      product_name: booking.product_name,
      booking_date: booking.booking_date,
      session: booking.session,
      group_size: booking.group_size,
    },
  })
}
