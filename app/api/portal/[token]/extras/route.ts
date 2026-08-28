// ============================================
// /api/portal/[token]/extras — what the traveller can buy
// ============================================
// GET   the offers waiting for an answer, and what they have already asked for
// POST  the traveller asks for something  { title, note }
//
// THE PORTAL NEVER MOVES MONEY. A traveller can ask, and can accept an offer
// the office has priced — both of which leave the extra short of `confirmed`,
// which is the only status that changes what is owed. The office confirms, and
// that happens on the operator side. See docs/plans/extras-and-upgrades.md §4.
//
// AND IT NEVER SETS A PRICE. A request arrives unpriced by construction: the
// body carries a title and a note, nothing else, exactly as the insurance
// route resolves a premium server-side rather than trusting what was sent.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isValidPortalToken,
  portalLinkState,
  portalVerifyCookieName,
  isPortalVerified,
} from '@/lib/booking-portal'
import {
  PORTAL_VISIBLE_STATUSES,
  portalExtraView,
} from '@/lib/portal/extras-scope'
import { notifyOrgManagers } from '@/lib/notify-managers'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export interface PortalLink {
  booking_id: string
  org_id: string
  passenger_id: string | null
}

/** Everything the two portal extras routes check before touching anything. */
export async function resolvePortalExtrasLink(
  request: NextRequest,
  token: string
): Promise<{ link: PortalLink } | { error: NextResponse }> {
  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return { error: rateLimitResponse(limit) }

  if (!isValidPortalToken(token)) return { error: notFound() }
  if (!isPortalVerified(token, request.cookies.get(portalVerifyCookieName(token))?.value)) {
    return { error: NextResponse.json({ error: '本人確認が必要です。' }, { status: 403 }) }
  }

  const { data: link } = await admin
    .from('booking_portal_links')
    .select('booking_id, org_id, passenger_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable) return { error: notFound() }

  return { link: link as PortalLink }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolvePortalExtrasLink(request, token)
  if ('error' in resolved) return resolved.error
  const { link } = resolved

  let query = admin
    .from('booking_extras')
    .select('id, kind, title, description, quantity, unit_price, currency, status, passenger_id, created_at')
    .eq('booking_id', link.booking_id)
    .eq('org_id', link.org_id)
    .in('status', PORTAL_VISIBLE_STATUSES as unknown as string[])
    .order('created_at', { ascending: true })

  // A private per-traveller link is ONE PERSON'S. It shows that person's own
  // extras and nothing else — not the party's, which are the lead's to answer,
  // and certainly not another traveller's. Same rule as the party-size request
  // and the traveller forms.
  if (link.passenger_id) query = query.eq('passenger_id', link.passenger_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: '読み込めませんでした。' }, { status: 500 })

  const { data: booking } = await admin
    .from('bookings')
    .select('currency, details_locked_at')
    .eq('id', link.booking_id)
    .maybeSingle()

  return NextResponse.json({
    currency: booking?.currency || 'EUR',
    // Late in the day the office stops taking new requests, but an offer they
    // have already made can still be answered.
    canRequest: !booking?.details_locked_at,
    // portalExtraView, not the row: no unit price, no supplier, no cost — see
    // lib/portal/extras-scope.
    extras: (data ?? []).map(portalExtraView),
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolvePortalExtrasLink(request, token)
  if ('error' in resolved) return resolved.error
  const { link } = resolved

  const { data: booking } = await admin
    .from('bookings')
    .select('id, details_locked_at')
    .eq('id', link.booking_id)
    .maybeSingle()
  if (!booking) return notFound()
  if (booking.details_locked_at) {
    return NextResponse.json(
      { error: 'ご出発が近づいているため、こちらからのご依頼は承れません。担当者までご連絡ください。' },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) {
    return NextResponse.json({ error: 'ご希望の内容をご入力ください。' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : null

  // One pending ask at a time is not enforced here the way party-size requests
  // are: a traveller may genuinely want two different things, and each is
  // priced separately. What IS refused is the same title twice, which is a
  // double-tap rather than a second request.
  const { data: existing } = await admin
    .from('booking_extras')
    .select('id')
    .eq('booking_id', link.booking_id)
    .eq('status', 'requested')
    .eq('title', title)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ success: true, duplicate: true })
  }

  const { error } = await admin.from('booking_extras').insert({
    org_id: link.org_id,
    booking_id: link.booking_id,
    // A private link's request belongs to that traveller; a family link's is
    // the party's.
    passenger_id: link.passenger_id,
    kind: 'addon',
    title,
    description: note,
    quantity: 1,
    // Unpriced, and not confirmable until the office prices it.
    unit_price: null,
    currency: null,
    status: 'requested',
    requested_via: 'portal',
  })
  if (error) {
    console.error('portal extras: could not record request', error)
    return NextResponse.json({ error: '送信できませんでした。' }, { status: 500 })
  }

  await notifyOrgManagers(admin, link.org_id, {
    title: 'オプションのご依頼',
    message: `「${title}」のご依頼がありました。料金をご確認のうえお返事ください。`,
    link: `/bookings/${link.booking_id}`,
  })

  return NextResponse.json({ success: true })
}
