import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { requireRole, getCurrentUserRole, getCurrentUserId, getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { roleAllows } from '@/lib/auth/roles'
import { teamMemberInOrg, openChatsByMember, orgLoginForEmail } from '@/lib/whatsapp-org'
import { isOrgMember } from '@/lib/auth/org-members'

// team_members is the same table /api/team-members manages behind the
// admin/manager gate; /api/whatsapp/* only requires an agent, so an agent
// could create, rewrite (role, user_id, email) or deactivate colleagues here —
// deactivating also unassigns their conversations. Managers edit these
// fields; an agent may only switch their OWN availability.
const MANAGERS = ['admin', 'manager']
const MANAGER_EDITABLE = ['name', 'email', 'phone', 'avatar_url', 'max_conversations', 'is_available', 'role']

// A team member is one organisation's (team_members.org_id, migration
// 20261203): listed, created, edited and deactivated only by that org. A
// member may have no login; one that has must be a login of the same org.

// GET /api/whatsapp/agents - List all team members (for WhatsApp assignment)
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'
    const availableOnly = searchParams.get('available_only') === 'true'

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    let query = supabase
      .from('team_members')
      .select('id, user_id, name, email, phone, avatar_url, role, is_active, is_available, last_assigned_at, created_at, updated_at')
      .eq('org_id', orgId)
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (availableOnly) {
      query = query.eq('is_available', true)
    }

    const { data: rows, error } = await query

    if (error) throw error

    // The open-chat figure is counted from the conversations, not read from
    // team_members.current_conversations (lib/whatsapp-org openChatsByMember).
    // There is no per-agent cap: max_conversations is not enforced anywhere,
    // so it is not shown as if it were.
    const { data: assigned } = await supabase
      .from('whatsapp_conversations')
      .select('assigned_team_member_id, status, is_hidden')
      .eq('org_id', orgId)
      .not('assigned_team_member_id', 'is', null)
    const open = openChatsByMember(assigned ?? [])

    // The signed-in user's own team member in this org, so the WhatsApp
    // inbox knows who "me" is (Mine, Claim, reply logging).
    const userId = await getCurrentUserId()
    const data = (rows ?? []).map(({ user_id, ...agent }: { user_id: string | null } & Record<string, unknown>) => ({
      ...agent,
      has_login: !!user_id,
      current_conversations: open.get(agent.id as string) ?? 0,
    }))
    const mine = userId ? (rows ?? []).find((r: { user_id: string | null }) => r.user_id === userId) : null

    return NextResponse.json({
      success: true,
      agents: data,
      current_team_member_id: (mine as { id: string } | null | undefined)?.id ?? null,
      count: data.length
    })
  } catch (error: any) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST /api/whatsapp/agents - Create new team member / agent
export async function POST(request: NextRequest) {
  try {
    const denied = await requireRole(MANAGERS)
    if (denied) return denied
    const supabase = createServerClient()
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()

    const { name, email, phone, avatar_url, max_conversations, role } = body
    let { user_id } = body

    if (!name) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    // Manage Agents sends a name and an email, never a login. An email that
    // is a login of this org links the agent to it — otherwise the agent
    // could be assigned chats but never see them as their own.
    if (!user_id && email) user_id = await orgLoginForEmail(supabase, orgId, email)

    // A login, when given, must be one of this org's: another company's login
    // linked here would see this org's conversations as theirs. No login is
    // fine — the member is still this org's.
    if (user_id && (typeof user_id !== 'string' || !(await isOrgMember(supabase, orgId, user_id)))) {
      return NextResponse.json({ error: 'That login is not a member of this organization' }, { status: 400 })
    }
    // One row per login per organisation (team_members_org_user_key).
    if (user_id) {
      const { data: linked } = await supabase
        .from('team_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', user_id)
        .limit(1)
        .maybeSingle()
      if (linked) {
        return NextResponse.json({ error: 'That login already has a team member' }, { status: 400 })
      }
    }

    if (email) {
      const { data: existing } = await supabase
        .from('team_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('email', email)
        .limit(1)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ error: 'Team member with this email already exists' }, { status: 400 })
      }
    }

    const { data, error } = await supabase
      .from('team_members')
      .insert({
        org_id: orgId,
        name,
        email: email || null,
        phone: phone || null,
        user_id: user_id || null,
        avatar_url: avatar_url || null,
        role: role || 'sales',
        max_conversations: max_conversations || 50,
        is_active: true,
        is_available: true,
        current_conversations: 0
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      agent: data,
      linked_login: !!data?.user_id,
      message: 'Agent created successfully'
    })
  } catch (error: any) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PATCH /api/whatsapp/agents - Update team member / agent
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (typeof id !== 'string' || !(await teamMemberInOrg(supabase, id, orgId))) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isManager = roleAllows(await getCurrentUserRole(), MANAGERS)
    const editable = isManager ? MANAGER_EDITABLE : ['is_available']
    const updates: Record<string, unknown> = {}
    for (const key of editable) if (key in body) updates[key] = body[key]
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing you may change' }, { status: 403 })
    }

    let query = supabase
      .from('team_members')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('org_id', orgId)
    if (!isManager) {
      const userId = await getCurrentUserId()
      if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      // Said plainly: the filtered update below matched no row and .single()
      // turned that into a bare "Internal server error".
      const { data: own } = await supabase
        .from('team_members')
        .select('id')
        .eq('id', id)
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!own) {
        return NextResponse.json({ error: 'You can only change your own availability' }, { status: 403 })
      }
      query = query.eq('user_id', userId)
    }
    const { data, error } = await query
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      agent: data,
      message: 'Agent updated successfully'
    })
  } catch (error: any) {
    console.error('Error updating agent:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE /api/whatsapp/agents - Deactivate agent (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const denied = await requireRole(MANAGERS)
    if (denied) return denied
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await teamMemberInOrg(supabase, id, orgId))) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('team_members')
      .update({
        is_active: false,
        is_available: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) throw error

    await supabase
      .from('whatsapp_conversations')
      .update({
        assigned_team_member_id: null,
        assigned_agent_id: null,
        assigned_at: null
      })
      .eq('assigned_team_member_id', id)
      // Only this org's conversations (whatsapp_conversations.org_id).
      .eq('org_id', orgId)

    return NextResponse.json({ 
      success: true, 
      message: 'Agent deactivated successfully'
    })
  } catch (error: any) {
    console.error('Error deactivating agent:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
