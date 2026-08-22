import { createActorAdminClient } from '@/lib/supabase-actor'

// ============================================
// SERVER-SIDE SUPABASE CLIENT
// Use this in ALL API routes (app/api/**)
// Uses the service role key to bypass RLS
//
// DO NOT use @/app/supabase in API routes —
// that is a browser client and will fail
// intermittently due to missing auth context.
// ============================================

// Both clients send the verified user as x-tops-actor (see lib/supabase-actor)
// so triggers can attribute service-role writes; outside a request the
// header is simply absent.
export const supabaseServer = createActorAdminClient()

export function createServerClient() {
  return createActorAdminClient()
}
