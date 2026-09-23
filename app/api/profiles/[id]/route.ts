import { NextRequest, NextResponse } from 'next/server'
import { INVITABLE_ROLES } from '@/lib/auth/roles'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, getCurrentUserRole } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fields only an admin may change. `role` now lives on organization_members —
// the PATCH below writes the membership and mirrors user_profiles.role for the
// client contexts that still display from it. Self-service edits stay blocked:
// this is a privilege-escalation path either way.
const PRIVILEGED_FIELDS = ['role', 'is_active'] as const
// Fields a user may change on their OWN profile.
const SELF_EDITABLE_FIELDS = ['full_name', 'phone', 'timezone'] as const

// The caller, in the workspace this request is acting in. The old lookup took
// the caller's FIRST membership (limit 1, no order) and never asked whether the
// target was in the same workspace — so an admin anywhere could deactivate or
// delete any account on the installation, the owner's included.
async function getCaller(): Promise<{ id: string; role: string; orgId: string } | null> {
  const [id, role, orgId] = await Promise.all([getCurrentUserId(), getCurrentUserRole(), getCurrentOrgId()])
  if (!id || !role || !orgId) return null
  return { id, role, orgId }
}

/** The target's role in the caller's workspace, or null when not a member of it. */
async function targetRoleIn(orgId: string, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { role?: string } | null)?.role ?? null
}

const isAdminRole = (role: string) => role === 'admin' || role === 'owner'

/**
 * May the caller change another member's role / active status, or delete them?
 * Never the owner (ownership is transferred, not edited); an admin only by the
 * owner, so two admins cannot lock each other out.
 */
function mayManage(callerRole: string, targetRole: string): boolean {
  if (targetRole === 'owner') return false
  if (targetRole === 'admin') return callerRole === 'owner'
  return isAdminRole(callerRole)
}

// GET - Get single profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const caller = await getCaller()
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (caller.id !== id && !(await targetRoleIn(caller.orgId, id))) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

// PUT - Update profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // AUTHORIZATION: a user may edit only their own profile; only an admin may
    // edit another user's profile or change privileged fields (role/is_active).
    const caller = await getCaller()
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const isAdmin = isAdminRole(caller.role)
    const isSelf = caller.id === id
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    // Someone else's profile: they must belong to THIS workspace.
    const targetRole = isSelf ? caller.role : await targetRoleIn(caller.orgId, id)
    if (!targetRole) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()

    const touchesPrivileged = PRIVILEGED_FIELDS.some(f => body[f] !== undefined)
    if (isAdmin && touchesPrivileged) {
      if (isSelf) {
        // Your own role or active flag: a slip here locks the workspace out.
        return NextResponse.json(
          { success: false, error: 'You cannot change your own role or active status' },
          { status: 403 }
        )
      }
      if (!mayManage(caller.role, targetRole)) {
        return NextResponse.json(
          { success: false, error: targetRole === 'owner'
            ? 'Ownership is transferred, not edited from a profile'
            : 'Only the owner can change an admin' },
          { status: 403 }
        )
      }
    }

    // Block privilege escalation: only admins may set role / is_active.
    if (!isAdmin && PRIVILEGED_FIELDS.some(f => body[f] !== undefined)) {
      return NextResponse.json(
        { success: false, error: 'Only admins can change role or active status' },
        { status: 403 }
      )
    }

    // Non-admins are restricted to their own non-privileged fields.
    const allowedFields = isAdmin
      ? [...SELF_EDITABLE_FIELDS, ...PRIVILEGED_FIELDS]
      : [...SELF_EDITABLE_FIELDS]
    const updateData: Record<string, any> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // A role change is validated against the vocabulary and written to the
    // AUTHORITY — the target's membership — before the profile mirror. Owner
    // is deliberately not assignable here: ownership is transferred, never
    // granted from a profile form (and minting owners casually is exactly how
    // the last role system rotted).
    if (updateData.role !== undefined) {
      if (!INVITABLE_ROLES.includes(updateData.role)) {
        return NextResponse.json(
          { success: false, error: `role must be one of: ${INVITABLE_ROLES.join(', ')}` },
          { status: 400 }
        )
      }
      // The membership in THIS workspace (checked above to exist and be manageable).
      const { error: roleErr } = await supabase
        .from('organization_members')
        .update({ role: updateData.role })
        .eq('org_id', caller.orgId)
        .eq('user_id', id)
      if (roleErr) throw roleErr
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}

// DELETE - Delete user profile
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // AUTHORIZATION: only admins may delete users.
    const caller = await getCaller()
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAdminRole(caller.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (caller.id === id) {
      return NextResponse.json({ success: false, error: 'You cannot delete yourself' }, { status: 403 })
    }

    // The target must be in THIS workspace, and manageable by the caller. This
    // read the profile MIRROR before, which only refused 'admin' — an owner (or
    // anyone in another workspace) could be deleted.
    const targetRole = await targetRoleIn(caller.orgId, id)
    if (!targetRole) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    if (!mayManage(caller.role, targetRole)) {
      return NextResponse.json(
        { success: false, error: targetRole === 'owner' ? 'The owner cannot be deleted' : 'Only the owner can delete an admin' },
        { status: 403 }
      )
    }

    // Deleting the account removes the person from EVERY workspace. If they
    // belong to another one, that is not this workspace's call to make.
    const { count: otherMemberships } = await supabase
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', id)
      .neq('org_id', caller.orgId)
    if ((otherMemberships ?? 0) > 0) {
      return NextResponse.json(
        { success: false, error: 'This person also belongs to another workspace; deactivate them here instead' },
        { status: 409 }
      )
    }

    // Delete the user profile
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Also delete the auth user if possible (requires admin privileges)
    try {
      await supabase.auth.admin.deleteUser(id)
    } catch (authError) {
      console.warn('Could not delete auth user:', authError)
      // Profile is already deleted, so we continue
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    )
  }
}