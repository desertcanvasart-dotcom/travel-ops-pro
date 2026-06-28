// ============================================
// orgAuth() — one-call org-scoped auth for API routes.
// ============================================
// Mirrors the shape the sibling app's requireAuth() returns, but resolves THIS
// app's org_id (not tenant_id). Lets org-scoped CRUD routes ported from the
// sibling keep their structure: an RLS-scoped client + org_id + the user.
//
//   const auth = await orgAuth()
//   if (auth.error) return NextResponse.json({ success:false, error:auth.error }, { status:auth.status })
//   const { supabase, org_id, user } = auth
//
// RLS on org-scoped tables (via public.user_is_in_org) enforces isolation; the
// explicit .eq('org_id', org_id) in route handlers is belt-and-braces.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId } from '@/lib/auth/current-org'

export interface OrgAuthResult {
  error: string | null
  status: number
  supabase: SupabaseClient | null
  org_id: string | null
  user: { id: string } | null
}

export async function orgAuth(): Promise<OrgAuthResult> {
  const supabase = createServerClient()
  const orgId = await getCurrentOrgId()
  if (!orgId) {
    return { error: 'No organization membership for current user', status: 403, supabase: null, org_id: null, user: null }
  }
  const { data } = await supabase.auth.getUser()
  return { error: null, status: 200, supabase, org_id: orgId, user: data?.user ? { id: data.user.id } : null }
}
