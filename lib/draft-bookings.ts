import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export type DraftBookingParams = {
  product_id?: string
  date?: string
  session?: 'AM' | 'PM' | 'NIGHT'
  num_divers?: number
  customer_email?: string
  customer_name?: string
  metadata?: Record<string, unknown>
}

export type DraftItemParams = {
  item_type?: 'capacity' | 'addon'
  product_id?: string
  quantity?: number
  price_cents?: number
  metadata?: Record<string, unknown>
}

export async function createDraft(
  params: DraftBookingParams,
  items?: DraftItemParams[],
  ip?: string,
) {
  const db = serviceClient()

  // IP-based draft cap: max 3 active drafts per IP in the last 10 minutes
  if (ip) {
    const { count: ipCount, error: ipErr } = await db
      .from('draft_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('created_by_ip', ip)
      .in('status', ['active', 'checked_out'])
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    if (ipErr) throw ipErr
    if ((ipCount ?? 0) >= 3) throw new Error('RATE_LIMIT_EXCEEDED')
  }

  // Hard capacity cap: max max_party * 2 active/confirmed slots per product + date
  if (params.product_id && params.date) {
    const { data: product } = await db
      .from('course_prices')
      .select('max_students_per_instructor')
      .eq('id', params.product_id)
      .maybeSingle()
    const maxParty: number = (product?.max_students_per_instructor as number | null) ?? 6

    const { count: slotCount, error: slotErr } = await db
      .from('draft_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', params.product_id)
      .eq('date', params.date)
      .in('status', ['active', 'checked_out', 'confirmed'])
    if (slotErr) throw slotErr
    if ((slotCount ?? 0) >= maxParty * 2) throw new Error('CAPACITY_CAP_EXCEEDED')
  }

  const { data: draft, error } = await db
    .from('draft_bookings')
    .insert({ ...params, ...(ip ? { created_by_ip: ip } : {}) })
    .select()
    .single()
  if (error) throw error

  if (items?.length) {
    const rows = items.map((i) => ({ ...i, draft_id: draft.id }))
    const { error: itemsErr } = await db.from('draft_items').insert(rows)
    if (itemsErr) throw itemsErr
  }

  return draft
}

export async function getDraft(id: string) {
  const db = serviceClient()
  const { data, error } = await db
    .from('draft_bookings')
    .select('*, draft_items(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function completeDraft(id: string) {
  const db = serviceClient()
  const { error } = await db
    .from('draft_bookings')
    .update({ status: 'completed' })
    .eq('id', id)
  if (error) throw error
}

export async function cleanupExpiredDrafts() {
  const db = serviceClient()
  const { error } = await db
    .from('draft_bookings')
    .update({ status: 'expired' })
    .in('status', ['active', 'checked_out'])
    .lt('expires_at', new Date().toISOString())
  if (error) throw error
}

// ─── W-5: Kapazitäts-Hold ────────────────────────────────────────────────────

/** Setzt einen bestehenden Draft auf 'checked_out' — atomar (nur wenn noch 'active'). */
export async function holdForCheckout(
  draftId: string,
  stripeSessionId: string,
): Promise<void> {
  const db = serviceClient()
  const { error } = await db
    .from('draft_bookings')
    .update({
      status: 'checked_out',
      stripe_checkout_session_id: stripeSessionId,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .eq('id', draftId)
    .eq('status', 'active')
  if (error) throw error
}

export type CheckoutHoldParams = {
  product_id: string
  date: string
  session: 'AM' | 'PM' | 'NIGHT'
  num_divers: number
  stripe_checkout_session_id: string
}

/** Legt einen neuen Draft-Hold für eine laufende Stripe-Session an. */
export async function createCheckoutHold(params: CheckoutHoldParams) {
  const db = serviceClient()
  const { data, error } = await db
    .from('draft_bookings')
    .insert({
      ...params,
      status: 'checked_out',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error
  return data
}

/** Bestätigt einen Draft nach erfolgreicher Zahlung — kein Ablauf mehr. */
export async function confirmDraftByStripeSession(stripeSessionId: string): Promise<void> {
  const db = serviceClient()
  const { error } = await db
    .from('draft_bookings')
    .update({ status: 'confirmed', expires_at: null })
    .eq('stripe_checkout_session_id', stripeSessionId)
    .in('status', ['checked_out', 'active'])
  if (error) throw error
}

/** Setzt einen Draft auf 'expired' wenn die Stripe-Session abgelaufen ist. */
export async function expireDraftByStripeSession(stripeSessionId: string): Promise<void> {
  const db = serviceClient()
  const { error } = await db
    .from('draft_bookings')
    .update({ status: 'expired' })
    .eq('stripe_checkout_session_id', stripeSessionId)
    .in('status', ['checked_out', 'active'])
  if (error) throw error
}

/**
 * Hold für ALLE Tauchtage einer Online-Buchung — VOR dem Stripe-Aufruf, damit kein Fenster bleibt, in dem ein zweiter Gast
 * dieselben Plätze bezahlen kann. stripe_checkout_session_id ist zunächst ein Platzhalter (`pending:<uuid>`) und wird nach
 * dem Stripe-Aufruf auf die echte Session-ID gesetzt; schlägt Stripe fehl, werden die Zeilen wieder gelöscht.
 */
export async function createHoldsForSessions(p: {
  product_id: string
  sessions: { date: string; session: string }[]
  num_divers: number
}): Promise<{ placeholder: string; ids: string[] }> {
  const db = serviceClient()
  const placeholder = `pending:${crypto.randomUUID()}`
  const rows = p.sessions
    .filter(s => s.session === 'am' || s.session === 'pm' || s.session === 'night')
    .map(s => ({
      product_id: p.product_id, date: s.date, session: s.session.toUpperCase(), num_divers: p.num_divers,
      status: 'checked_out', stripe_checkout_session_id: placeholder,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }))
  if (rows.length === 0) return { placeholder, ids: [] }
  const { data, error } = await db.from('draft_bookings').insert(rows).select('id')
  if (error) throw error
  return { placeholder, ids: (data ?? []).map(r => r.id as string) }
}

export async function attachStripeSessionToHolds(placeholder: string, stripeSessionId: string): Promise<void> {
  const db = serviceClient()
  const { error } = await db.from('draft_bookings')
    .update({ stripe_checkout_session_id: stripeSessionId, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
    .eq('stripe_checkout_session_id', placeholder)
  if (error) throw error
}

export async function releaseHolds(placeholder: string): Promise<void> {
  const db = serviceClient()
  await db.from('draft_bookings').delete().eq('stripe_checkout_session_id', placeholder)
}
