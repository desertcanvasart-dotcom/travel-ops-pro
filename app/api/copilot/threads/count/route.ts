// ============================================
// API: COPILOT THREAD COUNT
// ============================================
// GET /api/copilot/threads/count — Lightweight count of
// threads needing attention (for sidebar badge)
// ============================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Count inbox messages with draft_ready status (draft generated, awaiting review)
    const { count, error } = await supabase
      .from('communication_inbox')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft_ready', 'draft_pending', 'new'])

    if (error) throw error

    return NextResponse.json({ success: true, count: count || 0 })
  } catch (error: any) {
    console.error('Error fetching copilot count:', error)
    return NextResponse.json({ success: false, count: 0 }, { status: 500 })
  }
}
