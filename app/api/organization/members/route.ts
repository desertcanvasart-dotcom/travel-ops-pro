import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — list members of the current org. Returns the membership join with
// the matching user_profiles row so the settings page can render name +
// email + role + joined-at without a second roundtrip.
export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('organization_members')
      .select(`
        org_id,
        user_id,
        role,
        created_at,
        user:user_profiles!user_id(id, full_name, email, role, is_active)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err) {
    console.error('Error fetching org members:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch members' }, { status: 500 })
  }
}

// DELETE — remove a member. Only owners can remove others; users can remove
// themselves (leave) UNLESS they are the last owner (that would orphan the org).
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() {}, remove() {},
        },
      }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return noOrgResponse()

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('user_id')
    if (!targetUserId) {
      return NextResponse.json({ success: false, error: 'user_id is required' }, { status: 400 })
    }

    // Who's asking?
    const { data: actor } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()
    const actorRole = (actor as { role?: string } | null)?.role
    const isSelf = targetUserId === user.id

    if (!isSelf && actorRole !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'Only owners can remove other members' },
        { status: 403 }
      )
    }

    // Last-owner guard: if the target is an owner and there's only one
    // owner in the org, refuse — removing them would lock the org.
    const { data: targetMembership } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .maybeSingle()
    if ((targetMembership as { role?: string } | null)?.role === 'owner') {
      const { count: ownerCount } = await supabaseAdmin
        .from('organization_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'owner')
      if ((ownerCount ?? 0) <= 1) {
        return NextResponse.json(
          { success: false, error: 'Cannot remove the last owner. Transfer ownership first.' },
          { status: 400 }
        )
      }
    }

    const { error } = await supabaseAdmin
      .from('organization_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error removing org member:', err)
    return NextResponse.json({ success: false, error: 'Failed to remove member' }, { status: 500 })
  }
}
