import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// M3 Phase 2A — resolve the current request's org_id.
//
// Every financial API route calls this at the top so it can scope its
// reads and stamp its inserts by org_id. The chain is:
//   session cookie → auth.users.id → organization_members.org_id
//
// We use the anon-key server client (RLS-respecting) to confirm the
// session, then a service-role admin client to read the membership
// (organization_members has no RLS today and is gated behind the
// auth-gated /api layer via middleware.ts).
//
// Returns null if there's no session OR the user has no org membership.
// Routes should treat null as a 403. The convenience helper
// `orgScopedRoute` wraps the null check + 403 response so individual
// routes stay terse.

let cachedAdmin: ReturnType<typeof createClient> | null = null
function getAdmin() {
  if (!cachedAdmin) {
    cachedAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return cachedAdmin
}

export async function getCurrentOrgId(): Promise<string | null> {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {},
        remove() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await getAdmin()
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (membership as { org_id?: string } | null)?.org_id ?? null
}

// Convenience: same as getCurrentOrgId but throws on missing. Use when
// you'd rather a route 500 than silently bypass scoping — useful in
// background workers where there's no client to return a 403 to.
export async function requireCurrentOrgId(): Promise<string> {
  const orgId = await getCurrentOrgId()
  if (!orgId) throw new Error('No organization membership for current user')
  return orgId
}

// Standard 403 response when getCurrentOrgId returns null. Routes do:
//   const orgId = await getCurrentOrgId()
//   if (!orgId) return noOrgResponse()
export function noOrgResponse() {
  return NextResponse.json(
    { success: false, error: 'No organization membership for current user' },
    { status: 403 }
  )
}
