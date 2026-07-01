// ============================================
// GET /api/b2b/quotes/[id]/revisions/[versionNumber]
// Fetch one revision with its full quote_data snapshot.
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionNumber: string }> }
) {
  try {
    const { id, versionNumber } = await params
    const versionNum = parseInt(versionNumber, 10)
    if (isNaN(versionNum) || versionNum < 1) {
      return NextResponse.json({ success: false, error: 'Invalid version number' }, { status: 400 })
    }

    const { data: revision, error } = await supabaseAdmin
      .from('quote_revisions')
      .select('id, version_number, is_current, quote_data, changed_by, changed_at, change_reason, change_summary, changes_diff')
      .eq('quote_type', 'b2b')
      .eq('quote_id', id)
      .eq('version_number', versionNum)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'Revision not found' }, { status: 404 })
      }
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, revision })
  } catch (error: any) {
    console.error('Quote revision detail error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
