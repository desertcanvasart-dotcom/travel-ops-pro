import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// GET /api/whatsapp/conversations - List all conversations
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const search = searchParams.get('search') || ''

    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        clients (
          id,
          first_name,
          last_name,
          email,
          client_code
        )
      `)
      .eq('status', status)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (search) {
      query = query.or(`phone_number.ilike.%${search}%,client_name.ilike.%${search}%`)
    }

    const { data, error } = await query.limit(50)

    if (error) throw error

    // Map to include full_name for convenience
    const conversations = (data || []).map(conv => ({
      ...conv,
      clients: conv.clients ? {
        ...conv.clients,
        full_name: `${conv.clients.first_name || ''} ${conv.clients.last_name || ''}`.trim()
      } : null
    }))

    return NextResponse.json({ conversations })
  } catch (error: any) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/conversations - Create or get conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { phone_number, client_name, client_id } = body

    if (!phone_number) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
    }

    // Clean phone number
    const cleanPhone = phone_number.replace(/[^\d+]/g, '')

    // Check if conversation exists
    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', cleanPhone)
      .single()

    if (existing) {
      // Update if new info provided
      if (client_name || client_id) {
        const { data: updated, error } = await supabase
          .from('whatsapp_conversations')
          .update({
            ...(client_name && { client_name }),
            ...(client_id && { client_id }),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ conversation: updated, created: false })
      }
      return NextResponse.json({ conversation: existing, created: false })
    }

    // Create new conversation
    const { data: newConversation, error } = await supabase
      .from('whatsapp_conversations')
      .insert({
        phone_number: cleanPhone,
        client_name: client_name || null,
        client_id: client_id || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ conversation: newConversation, created: true })
  } catch (error: any) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/whatsapp/conversations - Update conversation (archive, mark read, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { conversation_id, action, ...updates } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    let updateData: any = { updated_at: new Date().toISOString() }

    if (action === 'mark_read') {
      updateData.unread_count = 0
    } else if (action === 'archive') {
      updateData.status = 'archived'
    } else if (action === 'unarchive') {
      updateData.status = 'active'
    } else {
      updateData = { ...updateData, ...updates }
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversation_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ conversation: data })
  } catch (error: any) {
    console.error('Error updating conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
