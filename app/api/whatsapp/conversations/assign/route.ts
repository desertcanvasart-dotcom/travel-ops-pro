import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { teamMemberInOrg } from '@/lib/whatsapp-org'
import { createNotification } from '@/lib/notifications'

// Both the conversation and the assignee must be the caller's org's: the
// conversation by org_id (migration 20261125), the assignee by its own org_id
// (migration 20261203, lib/whatsapp-org teamMemberInOrg). Otherwise any org
// could take over, or hand to its own staff, another org's customer.

// POST /api/whatsapp/conversations/assign - Assign or claim a conversation
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const body = await request.json()
    const { conversation_id, agent_id, team_member_id, action } = body

    // Support both agent_id and team_member_id for backwards compatibility
    const assigneeId = team_member_id || agent_id

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    // Get current user for audit
    const { data: { user } } = await supabase.auth.getUser()

    // Get current conversation state
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (convError || !conversation) {
      console.error('Conversation not found:', convError)
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const oldAssigneeId = conversation.assigned_team_member_id || conversation.assigned_agent_id

    // Handle different actions
    let newAssigneeId: string | null = null
    let actionType = 'assigned'

    if (action === 'claim') {
      if (!assigneeId) {
        return NextResponse.json({ error: 'Team member ID required for claim' }, { status: 400 })
      }
      newAssigneeId = assigneeId
      actionType = 'claimed'
    } else if (action === 'unassign') {
      newAssigneeId = null
      actionType = 'unassigned'
    } else if (action === 'transfer') {
      if (!assigneeId) {
        return NextResponse.json({ error: 'Team member ID required for transfer' }, { status: 400 })
      }
      newAssigneeId = assigneeId
      actionType = 'transferred'
    } else {
      newAssigneeId = assigneeId || null
      actionType = assigneeId ? 'assigned' : 'unassigned'
    }

    if (newAssigneeId && !(await teamMemberInOrg(supabase, newAssigneeId, orgId))) {
      return NextResponse.json({ error: 'Team member not found in this organization' }, { status: 400 })
    }

    // Update conversation - use new assigned_team_member_id column primarily
    const updateData: Record<string, any> = {
      assigned_team_member_id: newAssigneeId,
      assigned_agent_id: newAssigneeId,
      assigned_at: newAssigneeId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }

    console.log('Updating conversation with:', updateData)

    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversation_id)
      .eq('org_id', orgId)

    if (updateError) {
      console.error('Update error:', updateError)
      throw updateError
    }

    // ============================================
    // SEND NOTIFICATION TO ASSIGNED TEAM MEMBER
    // ============================================
    if (newAssigneeId && actionType !== 'claimed') {
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('id, name, user_id')
        .eq('id', newAssigneeId)
        .eq('org_id', orgId)
        .eq('is_active', true)
        .maybeSingle()

      if (teamMember) {
        const clientName = conversation.client_name || conversation.contact_name || conversation.phone_number
        // One in-app row, and its email from this organisation's mailbox
        // (lib/notifications). This used to insert the row here AND fetch
        // /api/notifications from the server for the email — a request with
        // no session, so the /api gate answered 401 and no email ever went
        // (and had it got through, a second row).
        const result = await createNotification({
          org_id: orgId,
          user_id: teamMember.user_id ?? null,
          team_member_id: teamMember.id,
          type: 'whatsapp_assigned',
          title: 'New WhatsApp Chat Assigned',
          message: `You've been assigned a WhatsApp conversation with ${clientName}. Last message: "${conversation.last_message?.substring(0, 100) || 'No messages yet'}"`,
          link: `/inbox?channel=all&conversation=${conversation_id}`,
        })
        if (!result.success) console.error('Notification failed:', result.error)
      }
    }

    // Log activity. agent_id references team_members since 20261209 (it
    // referenced sales_agents, so this insert always failed). A failed log
    // never fails the assignment, but it is reported.
    try {
      const { error: activityError } = await supabase
        .from('conversation_activity')
        .insert({
          conversation_id,
          agent_id: newAssigneeId,
          team_member_id: newAssigneeId,
          action_type: actionType,
          action_details: {
            assigned_by: user?.id || null,
            previous_assignee_id: oldAssigneeId,
            action: action || 'assign'
          }
        })
      if (activityError) console.error('Activity log failed:', activityError.message)
    } catch (activityError) {
      console.error('Activity log failed:', activityError)
    }

    // Fetch updated conversation
    const { data: updatedConversation } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .eq('org_id', orgId)
      .single()

    // Get assignee details
    let assigneeDetails = null
    if (newAssigneeId) {
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email, avatar_url, role, is_available')
        .eq('id', newAssigneeId)
        .eq('org_id', orgId)
        .single()
      assigneeDetails = tm
    }

    return NextResponse.json({ 
      success: true, 
      conversation: {
        ...updatedConversation,
        assigned_agent: assigneeDetails
      },
      action: actionType,
      message: `Conversation ${actionType} successfully`
    })
  } catch (error: any) {
    console.error('Error assigning conversation:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// GET /api/whatsapp/conversations/assign - Get assignment info
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) throw error
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const assigneeId = conversation?.assigned_team_member_id || conversation?.assigned_agent_id

    let assignee = null
    if (assigneeId) {
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email, avatar_url, role, is_available')
        .eq('id', assigneeId)
        .eq('org_id', orgId)
        .maybeSingle()
      assignee = tm
    }

    let history: any[] = []
    try {
      const { data: historyData } = await supabase
        .from('conversation_activity')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('action_type', ['assigned', 'claimed', 'transferred', 'unassigned', 'auto_assigned'])
        .order('created_at', { ascending: false })
        .limit(10)
      
      history = historyData || []
    } catch {
      // Activity table might not exist
    }

    return NextResponse.json({ 
      success: true,
      assignment: {
        current_agent: assignee,
        assigned_at: conversation?.assigned_at,
        conversation_id: conversationId
      },
      history
    })
  } catch (error: any) {
    console.error('Error fetching assignment:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}