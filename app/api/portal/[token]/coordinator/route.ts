// ============================================
// The LEAD coordinator, inside the portal
// ============================================
// GET  — the roster + link status (names/DOB/contact + submitted?, NO passport
//        or medical data — the lead coordinates, the friend keeps their fields)
// POST — { action: 'seed' | 'send' | 'revoke', passenger_id, fields? }
// Every call gates via leadCoordinatorContext: lead's link, friends mode only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { leadCoordinatorContext } from '@/lib/lead-coordinator'
import { mintOrReusePassengerLink, markSentAndDeliver } from '@/lib/portal-links'
import { portalVerifyCookieName } from '@/lib/booking-portal'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const forbidden = () => NextResponse.json({ error: 'Not allowed' }, { status: 403 })

function portalUrl(request: NextRequest, token: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  return `${origin.replace(/\/$/, '')}/portal/${token}`
}

const SEED_FIELDS = ['first_name', 'last_name', 'date_of_birth', 'email', 'phone'] as const

async function ctx(request: NextRequest, token: string) {
  const cookie = request.cookies.get(portalVerifyCookieName(token))?.value
  return leadCoordinatorContext(admin, token, cookie)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await ctx(request, token)
  if (!c) return forbidden()

  const { data: travellers } = await admin
    .from('booking_passengers')
    .select('id, first_name, last_name, date_of_birth, email, phone, is_lead_passenger, details_submitted_at')
    .eq('booking_id', c.bookingId)
    .order('is_lead_passenger', { ascending: false })
    .order('created_at', { ascending: true })

  const { data: links } = await admin
    .from('booking_portal_links')
    .select('token, passenger_id, last_sent_at, revoked_at')
    .eq('booking_id', c.bookingId)
    .not('passenger_id', 'is', null)
    .is('revoked_at', null)
  const byPax = new Map((links ?? []).map(l => [l.passenger_id, l]))

  const roster = (travellers ?? []).map(t => {
    const link = byPax.get(t.id)
    return {
      id: t.id,
      firstName: t.first_name, lastName: t.last_name, dateOfBirth: t.date_of_birth,
      email: t.email, phone: t.phone, isLead: t.is_lead_passenger,
      submitted: Boolean(t.details_submitted_at),
      link: link ? { url: portalUrl(request, link.token), sentAt: link.last_sent_at } : null,
    }
  })
  return NextResponse.json({
    submittedCount: roster.filter(r => r.submitted).length,
    travellers: roster,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  const c = await ctx(request, token)
  if (!c) return forbidden()

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const action = body?.action
  const passengerId = typeof body?.passenger_id === 'string' ? body.passenger_id : null
  if (!passengerId) return NextResponse.json({ error: 'passenger_id required' }, { status: 400 })

  // The target traveller must be on THIS booking.
  const { data: pax } = await admin
    .from('booking_passengers')
    .select('id')
    .eq('id', passengerId)
    .eq('booking_id', c.bookingId)
    .maybeSingle()
  if (!pax) return NextResponse.json({ error: 'Traveller not found' }, { status: 404 })

  if (action === 'seed') {
    const fields = (body?.fields ?? {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    for (const f of SEED_FIELDS) if (f in fields) updates[f] = fields[f] === '' ? null : fields[f]
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields' }, { status: 400 })
    updates.updated_at = new Date().toISOString()
    await admin.from('booking_passengers').update(updates).eq('id', passengerId).eq('booking_id', c.bookingId)
    return NextResponse.json({ success: true })
  }

  if (action === 'send') {
    const minted = await mintOrReusePassengerLink(admin, {
      orgId: c.orgId, bookingId: c.bookingId, passengerId, startDate: c.startDate,
    })
    if ('error' in minted) return NextResponse.json({ error: 'Could not mint link' }, { status: 500 })
    const url = portalUrl(request, minted.token)
    const delivery = await markSentAndDeliver(admin, { token: minted.token, passengerId, orgId: c.orgId, url })
    return NextResponse.json({ success: true, url, emailed: delivery.sent })
  }

  if (action === 'revoke') {
    await admin
      .from('booking_portal_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('booking_id', c.bookingId)
      .eq('passenger_id', passengerId)
      .is('revoked_at', null)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
