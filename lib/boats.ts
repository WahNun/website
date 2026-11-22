export type BoatRef = { id: string }
export type BookingBoatSource = { boat_id: string | null }
export type SessionBoatSource = { boat_id: string | null }

/**
 * Resolves the effective boat ID for a booking.
 *
 * Priority: session.boat_id → booking.boat_id → boats[0].id (first active boat by sort_order).
 *
 * This is the single source of truth shared by LiveBoats and the wish-grants
 * endpoint so both always agree on which boat a booking belongs to.
 */
export function resolveBoatForBooking(
  booking: BookingBoatSource,
  session: SessionBoatSource,
  boats: BoatRef[]
): string | null {
  return session.boat_id ?? booking.boat_id ?? boats[0]?.id ?? null
}
