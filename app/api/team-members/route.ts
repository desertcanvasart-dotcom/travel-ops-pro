import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg } from '@/lib/api/org-scope'
import {
  isTeamRole, INVALID_TEAM_ROLE, DUPLICATE_TEAM_EMAIL, cleanEmail, emailTakenInOrg, loginToLink,
} from '@/lib/team-members'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The organisation's own team only (team_members.org_id, migration 20261203):
// this listed, created and edited every company's staff.

// GET - Fetch all team members
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const searchParams = request.nextUrl.searchParams
    const activeOnly = searchParams.get('active') === 'true'
    const role = searchParams.get('role')

    let query = supabaseAdmin
      .from('team_members')
      .select('*, department:departments(id, name)')
      .eq('org_id', orgId)
      .order('name', { ascending: true })

    const departmentId = searchParams.get('departmentId')
    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (role) {
      query = query.eq('role', role)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching team members:', error)
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team members GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new team member
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()

    const { phone, role, notes, department_id } = body
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = cleanEmail(body.email)

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (role !== undefined && role !== null && role !== '' && !isTeamRole(role)) {
      return NextResponse.json({ error: INVALID_TEAM_ROLE }, { status: 400 })
    }
    // One person per address in a company (WhatsApp Manage Agents says the same).
    if (email && (await emailTakenInOrg(supabaseAdmin, orgId, email))) {
      return NextResponse.json({ error: DUPLICATE_TEAM_EMAIL }, { status: 409 })
    }
    if (department_id && (typeof department_id !== 'string' || !(await rowInOrg(supabaseAdmin, 'departments', department_id, orgId)))) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    // A member whose email is a login of THIS company is linked to it, so the
    // in-app notifications and "me" in the inbox reach them. A body user_id is
    // never taken. Another company's login is never linked.
    const userId = await loginToLink(supabaseAdmin, orgId, email)

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .insert({
        org_id: orgId,
        name,
        email,
        user_id: userId,
        phone: phone || null,
        role: role || 'staff',
        department_id: department_id || null,
        notes: notes || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating team member:', error)
      return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team members POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}