import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { mayManage } from '@/lib/auth/member-management'
import { recordChange } from '@/lib/activity-log'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — list members of the current org. Returns the membership join with
// the matching user_profiles row so the settings page can render name +
// email + role + joined-at without a second roundtrip. Admin and manager only
// (owner passes), like the Settings screen that reads it: it lists every
// member's email and role.
export async function GET() {
  try {
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Two plain queries stitched in code: the embed this used to attempt
    // (user_profiles!user_id) needs a foreign key that does not exist, so it
    // failed PGRST200 on every call and the page showed "No members yet"
    // under a count that said otherwise.
    const { data: memberships, error } = await supabaseAdmin
      .from('organization_members')
      .select('org_id, user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const userIds = (memberships ?? []).map(m => m.user_id).filter(Boolean)
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from('user_profiles')
          .select('id, full_name, email, role, is_active')
          .in('id', userIds)
      : { data: [] }
    const byId = new Map((profiles ?? []).map(p => [p.id, p]))

    const data = (memberships ?? []).map(m => ({
      ...m,
      user: byId.get(m.user_id) ?? null,
    }))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('Error fetching org members:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch members' }, { status: 500 })
  }
}

// DELETE — remove a member from THIS company. Their login, profile and any
// other company's membership are untouched. The owner removes anyone; an
// admin removes a manager, agent or viewer (the Users page rule, mayManage),
// which is how a person who also works for another company leaves this one:
// deactivating or deleting them would act in both. Users can remove
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

    const { data: targetMembership } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .maybeSingle()
    const targetRole = (targetMembership as { role?: string } | null)?.role ?? null
    if (!targetRole) {
      return NextResponse.json({ success: false, error: 'Not a member of this company' }, { status: 404 })
    }

    if (!isSelf && actorRole !== 'owner' && !mayManage(actorRole ?? '', targetRole)) {
      return NextResponse.json(
        { success: false, error: targetRole === 'admin' || targetRole === 'owner'
          ? 'Only the owner can remove an admin'
          : 'Only an admin or the owner can remove a member' },
        { status: 403 }
      )
    }

    // Last-owner guard: if the target is an owner and there's only one
    // owner in the org, refuse — removing them would lock the org.
    if (targetRole === 'owner') {
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

    const { data: target } = await supabaseAdmin
      .from('user_profiles')
      .select('email')
      .eq('id', targetUserId)
      .maybeSingle()
    await recordChange({
      org_id: orgId, user_id: user.id, user_email: user.email ?? null, method: 'DELETE',
      path: `/api/organization/members`,
      detail: { target: (target as { email?: string } | null)?.email ?? null, changes: [{ field: 'membership', from: targetRole, to: null }] },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error removing org member:', err)
    return NextResponse.json({ success: false, error: 'Failed to remove member' }, { status: 500 })
  }
}
