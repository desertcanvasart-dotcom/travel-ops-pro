import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'
import type { EmailMessage, EmailMessageFormData } from '@/types/unified'

// GET /api/email/messages - Get messages for a conversation
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const threadId = searchParams.get('thread_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const before = searchParams.get('before') // Pagination cursor (sent_at)

    if (!conversationId && !threadId) {
      return NextResponse.json({
        error: 'Either conversation_id or thread_id required',
        success: false
      }, { status: 400 })
    }

    let query = supabase
      .from('email_messages')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (conversationId) {
      query = query.eq('conversation_id', conversationId)
    } else if (threadId) {
      query = query.eq('thread_id', threadId)
    }

    if (before) {
      query = query.lt('sent_at', before)
    }

    const { data, error } = await query

    if (error) throw error

    // Reverse to show in chronological order (oldest first)
    const messages = (data || []).reverse()

    return NextResponse.json({ messages, success: true })
  } catch (error: any) {
    console.error('Error fetching email messages:', error)
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// POST /api/email/messages - Store a new email message
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body: EmailMessageFormData = await request.json()

    const {
      conversation_id,
      message_id,
      thread_id,
      direction,
      from_address,
      to_addresses,
      cc_addresses,
      subject,
      body_text,
      body_html,
      snippet,
      attachments,
      sent_at,
      is_read,
      labels
    } = body

    if (!message_id) {
      return NextResponse.json({ error: 'Message ID required', success: false }, { status: 400 })
    }

    if (!thread_id) {
      return NextResponse.json({ error: 'Thread ID required', success: false }, { status: 400 })
    }

    if (!direction || !['inbound', 'outbound'].includes(direction)) {
      return NextResponse.json({ error: 'Valid direction required (inbound/outbound)', success: false }, { status: 400 })
    }

    if (!from_address) {
      return NextResponse.json({ error: 'From address required', success: false }, { status: 400 })
    }

    if (!sent_at) {
      return NextResponse.json({ error: 'Sent at timestamp required', success: false }, { status: 400 })
    }

    // Check if message already exists
    const { data: existing } = await supabase
      .from('email_messages')
      .select('id')
      .eq('message_id', message_id)
      .single()

    if (existing) {
      // Message already exists, return it
      return NextResponse.json({
        message: existing,
        created: false,
        success: true
      })
    }

    // If conversation_id not provided, try to find it by thread_id
    let finalConversationId = conversation_id
    if (!finalConversationId) {
      const { data: conversation } = await supabase
        .from('email_conversations')
        .select('id')
        .eq('thread_id', thread_id)
        .single()

      if (conversation) {
        finalConversationId = conversation.id
      }
    }

    // Insert new message
    const { data: newMessage, error } = await supabase
      .from('email_messages')
      .insert({
        conversation_id: finalConversationId || null,
        message_id,
        thread_id,
        direction,
        from_address,
        to_addresses: to_addresses || [],
        cc_addresses: cc_addresses || null,
        bcc_addresses: null,
        subject: subject || null,
        body_text: body_text || null,
        body_html: body_html || null,
        snippet: snippet || null,
        attachments: attachments || [],
        is_read: is_read ?? (direction === 'outbound'),
        is_starred: false,
        labels: labels || null,
        sent_at,
        received_at: direction === 'inbound' ? new Date().toISOString() : null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ message: newMessage, created: true, success: true })
  } catch (error: any) {
    console.error('Error storing email message:', error)
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// PATCH /api/email/messages - Update message (mark read, star, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { message_id, action, ...updates } = body

    if (!message_id) {
      return NextResponse.json({ error: 'Message ID required', success: false }, { status: 400 })
    }

    let updateData: any = {}

    if (action === 'mark_read') {
      updateData.is_read = true
    } else if (action === 'mark_unread') {
      updateData.is_read = false
    } else if (action === 'star') {
      updateData.is_starred = true
    } else if (action === 'unstar') {
      updateData.is_starred = false
    } else {
      updateData = { ...updates }
    }

    const { data, error } = await supabase
      .from('email_messages')
      .update(updateData)
      .eq('message_id', message_id)
      .select()
      .single()

    if (error) throw error

    // If marking as read, also update conversation unread count
    if (action === 'mark_read' && data.conversation_id) {
      // Recalculate unread count
      const { count } = await supabase
        .from('email_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', data.conversation_id)
        .eq('direction', 'inbound')
        .eq('is_read', false)

      await supabase
        .from('email_conversations')
        .update({ unread_count: count || 0 })
        .eq('id', data.conversation_id)
    }

    return NextResponse.json({ message: data, success: true })
  } catch (error: any) {
    console.error('Error updating email message:', error)
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// POST /api/email/messages/batch - Store multiple messages at once
export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { messages } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array required', success: false }, { status: 400 })
    }

    // Get existing message IDs to avoid duplicates
    const messageIds = messages.map((m: any) => m.message_id)
    const { data: existingMessages } = await supabase
      .from('email_messages')
      .select('message_id')
      .in('message_id', messageIds)

    const existingIds = new Set((existingMessages || []).map((m: any) => m.message_id))

    // Filter to only new messages
    const newMessages = messages.filter((m: any) => !existingIds.has(m.message_id))

    if (newMessages.length === 0) {
      return NextResponse.json({
        inserted: 0,
        skipped: messages.length,
        success: true
      })
    }

    // Insert new messages
    const { data, error } = await supabase
      .from('email_messages')
      .insert(newMessages.map((m: any) => ({
        conversation_id: m.conversation_id || null,
        message_id: m.message_id,
        thread_id: m.thread_id,
        direction: m.direction,
        from_address: m.from_address,
        to_addresses: m.to_addresses || [],
        cc_addresses: m.cc_addresses || null,
        bcc_addresses: null,
        subject: m.subject || null,
        body_text: m.body_text || null,
        body_html: m.body_html || null,
        snippet: m.snippet || null,
        attachments: m.attachments || [],
        is_read: m.is_read ?? (m.direction === 'outbound'),
        is_starred: false,
        labels: m.labels || null,
        sent_at: m.sent_at,
        received_at: m.direction === 'inbound' ? new Date().toISOString() : null
      })))
      .select()

    if (error) throw error

    return NextResponse.json({
      inserted: data?.length || 0,
      skipped: messages.length - (data?.length || 0),
      messages: data,
      success: true
    })
  } catch (error: any) {
    console.error('Error batch storing email messages:', error)
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}
