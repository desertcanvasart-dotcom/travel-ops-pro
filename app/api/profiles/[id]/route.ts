import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fields only an admin may change — `role` is the column the middleware reads
// for RBAC, so allowing self-service edits here is a privilege-escalation path.
const PRIVILEGED_FIELDS = ['role', 'is_active'] as const
// Fields a user may change on their OWN profile.
const SELF_EDITABLE_FIELDS = ['full_name', 'phone', 'timezone'] as const

// Resolve the authenticated caller (from the session cookie) and their RBAC role.
// The middleware /api/* gate guarantees a session exists; this re-derives WHO it
// is and WHAT role, since the routes below use the RLS-bypassing admin client.
async function getCaller(): Promise<{ id: string; role: string } | null> {
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
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  return { id: user.id, role: (profile as { role?: string } | null)?.role || 'viewer' }
}

// GET - Get single profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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
    const isAdmin = caller.role === 'admin'
    const isSelf = caller.id === id
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

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
    if (caller.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // First check if the user exists and is not an admin (prevent deleting admins)
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    if (profile?.role === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete admin users' },
        { status: 403 }
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