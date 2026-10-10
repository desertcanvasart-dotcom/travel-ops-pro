// ============================================
// PUT /api/b2b/quotes/bulk-update
// Bulk-update the status of B2B quotes. Manager+ only.
// body: { quote_ids: string[], status: string }
// Each updated quote also gets a revision snapshot.
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole, getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'

// The statuses a person sets. 'converted' is set by convert only (a bulk
// 'converted' let from-quote book a quote that was never accepted).
const SETTABLE = ['draft', 'sent', 'accepted', 'rejected', 'expired']

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(request: NextRequest) {
  try {
    const role = await getCurrentUserRole()
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Requires manager role or higher.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { quote_ids, status } = body
    if (!Array.isArray(quote_ids) || quote_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'quote_ids array is required' }, { status: 400 })
    }
    if (quote_ids.length > 500) {
      return NextResponse.json({ success: false, error: 'Too many quotes in one request (max 500)' }, { status: 400 })
    }
    if (!SETTABLE.includes(status)) {
      return NextResponse.json({ success: false, error: `status must be one of ${SETTABLE.join(', ')}` }, { status: 400 })
    }

    // See bulk-delete: scoped inside the statement, so a list naming another
    // organisation's quotes updates nothing of theirs.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const actor = await getCurrentUserId()

    // A converted quote keeps its status (its trip and booking hang off it);
    // the detail page locks it, and a select-all here no longer unlocks it.
    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .update({ status, updated_at: new Date().toISOString(), last_modified_by: actor })
      .in('id', quote_ids)
      .eq('org_id', orgId)
      .neq('status', 'converted')
      .is('converted_to_itinerary_id', null)
      .select('id')

    if (error) {
      console.error('Error bulk updating quotes:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Snapshot each updated quote so revision history captures the bulk change.
    await Promise.allSettled(
      (data || []).map((q: any) =>
        supabaseAdmin.rpc('create_quote_revision', {
          p_quote_id: q.id,
          p_changed_by: actor,
          p_change_reason: `Bulk status update → ${status}`,
        })
      )
    )

    return NextResponse.json({
      success: true,
      updated_count: data?.length || 0,
      skipped_count: quote_ids.length - (data?.length || 0),
      message: `Successfully updated ${data?.length || 0} quote(s)`,
    })
  } catch (error: any) {
    console.error('Bulk update error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
