// ============================================
// The service-role client, or a loud failure
// ============================================
// Eight call sites used to read:
//
//   process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
//
// A missing service key therefore did not fail — it silently downgraded the
// route to the anonymous key. That was invisible for as long as the anon key
// could read everything (which, until the 2026-08-21 lockdown, it could: 47
// resources served real rows to it). The route kept "working" while running
// with the wrong identity, and nothing in a log said so.
//
// A privileged client that quietly becomes unprivileged is worse than one that
// refuses to start: the failure surfaces as wrong data, or as no data, at some
// distance from the cause.
//
// The check is LAZY on purpose. `next build` evaluates route modules during
// prerender, and CI builds with placeholder credentials, so throwing at module
// scope would break the build rather than the misconfiguration.
// ============================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient<any, any, any, any, any> | null = null

/**
 * Service-role Supabase client. Throws if the service key is absent rather
 * than falling back to the anonymous key.
 */
export function createServiceClient(): SupabaseClient<any, any, any, any, any> {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set — cannot reach Supabase.')
  }
  if (!key) {
    // Name the old behaviour explicitly: whoever hits this needs to know that
    // the previous version would have carried on with the anon key.
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. This route needs service-role access; ' +
        'it will not fall back to the anonymous key (which the RLS lockdown denies anyway). ' +
        'Set the variable in the deployment environment.'
    )
  }

  cached = createClient(url, key)
  return cached
}

/** Test seam: forget the memoised client so a changed env is picked up. */
export function resetServiceClientForTests(): void {
  cached = null
}
