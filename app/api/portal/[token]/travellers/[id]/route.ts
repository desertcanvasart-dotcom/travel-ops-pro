// ============================================
// PATCH /api/portal/[token]/travellers/[id]
// ============================================
// The traveller filling in their own 海外旅行参加申込書. This is the only write
// path in this app that accepts input from someone with no session, so the
// guards are the point of the file, not decoration:
//
//   1. The token must be well-formed BEFORE any query runs.
//   2. It must resolve to a link that is neither revoked nor expired.
//   3. The traveller must belong to THAT link's booking — a valid token does
//      not grant edits to somebody else's manifest.
//   4. The form must not be locked; once the manifest has gone to Cairo, later
//      edits would diverge from what was sent.
//   5. Only allowlisted fields are written. The body is never spread.
//   6. Rate-limited by IP.
//
// Validation is advisory here on purpose. The rules live in
// lib/passenger-validation.ts and the form applies them as the traveller types;
// this route reports them back but still SAVES, because a half-finished form
// that cannot be saved is a form that gets abandoned. What it will not do is
// mark the details as submitted while errors remain.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isValidPortalToken,
  pickWritableFields,
  portalLinkState,
} from '@/lib/booking-portal'
import { validatePassenger } from '@/lib/passenger-validation'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Every failure looks the same from outside — a bad token must not be
 *  distinguishable from a revoked one, or the URL space becomes probeable. */
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params

  // Rate-limited before anything touches the database.
  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  if (!isValidPortalToken(token)) return notFound()

  const supabase = admin()

  const { data: link } = await supabase
    .from('booking_portal_links')
    .select('id, booking_id, org_id, revoked_at, expires_at, details_locked_at')
    .eq('token', token)
    .maybeSingle()

  const state = portalLinkState(link)
  if (!state.usable) return notFound()

  if (link!.details_locked_at) {
    return NextResponse.json(
      {
        error: 'locked',
        message: 'ご入力内容は確定済みです。変更が必要な場合は担当者までご連絡ください。',
      },
      { status: 409 }
    )
  }

  // The traveller must be on THIS booking. Scoping the update by booking_id as
  // well as id is what stops a valid token editing another party's manifest.
  const { data: passenger } = await supabase
    .from('booking_passengers')
    .select('id, is_lead_passenger, passenger_type')
    .eq('id', id)
    .eq('booking_id', link!.booking_id)
    .maybeSingle()

  if (!passenger) return notFound()

  const body = await request.json().catch(() => null)
  const fields = pickWritableFields(body)
  if (!Object.keys(fields).length) {
    return NextResponse.json({ error: 'No writable fields supplied' }, { status: 400 })
  }

  // The departure date the six-month passport rule counts from.
  const { data: booking } = await supabase
    .from('bookings')
    .select('start_date')
    .eq('id', link!.booking_id)
    .maybeSingle()

  const merged = {
    ...fields,
    is_lead_passenger: passenger.is_lead_passenger,
    passenger_type: passenger.passenger_type,
  }
  const validation = validatePassenger(merged as never, {
    departure_date: booking?.start_date ?? null,
  })

  // `submit: true` is the traveller pressing "send", not merely saving a draft.
  // Only a clean form counts as submitted — otherwise the operator's chase list
  // would clear while a passport was still unusable.
  const submitting = body && typeof body === 'object' && (body as Record<string, unknown>).submit === true
  const stamp = submitting && validation.ok

  const { data: updated, error } = await supabase
    .from('booking_passengers')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
      ...(stamp
        ? { details_submitted_at: new Date().toISOString(), details_source: 'customer' }
        : {}),
    })
    .eq('id', id)
    .eq('booking_id', link!.booking_id)
    .select('id, details_submitted_at')
    .single()

  if (error) {
    console.error('Portal traveller update failed:', error)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }

  return NextResponse.json({
    saved: true,
    submitted: Boolean(updated?.details_submitted_at),
    issues: validation.issues,
  })
}
