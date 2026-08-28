// ============================================
// POST /api/portal/[token]/extras/[eid] — the traveller answers an offer
// ============================================
// { action: 'accept' | 'decline' }
//
// Accepting stops at `accepted`. It does NOT confirm, and so it does not move
// a single figure on the booking: the office still has to secure the thing with
// the supplier before the customer owes anything for it. That is the whole
// reason the state machine has two steps there rather than one.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nextStatus } from '@/lib/booking-extras'
import { mayAnswerExtra } from '@/lib/portal/extras-scope'
import { notifyOrgManagers } from '@/lib/notify-managers'
import { resolvePortalExtrasLink } from '../route'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; eid: string }> }
) {
  const { token, eid } = await params
  const resolved = await resolvePortalExtrasLink(request, token)
  if ('error' in resolved) return resolved.error
  const { link } = resolved

  const body = await request.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'ご操作を確認できませんでした。' }, { status: 400 })
  }

  const { data: extra } = await admin
    .from('booking_extras')
    .select('id, title, status, unit_price, currency, passenger_id')
    .eq('id', eid)
    .eq('booking_id', link.booking_id)
    .eq('org_id', link.org_id)
    .maybeSingle()
  if (!extra) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // A private link may only answer for its own traveller. Without this, one
  // person's link would accept a charge on somebody else's behalf.
  if (!mayAnswerExtra(link, extra)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const decision = nextStatus(extra.status, action, {
    unit_price: extra.unit_price,
    currency: extra.currency,
  })
  if (!decision.ok) {
    return NextResponse.json(
      { error: 'このご依頼はすでにお手続きが進んでいます。担当者までご連絡ください。' },
      { status: 409 }
    )
  }

  const updates: Record<string, unknown> = {
    status: decision.status,
    updated_at: new Date().toISOString(),
  }
  if (decision.status === 'declined') updates.resolved_at = new Date().toISOString()

  const { error } = await admin
    .from('booking_extras')
    .update(updates)
    .eq('id', eid)
    .eq('org_id', link.org_id)
  if (error) {
    return NextResponse.json({ error: '送信できませんでした。' }, { status: 500 })
  }

  // Accepting is the moment the office has something to do — secure it, then
  // confirm. Declining needs no chasing, so it is recorded quietly.
  if (decision.status === 'accepted') {
    await notifyOrgManagers(admin, link.org_id, {
      title: 'オプションご承諾',
      message: `「${extra.title}」をご承諾いただきました。手配のうえ確定してください。`,
      link: `/bookings/${link.booking_id}`,
    })
  }

  return NextResponse.json({ success: true, status: decision.status })
}
