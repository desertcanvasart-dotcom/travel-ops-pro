import { NextRequest, NextResponse } from 'next/server'
import { INVITABLE_ROLES } from '@/lib/auth/roles'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, getCurrentUserRole } from '@/lib/auth/current-org'
import {
  OTHER_COMPANY_DEACTIVATE,
  OTHER_COMPANY_DELETE,
  OTHER_COMPANY_PROFILE,
  OWNED_RECORD_REFS,
  OWNS_RECORDS,
  isAdminRole,
  mayManage,
} from '@/lib/auth/member-management'
import { recordChange } from '@/lib/activity-log'
import { diffChanges } from '@/lib/activity-detail'

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

/** Does the person also belong to a company other than `orgId`? */
async function inOtherCompany(userId: string, orgId: string): Promise<boolean> {
  const { count } = await supabase
    .from('organization_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('org_id', orgId)
  return (count ?? 0) > 0
}

/** The first table that still has a row naming this login, or null. */
async function ownedRecordTable(userId: string): Promise<string | null> {
  const counts = await Promise.all(OWNED_RECORD_REFS.map(async ref => {
    const { count, error } = await supabase
      .from(ref.table)
      .select(ref.column, { count: 'exact', head: true })
      .eq(ref.column, userId)
    // A table this install does not have owns nothing.
    return error ? 0 : (count ?? 0)
  }))
  const i = counts.findIndex(c => c > 0)
  return i === -1 ? null : OWNED_RECORD_REFS[i].table
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
      // is_active is ACCOUNT-level (middleware refuses a deactivated account
      // in every workspace). Deactivating someone who also belongs to another
      // agency would lock them out of that agency too — its owner included —
      // which is not this workspace's call, the same rule DELETE applies.
      if (body.is_active === false && await inOtherCompany(id, caller.orgId)) {
        return NextResponse.json({ success: false, error: OTHER_COMPANY_DEACTIVATE }, { status: 409 })
      }
    }

    // Name, phone and time zone are one ACCOUNT's, shown in every company the
    // person works in. An admin here may not rewrite how they appear in the
    // other company; the person changes them on their own profile.
    if (!isSelf && SELF_EDITABLE_FIELDS.some(f => body[f] !== undefined) && await inOtherCompany(id, caller.orgId)) {
      return NextResponse.json({ success: false, error: OTHER_COMPANY_PROFILE }, { status: 409 })
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

    const { data: before } = await supabase
      .from('user_profiles')
      .select('email, is_active')
      .eq('id', id)
      .maybeSingle()

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Who may do what: the Activity Log keeps the role and active flag before
    // and after (the middleware row alone said "update · profiles · ab12cd34").
    const changes = diffChanges(
      { role: targetRole, is_active: (before as { is_active?: boolean } | null)?.is_active },
      { role: updateData.role ?? targetRole, is_active: updateData.is_active ?? (before as { is_active?: boolean } | null)?.is_active },
      ['role', 'is_active']
    )
    await recordChange({
      org_id: caller.orgId, user_id: caller.id, method: 'PUT', path: `/api/profiles/${id}`,
      detail: { target: (before as { email?: string } | null)?.email ?? null, changes },
    })

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
    if (await inOtherCompany(id, caller.orgId)) {
      return NextResponse.json({ success: false, error: OTHER_COMPANY_DELETE }, { status: 409 })
    }

    // A login that still owns trips, departures or emails cannot be deleted
    // (those foreign keys have no ON DELETE rule). Say so before touching
    // anything: this deleted the PROFILE first and then ignored the auth
    // error, which left a login with its membership and full access, missing
    // from this list, and read as active by middleware (no profile = active).
    const owned = await ownedRecordTable(id)
    if (owned) {
      return NextResponse.json({ success: false, error: OWNS_RECORDS, owns: owned }, { status: 409 })
    }

    const { data: gone } = await supabase.from('user_profiles').select('email').eq('id', id).maybeSingle()

    // The login first. supabase-js REPORTS failure in { error }, it does not
    // throw; nothing else is touched unless this succeeded.
    const { error: authError } = await supabase.auth.admin.deleteUser(id)
    if (authError) {
      console.error('Could not delete auth user:', authError)
      return NextResponse.json(
        { success: false, error: 'The login could not be deleted, so nothing was changed. Deactivate it instead.' },
        { status: 409 }
      )
    }

    // The profile and the membership go with the login (ON DELETE CASCADE);
    // this catches an install where the profile has no such key.
    await supabase.from('user_profiles').delete().eq('id', id)

    await recordChange({
      org_id: caller.orgId, user_id: caller.id, method: 'DELETE', path: `/api/profiles/${id}`,
      detail: { target: (gone as { email?: string } | null)?.email ?? null, changes: [{ field: 'account', from: targetRole, to: null }] },
    })

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