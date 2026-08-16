// ============================================
// The operator minting (or revoking) a traveller's portal link
// ============================================
// GET    the current link, if there is one
// POST   mint one, or return the existing one — re-sending must not create a
//        second URL, or revoking would leave live links behind
// DELETE revoke it
//
// Minting also ENSURES a passenger row per traveller, because the form edits
// rows rather than creating them. Doing it here means the count comes from the
// booking — which is authoritative about how many people are travelling — and
// the public endpoint never has to create anything.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { generatePortalToken } from '@/lib/booking-portal'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** A link outlives the trip by a month, then stops answering. It carries
 *  passport details; it has no reason to work forever. */
const DAYS_AFTER_DEPARTURE = 30

function portalUrl(request: NextRequest, token: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  return `${origin.replace(/\/$/, '')}/portal/${token}`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params

  const { data } = await supabaseAdmin
    .from('booking_portal_links')
    .select('token, created_at, expires_at, details_locked_at, view_count, last_viewed_at')
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .is('revoked_at', null)
    .maybeSingle()

  return NextResponse.json({
    link: data ? { ...data, url: portalUrl(request, data.token) } : null,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, start_date, num_adults, num_children, client_name, client_email')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (bookingError) {
      return NextResponse.json(
        { error: clientMessage(bookingError, 'Failed to load the booking') },
        { status: 500 }
      )
    }
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    // One live link per booking. Re-sending returns the same URL rather than
    // minting infinite ones — the partial unique index enforces it, this is the
    // friendly path to the same answer.
    const { data: existing } = await supabaseAdmin
      .from('booking_portal_links')
      .select('token, expires_at, details_locked_at')
      .eq('booking_id', id)
      .eq('org_id', orgId)
      .is('revoked_at', null)
      .maybeSingle()

    if (existing) {
      await ensurePassengerRows(id, orgId, booking)
      return NextResponse.json({
        link: { ...existing, url: portalUrl(request, existing.token) },
        created: false,
      })
    }

    // Computed here rather than pulled from lib/payment-schedule: that module
    // is a payment concern and this is the only date arithmetic the portal
    // does. UTC, so the expiry does not move across a DST boundary.
    const expiresAt = booking.start_date
      ? new Date(
          Date.parse(`${booking.start_date.slice(0, 10)}T23:59:59Z`) +
            DAYS_AFTER_DEPARTURE * 86_400_000
        ).toISOString()
      : null

    const { data: link, error } = await supabaseAdmin
      .from('booking_portal_links')
      .insert({
        org_id: orgId,
        booking_id: id,
        token: generatePortalToken(),
        expires_at: expiresAt,
      })
      .select('token, expires_at, details_locked_at')
      .single()

    if (error) {
      return NextResponse.json(
        { error: clientMessage(error, 'Failed to create the link') },
        { status: 500 }
      )
    }

    const seeded = await ensurePassengerRows(id, orgId, booking)

    return NextResponse.json(
      {
        link: { ...link, url: portalUrl(request, link.token) },
        created: true,
        travellers_seeded: seeded,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error minting portal link:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params

  // Revoked rather than deleted: the row is the record of what was shared and
  // when. The token simply stops resolving.
  const { error } = await supabaseAdmin
    .from('booking_portal_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .is('revoked_at', null)

  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Failed to revoke') }, { status: 500 })
  }
  return NextResponse.json({ revoked: true })
}

/**
 * One passenger row per traveller on the booking, so the form has something to
 * edit. Never removes rows: a traveller who has already answered is not deleted
 * because somebody corrected the head count downwards.
 */
async function ensurePassengerRows(
  bookingId: string,
  orgId: string,
  booking: { num_adults: number | null; num_children: number | null; client_name: string | null }
): Promise<number> {
  const { data: existing } = await supabaseAdmin
    .from('booking_passengers')
    .select('id, is_lead_passenger')
    .eq('booking_id', bookingId)

  const have = existing?.length ?? 0
  const want = (booking.num_adults ?? 0) + (booking.num_children ?? 0)
  if (want <= have) return 0

  const hasLead = (existing ?? []).some(p => p.is_lead_passenger)
  const rows = Array.from({ length: want - have }, (_, i) => ({
    org_id: orgId,
    booking_id: bookingId,
    // first_name/last_name are NOT NULL. The lead is seeded from the booking's
    // client name so the party is recognisable before anyone has typed
    // anything; the rest are placeholders the traveller overwrites.
    first_name: !hasLead && i === 0 ? booking.client_name || 'Traveller' : 'Traveller',
    last_name: `${have + i + 1}`,
    passenger_type: (booking.num_adults ?? 0) > have + i ? 'adult' : 'child',
    is_lead_passenger: !hasLead && i === 0,
  }))

  const { error } = await supabaseAdmin.from('booking_passengers').insert(rows)
  if (error) {
    console.error('Could not seed passenger rows:', error)
    return 0
  }
  return rows.length
}
