// ============================================
// API: COPILOT THREADS
// ============================================
// GET /api/copilot/threads — List copilot threads with filters
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
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
    const search = sanitizeSearchTerm(searchParams.get('search'))
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')
    const offset = (page - 1) * limit

    // ONE query. The latest inbox message and latest draft of each thread come
    // back as embedded resources, each ordered and limited to one row PER
    // THREAD by PostgREST. This used to be 1 + 2 × (page size) queries — 61 for
    // a page of 30 — and the list is polled every 10 s while it is open.
    let query = supabase
      .from('communication_threads')
      .select('*, latest_inbox:communication_inbox(*), latest_draft:communication_drafts(*)', { count: 'exact' })
      .order('last_message_at', { ascending: false })
      .order('received_at', { referencedTable: 'latest_inbox', ascending: false })
      .limit(1, { referencedTable: 'latest_inbox' })
      .order('created_at', { referencedTable: 'latest_draft', ascending: false })
      .limit(1, { referencedTable: 'latest_draft' })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (channel) query = query.eq('channel', channel)
    if (urgency) query = query.eq('urgency', urgency)
    if (search) {
      query = query.or(`client_name.ilike.%${search}%,contact_info.ilike.%${search}%,subject.ilike.%${search}%`)
    }

    const { data: threads, error, count } = await query

    if (error) throw error

    // Embedded resources arrive as arrays; the callers expect one row or null.
    const threadsWithLatest = (threads || []).map((thread: Record<string, unknown>) => ({
      ...thread,
      latest_inbox: (thread.latest_inbox as unknown[] | null)?.[0] ?? null,
      latest_draft: (thread.latest_draft as unknown[] | null)?.[0] ?? null,
    }))

    return NextResponse.json({
      success: true,
      threads: threadsWithLatest,
      total: count || 0,
    })
  } catch (error: any) {
    console.error('Error fetching copilot threads:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
