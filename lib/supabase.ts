import { type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createSharedBrowserClient } from '@/app/supabase'

// In the browser, ALWAYS return the shared cookie-based @supabase/ssr client
// (app/supabase.ts) — the one the login flow authenticates. A plain
// supabase-js client here looks for its session in localStorage, finds
// nothing (login stores it in cookies), and silently runs every query as
// `anon`. Under RLS that returns zero rows: this exact split broke the
// itinerary edit page ("Itinerary not found") and every other direct
// browser read of an org-scoped table once RLS went live.
//
// On the server there is intentionally NO working client anymore. The API
// routes that used to import the historical anon client here have all been
// migrated to the service-role client (lib/supabase-server.ts) with
// getCurrentOrgId() scoping where the table has org_id. Constructing this
// module during SSR is still harmless (client components that import
// `supabase` evaluate it on the server), so the server branch returns a
// proxy that only throws on first actual use — loudly, instead of silently
// querying as `anon` and getting zero rows under RLS.
export const createClient = (): SupabaseClient => {
  if (typeof window !== 'undefined') {
    return createSharedBrowserClient() as unknown as SupabaseClient
  }
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      // Benign introspection (await-ability checks, serialization, node
      // inspect) must not blow up SSR — only real API usage should throw.
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') {
        return undefined
      }
      throw new Error(
        `lib/supabase: server-side use of the anon client is not supported (accessed '${String(prop)}'). ` +
        `In API routes use createServerClient() from '@/lib/supabase-server' (service role), ` +
        `scoped with getCurrentOrgId() from '@/lib/auth/current-org' on tables that have org_id.`
      )
    },
  })
}

export const supabase = createClient()
