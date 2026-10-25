import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { verifiedFactors } from '@/lib/auth/two-factor'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — return the current user's org (Phase 2C settings page reads this).
export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, created_at, updated_at, require_two_factor')
      .eq('id', orgId)
      .single()

    if (error || !org) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 })
    }

    // Aggregate counts used by the settings page header.
    const { count: memberCount } = await supabaseAdmin
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)

    return NextResponse.json({ success: true, data: { ...org, member_count: memberCount ?? 0 } })
  } catch (err) {
    console.error('Error fetching organization:', err)
    return NextResponse.json({ success: false, error: 'Failed to fetch organization' }, { status: 500 })
  }
}

// PUT — rename the org, or switch "require two-factor" (lib/auth/two-factor).
// Only owners can edit; everyone else gets 403. Turning two-factor ON is
// refused until the owner has an authenticator of their own — the switch
// would otherwise send them to set one up at their very next click.
export async function PUT(request: NextRequest) {
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

    // Owner gate — only owners may rename.
    const { data: membership } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()
    if ((membership as { role?: string } | null)?.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'Only organization owners can rename the org' },
        { status: 403 }
      )
    }

    const body = await request.json()

    if (typeof body?.require_two_factor === 'boolean' && body?.name === undefined) {
      if (body.require_two_factor && verifiedFactors(user).length === 0) {
        return NextResponse.json(
          { success: false, error: 'Set up two-factor for your own account first (Settings → Profile → Two-factor login).' },
          { status: 409 }
        )
      }
      const { data, error } = await supabaseAdmin
        .from('organizations')
        .update({ require_two_factor: body.require_two_factor, updated_at: new Date().toISOString() })
        .eq('id', orgId)
        .select('id, name, created_at, updated_at, require_two_factor')
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!rawName) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }
    if (rawName.length > 200) {
      return NextResponse.json({ success: false, error: 'Name too long (max 200)' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update({ name: rawName, updated_at: new Date().toISOString() })
      .eq('id', orgId)
      .select('id, name, created_at, updated_at, require_two_factor')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('Error updating organization:', err)
    return NextResponse.json({ success: false, error: 'Failed to update organization' }, { status: 500 })
  }
}
