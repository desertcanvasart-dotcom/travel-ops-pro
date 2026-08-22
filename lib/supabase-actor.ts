// ============================================
// Service-role client that tells the database WHO is acting
// ============================================
// Rate tables are written with the service-role key, so auth.uid() is NULL
// inside their audit trigger and rate_audit_log.changed_by was NULL on
// every row. This client adds an `x-tops-actor: <user id>` header to each
// PostgREST request, taken from the middleware-verified user header of the
// current request (HMAC-signed, so it cannot be forged by a client).
// PostgREST exposes request headers to SQL, and fn_rate_audit_actor()
// (migration 20260823_rate_change_digest) reads it when auth.uid() is NULL.
//
// Outside a request (cron, scripts) there is no actor and the header is
// simply not sent. Nothing here can fail a query: any lookup error means
// "no actor", never "no write".
// ============================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { VERIFIED_USER_HEADER, verifyVerifiedUserHeader } from '@/lib/auth/verified-user-header'

export const ACTOR_HEADER = 'x-tops-actor'

async function currentActorId(): Promise<string | null> {
  try {
    const store = await headers()
    return await verifyVerifiedUserHeader(store.get(VERIFIED_USER_HEADER))
  } catch {
    return null // no request context
  }
}

const actorFetch: typeof fetch = async (input, init) => {
  const actor = await currentActorId()
  if (!actor) return fetch(input, init)
  const h = new Headers(init?.headers)
  h.set(ACTOR_HEADER, actor)
  return fetch(input, { ...init, headers: h })
}

/** A service-role client whose writes are attributed to the signed-in user. */
export function createActorAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: actorFetch } }
  )
}
