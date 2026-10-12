// ============================================
// API: COPILOT THREAD COUNT
// ============================================
// GET /api/copilot/threads/count — Lightweight count of
// threads needing attention (for sidebar badge)
// ============================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // Count inbox messages with draft_ready status (draft generated, awaiting review)
    const { count, error } = await supabase
      .from('communication_inbox')
      // Of the org's own threads (inbox rows carry no org_id); a thread with
      // no org_id counts for nobody (lib/copilot/thread-access).
      .select('id, communication_threads!inner(org_id)', { count: 'exact', head: true })
      .eq('communication_threads.org_id', orgId)
      .in('status', ['draft_ready', 'draft_pending', 'new'])

    if (error) throw error

    return NextResponse.json({ success: true, count: count || 0 })
  } catch (error: any) {
    console.error('Error fetching copilot count:', error)
    return NextResponse.json({ success: false, count: 0 }, { status: 500 })
  }
}
