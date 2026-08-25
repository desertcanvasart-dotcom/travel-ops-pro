// ============================================
// DELETE /api/b2b/quotes/bulk-delete
// Bulk-delete B2B quotes. Manager+ only. body: { quote_ids: string[] }
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole, getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

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

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .delete()
      .in('id', quote_ids)
      .eq('org_id', orgId)
      .select('id')

    if (error) {
      console.error('Error bulk deleting quotes:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted_count: data?.length || 0,
      message: `Successfully deleted ${data?.length || 0} quote(s)`,
    })
  } catch (error: any) {
    console.error('Bulk delete error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
