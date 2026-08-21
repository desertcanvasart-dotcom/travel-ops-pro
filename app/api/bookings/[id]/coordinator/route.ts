// ============================================
// GET /api/bookings/[id]/coordinator — the friends-mode roster + link status
// ============================================
// One call for the coordinator view: every traveller with their seed details,
// whether they have submitted, and the state of their private link (minted,
// sent, revoked). No passport/medical data — the operator manages the roster
// and chases stragglers; the private fields stay with the traveller.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function portalUrl(request: NextRequest, token: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  return `${origin.replace(/\/$/, '')}/portal/${token}`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params

  const { data: booking } = await admin
    .from('bookings')
    .select('id, portal_mode, num_adults, num_children')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { data: travellers } = await admin
    .from('booking_passengers')
    .select('id, first_name, last_name, date_of_birth, email, phone, is_lead_passenger, details_submitted_at')
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .order('is_lead_passenger', { ascending: false })
    .order('created_at', { ascending: true })

  // Live per-traveller links (passenger_id set). The booking-level link is
  // handled by the existing PortalLinkCard, not here.
  const { data: links } = await admin
    .from('booking_portal_links')
    .select('token, passenger_id, last_sent_at, revoked_at')
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .not('passenger_id', 'is', null)
    .is('revoked_at', null)

  const linkByPax = new Map((links ?? []).map(l => [l.passenger_id, l]))

  const roster = (travellers ?? []).map(t => {
    const link = linkByPax.get(t.id)
    return {
      id: t.id,
      firstName: t.first_name,
      lastName: t.last_name,
      dateOfBirth: t.date_of_birth,
      email: t.email,
      phone: t.phone,
      isLead: t.is_lead_passenger,
      submitted: Boolean(t.details_submitted_at),
      link: link ? { url: portalUrl(request, link.token), sentAt: link.last_sent_at } : null,
    }
  })

  return NextResponse.json({
    portalMode: booking.portal_mode,
    bookedCount: (booking.num_adults ?? 0) + (booking.num_children ?? 0),
    submittedCount: roster.filter(r => r.submitted).length,
    travellers: roster,
  })
}
