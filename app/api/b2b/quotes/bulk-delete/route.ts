// ============================================
// DELETE /api/b2b/quotes/bulk-delete
// Bulk-delete B2B quotes. Manager+ only. body: { quote_ids: string[] }
// ============================================

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole } from '@/lib/auth/current-org'

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

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .delete()
      .in('id', quote_ids)
      .select('id')

    if (error) {
      console.error('Error bulk deleting quotes:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted_count: data?.length || 0,
      message: `Successfully deleted ${data?.length || 0} quote(s)`,
    })
  } catch (error: any) {
    console.error('Bulk delete error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
