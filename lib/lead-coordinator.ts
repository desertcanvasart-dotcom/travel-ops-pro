// ============================================
// Is this portal token the LEAD's link on a friends-mode booking?
// ============================================
// The lead coordinator panel is powerful for a public link — it edits the
// roster and mints other travellers' links — so every coordinator endpoint
// gates on ALL of: valid token, verified gate cookie, the link is scoped to a
// passenger (per-traveller link), that passenger is the lead, and the booking
// is in friends mode. Anything short of all five resolves to null.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidPortalToken, portalLinkState, portalVerifyCookieName, isPortalVerified } from '@/lib/booking-portal'

type Admin = SupabaseClient<any, any, any, any, any>

export async function leadCoordinatorContext(
  admin: Admin,
  token: string,
  cookieValue: string | undefined | null
): Promise<{ bookingId: string; orgId: string; startDate: string | null } | null> {
  if (!isValidPortalToken(token)) return null
  if (!isPortalVerified(token, cookieValue)) return null

  const { data: link } = await admin
    .from('booking_portal_links')
    .select('booking_id, org_id, passenger_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable || !link.passenger_id) return null

  const { data: booking } = await admin
    .from('bookings')
    .select('id, portal_mode, start_date')
    .eq('id', link.booking_id)
    .maybeSingle()
  if (!booking || booking.portal_mode !== 'friends') return null

  const { data: pax } = await admin
    .from('booking_passengers')
    .select('is_lead_passenger')
    .eq('id', link.passenger_id)
    .eq('booking_id', link.booking_id)
    .maybeSingle()
  if (!pax?.is_lead_passenger) return null

  return { bookingId: booking.id, orgId: link.org_id, startDate: booking.start_date }
}
