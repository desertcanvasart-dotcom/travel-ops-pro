import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg } from '@/lib/api/org-scope'
import {
  isTeamRole, INVALID_TEAM_ROLE, DUPLICATE_TEAM_EMAIL, cleanEmail, emailTakenInOrg, loginToLink, deactivateTeamMember,
} from '@/lib/team-members'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch single team member
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) {
      console.error('Error fetching team member:', error)
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team member GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update team member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json()

    const { data: current } = await supabaseAdmin
      .from('team_members')
      .select('id, email, user_id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!current) return NextResponse.json({ error: 'Team member not found' }, { status: 404 })

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      updateData.name = name
    }
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.role !== undefined) {
      if (!isTeamRole(body.role)) return NextResponse.json({ error: INVALID_TEAM_ROLE }, { status: 400 })
      updateData.role = body.role
    }
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active must be true or false' }, { status: 400 })
      }
      updateData.is_active = body.is_active
      // Deactivating clears availability too (the conversations are released below).
      if (!body.is_active) updateData.is_available = false
    }
    if (body.email !== undefined) {
      const email = cleanEmail(body.email)
      if (email && (await emailTakenInOrg(supabaseAdmin, orgId, email, id))) {
        return NextResponse.json({ error: DUPLICATE_TEAM_EMAIL }, { status: 409 })
      }
      updateData.email = email
      // The login follows the address: relinked when it changes (or cleared if
      // the new address is no login of this company), and an unlinked member
      // whose address already is one is linked now.
      const changed = (email ?? '').toLowerCase() !== (current.email ?? '').trim().toLowerCase()
      if (changed || !current.user_id) {
        const userId = await loginToLink(supabaseAdmin, orgId, email, id)
        if (changed || userId) updateData.user_id = userId
      }
    }
    if (body.department_id !== undefined) {
      if (body.department_id && (typeof body.department_id !== 'string' ||
          !(await rowInOrg(supabaseAdmin, 'departments', body.department_id, orgId)))) {
        return NextResponse.json({ error: 'Department not found' }, { status: 404 })
      }
      updateData.department_id = body.department_id || null
    }

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating team member:', error)
      return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Team member not found' }, { status: 404 })

    if (body.is_active === false) await deactivateTeamMember(supabaseAdmin, orgId, id)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team member PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete team member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    // Soft delete, the same as WhatsApp Manage Agents: not active, not
    // available, and their WhatsApp and email conversations are unassigned.
    // Trips and tasks keep the name.
    const done = await deactivateTeamMember(supabaseAdmin, orgId, id)
    if (!done) return NextResponse.json({ error: 'Team member not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in team member DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}