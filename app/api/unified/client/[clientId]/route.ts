import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

// Use service role for API routes to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/unified/client/[clientId] - Get all conversations for a specific client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID required', success: false }, { status: 400 })
    }

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_code, first_name, last_name, email, phone')
      .eq('id', clientId)
      .single()

    if (clientError) {
      return NextResponse.json({ error: 'Client not found', success: false }, { status: 404 })
    }

    // Get WhatsApp conversations for this client
    const { data: waConversations, error: waError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        assigned_agent:team_members!whatsapp_conversations_assigned_team_member_id_fkey (
          id,
          name,
          email,
          avatar_url,
          is_available
        )
      `)
      .eq('client_id', clientId)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .order('last_message_at', { ascending: false })

    if (waError) throw waError

    // Get Email conversations for this client
    const { data: emailConversations, error: emailError } = await supabase
      .from('email_conversations')
      .select(`
        *,
        assigned_agent:team_members!email_conversations_assigned_team_member_id_fkey (
          id,
          name,
          email,
          avatar_url,
          is_available
        )
      `)
      .eq('client_id', clientId)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .order('last_message_at', { ascending: false })

    if (emailError) throw emailError

    // Transform to unified format
    const whatsappUnified = (waConversations || []).map((conv: any) => ({
      id: conv.id,
      channel: 'whatsapp',
      identifier: conv.phone_number,
      client_id: conv.client_id,
      client_name: conv.client_name,
      contact_info: conv.phone_number,
      subject: null,
      last_message_snippet: conv.last_message,
      last_message_at: conv.last_message_at,
      unread_count: conv.unread_count || 0,
      status: conv.status,
      assigned_team_member_id: conv.assigned_team_member_id,
      assigned_at: conv.assigned_at,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      assigned_agent: conv.assigned_agent
    }))

    const emailUnified = (emailConversations || []).map((conv: any) => ({
      id: conv.id,
      channel: 'email',
      identifier: conv.thread_id,
      client_id: conv.client_id,
      client_name: conv.client_name,
      client_email: conv.client_email,
      contact_info: conv.client_email,
      subject: conv.subject,
      last_message_snippet: conv.last_message_snippet,
      last_message_at: conv.last_message_at,
      unread_count: conv.unread_count || 0,
      status: conv.status,
      assigned_team_member_id: conv.assigned_team_member_id,
      assigned_at: conv.assigned_at,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      assigned_agent: conv.assigned_agent
    }))

    // Calculate summary stats
    const summary = {
      whatsapp_count: whatsappUnified.length,
      email_count: emailUnified.length,
      total_count: whatsappUnified.length + emailUnified.length,
      whatsapp_unread: whatsappUnified.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0),
      email_unread: emailUnified.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0),
      total_unread: 0,
      last_activity_at: null as string | null
    }

    summary.total_unread = summary.whatsapp_unread + summary.email_unread

    // Find last activity
    const allConversations = [...whatsappUnified, ...emailUnified]
    if (allConversations.length > 0) {
      const sorted = allConversations.sort((a, b) => {
        const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
        const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
        return dateB - dateA
      })
      summary.last_activity_at = sorted[0].last_message_at
    }

    return NextResponse.json({
      client: {
        ...client,
        full_name: `${client.first_name || ''} ${client.last_name || ''}`.trim()
      },
      whatsapp_conversations: whatsappUnified,
      email_conversations: emailUnified,
      summary,
      success: true
    })
  } catch (error: any) {
    console.error('Error fetching client conversations:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to fetch client conversations'), success: false }, { status: 500 })
  }
}
