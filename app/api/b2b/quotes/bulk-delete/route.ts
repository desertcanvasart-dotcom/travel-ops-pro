// ============================================
// DELETE /api/b2b/quotes/bulk-delete
// Bulk-delete B2B quotes. Manager+ only. body: { quote_ids: string[] }
// Converted or booked quotes are skipped (skipped_count), never deleted.
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole, getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { quoteLockReason } from '@/lib/quotes/lock'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: NextRequest) {
  try {
    const role = await getCurrentUserRole()
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Requires manager role or higher.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const quote_ids = body.quote_ids
    if (!Array.isArray(quote_ids) || quote_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'quote_ids array is required' }, { status: 400 })
    }

    // TENANT BOUNDARY, folded into the statement rather than checked first:
    // ids arrive as a list from the body, and a manager in one organisation
    // could delete another's quotes simply by naming them. Filtering inside the
    // DELETE means a mixed list silently drops the ids that are not ours, and
    // the returned rows say exactly what was removed.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // A converted or booked quote stays (lib/quotes/lock.ts): the trip and the
    // booking keep it as the record of the price they were made at. Those are
    // skipped and counted, never deleted with the rest.
    const { data: candidates } = await supabaseAdmin
      .from('tour_quotes')
      .select('id, status, converted_to_itinerary_id')
      .in('id', quote_ids)
      .eq('org_id', orgId)
    const ids = (candidates || []).map((q: { id: string }) => q.id)
    const { data: booked } = ids.length
      ? await supabaseAdmin.from('bookings').select('quote_id').eq('quote_type', 'b2b').in('quote_id', ids)
      : { data: [] }
    const bookedIds = new Set((booked || []).map((b: { quote_id: string }) => b.quote_id))
    const deletable = (candidates || [])
      .filter((q: { id: string; status: string | null; converted_to_itinerary_id: string | null }) => !quoteLockReason(q, bookedIds.has(q.id) ? 1 : 0))
      .map((q: { id: string }) => q.id)
    const kept = ids.length - deletable.length

    const { data, error } = deletable.length
      ? await supabaseAdmin
        .from('tour_quotes')
        .delete()
        .in('id', deletable)
        .eq('org_id', orgId)
        .select('id')
      : { data: [], error: null }

    if (error) {
      console.error('Error bulk deleting quotes:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted_count: data?.length || 0,
      skipped_count: kept,
      message: `Deleted ${data?.length || 0} quote(s)` + (kept ? `; ${kept} converted or booked quote(s) kept` : ''),
    })
  } catch (error: any) {
    console.error('Bulk delete error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
