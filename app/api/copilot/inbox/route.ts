// ============================================
// API: COPILOT INBOX
// ============================================
// GET /api/copilot/inbox — List inbox messages for a thread
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const threadId = request.nextUrl.searchParams.get('thread_id')

    if (!threadId) {
      return NextResponse.json(
        { success: false, error: 'thread_id is required' },
        { status: 400 }
      )
    }

    const { data: messages, error } = await supabase
      .from('communication_inbox')
      .select('*')
      .eq('thread_id', threadId)
      .order('received_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, messages: messages || [] })
  } catch (error: any) {
    console.error('Error fetching copilot inbox:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
