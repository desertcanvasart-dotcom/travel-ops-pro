// ============================================
// API: COPILOT THREADS
// ============================================
// GET /api/copilot/threads — List copilot threads with filters
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const channel = searchParams.get('channel')
    const urgency = searchParams.get('urgency')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')
    const offset = (page - 1) * limit

    let query = supabase
      .from('communication_threads')
      .select('*', { count: 'exact' })
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (channel) query = query.eq('channel', channel)
    if (urgency) query = query.eq('urgency', urgency)
    if (search) {
      query = query.or(`client_name.ilike.%${search}%,contact_info.ilike.%${search}%,subject.ilike.%${search}%`)
    }

    const { data: threads, error, count } = await query

    if (error) throw error

    // For each thread, fetch the latest inbox message and latest draft
    const threadsWithLatest = await Promise.all(
      (threads || []).map(async (thread) => {
        const [inboxResult, draftResult] = await Promise.all([
          supabase
            .from('communication_inbox')
            .select('*')
            .eq('thread_id', thread.id)
            .order('received_at', { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from('communication_drafts')
            .select('*')
            .eq('thread_id', thread.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single(),
        ])

        return {
          ...thread,
          latest_inbox: inboxResult.data || null,
          latest_draft: draftResult.data || null,
        }
      })
    )

    return NextResponse.json({
      success: true,
      threads: threadsWithLatest,
      total: count || 0,
    })
  } catch (error: any) {
    console.error('Error fetching copilot threads:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
