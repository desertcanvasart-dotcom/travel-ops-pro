import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { roleAllows } from './roles'
import { VERIFIED_USER_HEADER, verifyVerifiedUserHeader } from '@/lib/auth/verified-user-header'

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

// Resolve the authenticated user id WITHOUT a network round-trip when
// possible: middleware already verified the session via auth.getUser() and
// forwarded the user id in an HMAC-signed internal header (see
// lib/auth/verified-user-header.ts). Verify the signature locally; on any
// miss (no request context, header absent, bad signature) fall back to the
// full auth.getUser() network call — correctness never depends on middleware.
async function resolveVerifiedUserId(): Promise<string | null> {
  try {
    const headerStore = await headers()
    const verified = await verifyVerifiedUserHeader(headerStore.get(VERIFIED_USER_HEADER))
    if (verified) return verified
  } catch {
    // headers() throws outside a request context (e.g. background workers) —
    // fall through to the cookie-based lookup below.
  }

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
  return user?.id ?? null
}

export async function getCurrentOrgId(): Promise<string | null> {
  const userId = await resolveVerifiedUserId()
  if (!userId) return null

  const { data: membership } = await getAdmin()
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (membership as { org_id?: string } | null)?.org_id ?? null
}

// Resolve the current request's authenticated user id from the session cookie.
// Returns null if there's no valid session.
//
// Use this instead of trusting a client-supplied userId (query param or request
// body): a logged-in user could otherwise pass someone else's id and act on
// their data (IDOR). The /api/* middleware guarantees *a* session exists, but
// not that a supplied userId matches it.
export async function getCurrentUserId(): Promise<string | null> {
  return resolveVerifiedUserId()
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

// Resolve the current request's role from ORGANIZATION MEMBERSHIP — the one
// role system. user_profiles.role is a display mirror and nothing may gate on
// it (see lib/auth/roles.ts for why the two systems were consolidated).
//
// Returns null with no session or no membership. The middleware role-gate only
// matches routes by path PREFIX, so nested action routes it can't match (e.g.
// /api/itineraries/[id]/generate-commissions) call this in-route instead.
export async function getCurrentUserRole(): Promise<string | null> {
  const userId = await resolveVerifiedUserId()
  if (!userId) return null
  const orgId = await getCurrentOrgId()
  if (!orgId) return null
  const { data: membership } = await getAdmin()
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  return (membership as { role?: string } | null)?.role ?? null
}

// 403 helper for role-gated routes. Fails closed: a null/insufficient role is
// denied. The owner clears every gate — see roleAllows.
export async function requireRole(allowed: string[]): Promise<NextResponse | null> {
  const role = await getCurrentUserRole()
  if (!roleAllows(role, allowed)) {
    return NextResponse.json(
      { success: false, error: 'Forbidden — insufficient role' },
      { status: 403 }
    )
  }
  return null
}
