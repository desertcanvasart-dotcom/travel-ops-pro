// ============================================
// WHICH COMPANY A CONCIERGE BRIEF BELONGS TO
// ============================================
// Decided by the secret that signed it (lib/concierge-webhook-auth.ts):
//   - a per-company secret (CONCIERGE_WEBHOOK_SECRETS, keyed by
//     organizations.slug) → that organisation;
//   - the legacy single secret (CONCIERGE_WEBHOOK_SECRET[_PREVIOUS]) → the
//     default organisation (lib/auth/default-org.ts), as every brief was
//     filed before per-company secrets existed.
// A slug that names no organisation is a misconfiguration: the brief is
// REFUSED (the concierge retries), never filed under a guessed company.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDefaultOrgId } from '@/lib/auth/default-org'

export type BriefOrgResolution =
  | { ok: true; orgId: string }
  | { ok: false; reason: 'unknown_org_slug' | 'no_default_org'; message: string }

export async function resolveBriefOrg(orgSlug: string | null, db: SupabaseClient): Promise<BriefOrgResolution> {
  if (orgSlug) {
    const { data, error } = await db.from('organizations').select('id').eq('slug', orgSlug).maybeSingle()
    if (error || !data?.id) {
      return {
        ok: false,
        reason: 'unknown_org_slug',
        message: `CONCIERGE_WEBHOOK_SECRETS names "${orgSlug}", which is no organisation's slug.`,
      }
    }
    return { ok: true, orgId: data.id as string }
  }
  const orgId = await getDefaultOrgId(db)
  if (!orgId) return { ok: false, reason: 'no_default_org', message: 'No organisation to file the brief under.' }
  return { ok: true, orgId }
}
