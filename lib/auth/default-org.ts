// ============================================
// DEFAULT ORG RESOLVER — for server-side intake paths with no session
// ============================================
// `lib/auth/current-org.ts` resolves org_id from the operator's session cookie —
// the right tool for routes invoked by a logged-in operator. Server-side intake
// paths (webhooks, scheduled jobs, the WhatsApp inbound webhook) have no
// session, so they need a different resolver.
//
// It resolves to a single default org — either the value of
// process.env.DEFAULT_ORG_ID, or the first organization row by created_at as
// a fallback. Intake paths that CAN tell the company use their own signal
// first and only fall back to this:
//   - Concierge briefs: the per-company webhook secret that signed the brief
//     (lib/concierge/brief-org.ts); only the legacy single
//     CONCIERGE_WEBHOOK_SECRET lands here.
//   - WhatsApp: the number written to (lib/whatsapp-org.ts).
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
