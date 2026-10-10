// ============================================
// POST /api/b2b/quotes/[id]/revisions/revert
// Revert a quote to a prior revision (records the revert as a new revision).
// Manager+ only. body: { version_number, revert_reason? }
// ============================================

import { createClient } from '@supabase/supabase-js'
import { quoteInOrg, quoteNotFound, quoteRefsInOrg, quoteRefNotFound } from '@/lib/b2b/quote-scope'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole, getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // TENANT BOUNDARY — see lib/b2b/quote-scope.ts. The quote is addressed by an
    // id from the URL on a service-role client; without this, one organisation
    // reaches another's quote.
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()

    // Reverting overwrites the live quote — restrict to manager+.
    const role = await getCurrentUserRole()
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Requires manager role or higher.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const versionNumber = body.version_number
    if (!versionNumber) {
      return NextResponse.json({ success: false, error: 'version_number is required' }, { status: 400 })
    }

    // A converted (or booked) quote is the price a trip and a booking were made
    // at. Reverting brought back an older price and a draft/sent status while
    // converted_to_itinerary_id stayed — it could then be accepted again and
    // booked at the old figure against a trip priced at the new one.
    const { data: live } = await supabaseAdmin
      .from('tour_quotes')
      .select('status, converted_to_itinerary_id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!live) return quoteNotFound()
    const { count: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('quote_id', id)
      .eq('quote_type', 'b2b')
    if (live.status === 'converted' || live.converted_to_itinerary_id || (bookings ?? 0) > 0) {
      return NextResponse.json(
        { success: false, error: 'A converted or booked quote cannot be reverted' },
        { status: 409 }
      )
    }

    // The revision restores its own itinerary_id and partner_id. One saved
    // before those were checked can name another org's trip or partner.
    const { data: revision } = await supabaseAdmin
      .from('quote_revisions')
      .select('quote_data')
      .eq('quote_type', 'b2b')
      .eq('quote_id', id)
      .eq('version_number', versionNumber)
      .maybeSingle()
    if (!revision) {
      return NextResponse.json({ success: false, error: 'Revision not found' }, { status: 404 })
    }
    const snapshot = (revision.quote_data ?? {}) as Record<string, unknown>
    if (!(await quoteRefsInOrg(supabaseAdmin, orgId, { itinerary_id: snapshot.itinerary_id, partner_id: snapshot.partner_id }))) {
      return quoteRefNotFound()
    }

    // Resolve the acting user for the revert revision's changed_by.
    let userId: string | null = null
    try {
      const { createServerClient } = await import('@/lib/supabase-server')
      const { data } = await createServerClient().auth.getUser()
      userId = data?.user?.id ?? null
    } catch {
      /* changed_by stays null */
    }

    const { data: newRevisionId, error } = await supabaseAdmin.rpc('revert_quote_to_revision', {
      p_quote_id: id,
      p_version_number: versionNumber,
      p_reverted_by: userId,
      p_revert_reason: body.revert_reason || 'Reverted to previous version',
    })

    if (error) {
      console.error('Error reverting quote:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    const { data: updatedQuote } = await supabaseAdmin
      .from('tour_quotes')
      .select('*')
      .eq('id', id)
      .single()

    return NextResponse.json({
      success: true,
      message: `Quote reverted to version ${versionNumber}`,
      new_revision_id: newRevisionId,
      updated_quote: updatedQuote,
    })
  } catch (error: any) {
    console.error('Quote revert API error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
