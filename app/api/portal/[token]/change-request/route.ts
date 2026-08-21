// ============================================
// POST /api/portal/[token]/change-request — the lead asks to add travellers
// ============================================
// Adding people changes the price, so the portal cannot create passengers
// beyond the booked count. Instead the lead files a request; the operator
// re-prices and approves. Booking-level (family) link only, behind the gate.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isValidPortalToken,
  portalLinkState,
  portalVerifyCookieName,
  isPortalVerified,
} from '@/lib/booking-portal'
import { notifyOrgManagers } from '@/lib/notify-managers'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  if (!isValidPortalToken(token)) return notFound()
  if (!isPortalVerified(token, request.cookies.get(portalVerifyCookieName(token))?.value)) {
    return NextResponse.json({ error: '本人確認が必要です。' }, { status: 403 })
  }

  const { data: link } = await admin
    .from('booking_portal_links')
    .select('booking_id, org_id, passenger_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable) return notFound()
  // A private per-traveller link is one person's; requesting party size is the
  // lead's action on the booking-level link.
  if (link.passenger_id) return NextResponse.json({ error: 'この操作はできません。' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const count = Number(body?.count)
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    return NextResponse.json({ error: '追加人数をご確認ください。' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  // Upsert the single pending request (the partial unique index enforces one).
  const { data: existing } = await admin
    .from('booking_change_requests')
    .select('id')
    .eq('booking_id', link.booking_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    await admin.from('booking_change_requests')
      .update({ requested_count: count, note, requested_via: 'portal', created_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    const { error } = await admin.from('booking_change_requests').insert({
      org_id: link.org_id, booking_id: link.booking_id,
      kind: 'add_traveller', requested_count: count, note, requested_via: 'portal', status: 'pending',
    })
    if (error) return NextResponse.json({ error: 'Could not submit' }, { status: 500 })
  }

  await notifyOrgManagers(admin, link.org_id, {
    title: '参加者追加のご依頼',
    message: `予約に ${count} 名の追加リクエストがあります。`,
    link: `/bookings/${link.booking_id}`,
  })

  return NextResponse.json({ success: true })
}
