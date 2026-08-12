// ============================================
// API: GET /api/integrations/[id]/events — recent deliveries
// ============================================
// The question an operator actually has about an integration is "is it
// working?", and neither a connection row nor a last_inbound_at timestamp
// answers it — a partner can be delivering every hour and having every
// departure rejected. This returns what actually happened, per delivery.
//
// The payload is deliberately NOT included: it can be large, it is
// partner-controlled, and rendering it in a settings page is how stored XSS
// gets in. The `result` and `error` summaries are ours.

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 100

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await orgAuth()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, org_id } = auth
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const { id } = await params
    const requested = Number(request.nextUrl.searchParams.get('limit') || 20)
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : 20

    const { data, error } = await supabase
      .from('integration_events')
      .select('id, direction, event_type, external_event_id, status, result, error, received_at, processed_at')
      .eq('org_id', org_id)
      .eq('integration_id', id)
      .order('received_at', { ascending: false })
      .limit(limit)

    if (error) {
      // Absent table = this deploy predates the migration. An empty log is the
      // honest answer; a 500 would read as "the integration is broken".
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return NextResponse.json({ success: true, data: [], migration_pending: true })
      }
      console.error('Error listing integration events:', error)
      return NextResponse.json({ success: false, error: 'Failed to load deliveries' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Integration events GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
