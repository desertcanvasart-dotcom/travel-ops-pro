// ============================================
// PUT /api/b2b/quotes/bulk-update
// Bulk-update the status of B2B quotes. Manager+ only.
// body: { quote_ids: string[], status: string }
// Each updated quote also gets a revision snapshot.
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole } from '@/lib/auth/current-org'

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
    if (!status) {
      return NextResponse.json({ success: false, error: 'status is required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', quote_ids)
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
          p_changed_by: null,
          p_change_reason: `Bulk status update → ${status}`,
        })
      )
    )

    return NextResponse.json({
      success: true,
      updated_count: data?.length || 0,
      message: `Successfully updated ${data?.length || 0} quote(s)`,
    })
  } catch (error: any) {
    console.error('Bulk update error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
