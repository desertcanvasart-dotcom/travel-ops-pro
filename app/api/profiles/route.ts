import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { withMembershipRoles } from '@/lib/auth/profile-roles'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all profiles (team members)
//
// `role` on each row is the ORGANIZATION MEMBERSHIP role — the one every gate
// reads — not the user_profiles mirror the table itself carries. The mirror
// drifted on production (a member invited as viewer, mirror hand-set to
// manager) and this list showed the mirror, so the Users page role dropdown
// already said "Manager" and could not be used to make it true. See
// lib/auth/profile-roles.ts. `membership_role` says explicitly whether the
// person has a membership here at all.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const role = searchParams.get('role')

    let query = supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) throw error

    const orgId = await getCurrentOrgId()
    const { data: memberships } = orgId
      ? await supabase
          .from('organization_members')
          .select('user_id, role')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true })
      : { data: [] }

    let listed = withMembershipRoles(
      (data ?? []) as Array<{ id: string; role?: string | null }>,
      (memberships ?? []) as Array<{ user_id: string; role: string }>
    )
    // The ?role= filter applies to the role that gates, like everything else.
    if (role) listed = listed.filter(p => p.role === role)

    return NextResponse.json({
      success: true,
      data: listed
    })
  } catch (error) {
    console.error('Error fetching profiles:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profiles' },
      { status: 500 }
    )
  }
}
