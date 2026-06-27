// ============================================
// DEFAULT ORG RESOLVER — for server-side intake paths with no session
// ============================================
// `lib/auth/current-org.ts` resolves org_id from the operator's session cookie —
// the right tool for routes invoked by a logged-in operator. Server-side intake
// paths (webhooks, scheduled jobs, the WhatsApp inbound webhook) have no
// session, so they need a different resolver.
//
// THIS IS THE PHASE 2 PLACEHOLDER. For the solo case we resolve to a single
// default org — either the value of process.env.DEFAULT_ORG_ID, or the first
// organization row by created_at as a fallback.
//
// WHY A SEPARATE HELPER (not inlined in each intake site):
//   When the G1 gate trips (see DEFERRED_GATES.md), the resolver becomes
//   per-org-webhook-secret-aware: the Concierge webhook will read which
//   secret matched and resolve the org from THAT. WhatsApp will resolve per
//   inbound channel/number config. Both will swap THIS helper out for a
//   signature/channel-aware resolver. The intake call sites don't need to
//   change — only this function does.
//
// CACHE: the org id rarely changes; cache after first resolution within the
// process. Multi-instance deployments will each resolve once.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'

let cachedOrgId: string | null = null

export async function getDefaultOrgId(supabase: SupabaseClient): Promise<string | null> {
  if (cachedOrgId) return cachedOrgId

  const fromEnv = process.env.DEFAULT_ORG_ID
  if (fromEnv && fromEnv.trim()) {
    cachedOrgId = fromEnv.trim()
    return cachedOrgId
  }

  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[default-org] lookup failed (non-fatal):', error.message)
    return null
  }
  if (!data) {
    console.warn('[default-org] no organizations row found; org_id will be NULL on this intake')
    return null
  }

  cachedOrgId = data.id as string
  return cachedOrgId
}
