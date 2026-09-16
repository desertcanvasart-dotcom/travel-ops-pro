// ============================================
// API: /api/itineraries/[id]/share — create / revoke the public share link
// ============================================
// A share link IS a send path — it puts a price in front of a traveller, the
// same as email and WhatsApp — so it runs the same output gate the other send
// paths use: an unpriced draft or a non-deliverable amount refuses to share.
//
// One active link per itinerary, enforced by a partial unique index. POST is
// idempotent: sharing again returns the existing link, so an operator can
// always re-copy it, and revoking kills the only URL that exists.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { allowsIncomplete, quoteCompleteness } from '@/lib/pricing/quote-completeness'
import { loadItineraryServiceLines } from '@/lib/pricing/itinerary-completeness'
import { generateShareToken } from '@/lib/itinerary-share'
import { sharePriceDecision, toApprovedGaps } from '@/lib/itineraries/share-approval'
import { clientMessage } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'

/**
 * Absolute base for the returned URL. request.url is the container address on
 * Railway, so the configured public origin wins when it is set.
 */
function shareBase(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, '')
  return new URL(requestUrl).origin
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await orgAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const { supabase, org_id, user } = auth

  const { data: itinerary, error } = await supabase!
    .from('itineraries')
    .select('id, status, total_cost, currency')
    .eq('id', id)
    .eq('org_id', org_id!)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load itinerary') }, { status: 500 })
  }
  if (!itinerary) {
    return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
  }

  // The gate. A draft has no settled price, and a broken amount must never
  // reach a traveller.
  if (itinerary.status === 'draft') {
    return NextResponse.json(
      { success: false, error: 'This itinerary is still a draft, so it cannot be shared with a client yet.' },
      { status: 422 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const loaded = await loadItineraryServiceLines(supabase!, id, org_id!)
  if (!loaded.ok) {
    return NextResponse.json({ success: false, error: loaded.error }, { status: loaded.status })
  }
  const priceCheck = checkAmountDeliverable(itinerary.total_cost, {
    currency: itinerary.currency,
    servicesSnapshot: loaded.lines,
    allowIncomplete: allowsIncomplete(body?.allow_incomplete),
  })
  if (!priceCheck.ok) {
    return NextResponse.json(
      {
        success: false,
        error: priceCheck.incomplete
          ? `This itinerary has ${priceCheck.gaps?.length ?? 0} service(s) with no cost.`
          : 'Itinerary price is not deliverable',
        violations: priceCheck.violations,
        incomplete: priceCheck.incomplete ?? false,
        gaps: priceCheck.gaps ?? [],
      },
      { status: 422 }
    )
  }

  // The approval, recorded on the link. Reaching here with gaps means the
  // operator said "share anyway" for exactly these; the public page shows the
  // price only while no other gap appears. A complete itinerary clears it.
  const { gaps } = quoteCompleteness(loaded.lines)
  const approval = gaps.length > 0
    ? {
        incomplete_approved_gaps: toApprovedGaps(gaps),
        incomplete_approved_at: new Date().toISOString(),
        incomplete_approved_by: user?.id ?? null,
      }
    : { incomplete_approved_gaps: null, incomplete_approved_at: null, incomplete_approved_by: null }

  // An existing active link wins — one URL per itinerary.
  const { data: existing } = await supabase!
    .from('itinerary_shares')
    .select('id, token')
    .eq('itinerary_id', id)
    .is('revoked_at', null)
    .maybeSingle()

  let token: string | undefined = existing?.token
  if (existing) {
    const { error: approvalErr } = await supabase!
      .from('itinerary_shares')
      .update(approval)
      .eq('id', existing.id)
    if (approvalErr) {
      return NextResponse.json({ success: false, error: clientMessage(approvalErr, 'Failed to update share link') }, { status: 500 })
    }
  }
  if (!token) {
    token = generateShareToken()
    const { error: insErr } = await supabase!.from('itinerary_shares').insert({
      org_id,
      itinerary_id: id,
      token,
      created_by: user?.id ?? null,
      ...approval,
    })

    if (insErr) {
      // 23505 = someone shared concurrently; return theirs rather than erroring.
      // ANY OTHER failure (RLS denial, FK violation, dropped connection) means
      // no row exists — and `token` still holds the string just generated, so
      // returning it would hand the operator a URL that 404s. Clear it first:
      // only a token that came back from the database may be returned.
      token = undefined

      if (insErr.code === '23505') {
        const { data: raced } = await supabase!
          .from('itinerary_shares')
          .select('id, token')
          .eq('itinerary_id', id)
          .is('revoked_at', null)
          .maybeSingle()
        // Record this approval on the winner's link too, and say so if that
        // fails — the operator approved, and must not be told it took.
        if (raced) {
          const { error: racedErr } = await supabase!.from('itinerary_shares').update(approval).eq('id', raced.id)
          if (racedErr) {
            return NextResponse.json({ success: false, error: clientMessage(racedErr, 'Failed to update share link') }, { status: 500 })
          }
        }
        token = raced?.token
      }

      if (!token) {
        return NextResponse.json({ success: false, error: clientMessage(insErr, 'Failed to create share link') }, { status: 500 })
      }
    }
  }

  return NextResponse.json({
    success: true,
    token,
    url: new URL(`/share/${token}`, shareBase(request.url)).toString(),
  })
}

/** Read the current link, if any — lets the editor show "Copy link" vs "Share". */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await orgAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const { data, error } = await auth.supabase!
    .from('itinerary_shares')
    .select('token, created_at, view_count, last_viewed_at, incomplete_approved_gaps, incomplete_approved_at')
    .eq('itinerary_id', id)
    .eq('org_id', auth.org_id!)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load share link') }, { status: 500 })
  }
  if (!data) return NextResponse.json({ success: true, shared: false })

  // What the traveller sees right now — the same decision the public page makes.
  const [{ data: itinerary }, lines] = await Promise.all([
    auth.supabase!.from('itineraries').select('status, total_cost, currency').eq('id', id).eq('org_id', auth.org_id!).maybeSingle(),
    loadItineraryServiceLines(auth.supabase!, id, auth.org_id!),
  ])
  const price = sharePriceDecision({
    status: itinerary?.status,
    totalCost: itinerary?.total_cost,
    currency: itinerary?.currency,
    lines,
    approvedGaps: data.incomplete_approved_gaps,
  })

  return NextResponse.json({
    success: true,
    shared: true,
    token: data.token,
    url: new URL(`/share/${data.token}`, shareBase(request.url)).toString(),
    created_at: data.created_at,
    view_count: data.view_count ?? 0,
    last_viewed_at: data.last_viewed_at,
    approved_gaps: Array.isArray(data.incomplete_approved_gaps) ? data.incomplete_approved_gaps : [],
    approved_at: data.incomplete_approved_at,
    price_hidden: price.show ? null : price.reason,
    price_hidden_gaps: price.show ? [] : price.gaps ?? [],
  })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await orgAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  // Revoke, never delete: the row stays as the record of what was shared.
  const { error } = await auth.supabase!
    .from('itinerary_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('itinerary_id', id)
    .eq('org_id', auth.org_id!)
    .is('revoked_at', null)

  if (error) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to revoke share link') }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
