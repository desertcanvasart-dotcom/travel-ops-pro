import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createSharedBrowserClient } from '@/app/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// In the browser, ALWAYS return the shared cookie-based @supabase/ssr client
// (app/supabase.ts) — the one the login flow authenticates. A plain
// supabase-js client here looks for its session in localStorage, finds
// nothing (login stores it in cookies), and silently runs every query as
// `anon`. Under RLS that returns zero rows: this exact split broke the
// itinerary edit page ("Itinerary not found") and every other direct
// browser read of an org-scoped table once RLS went live.
//
// On the server (API routes importing this module) there are no request
// cookies to read here, so keep the historical anon client — unchanged
// behavior. Those routes only work against anon-readable tables and should
// migrate to an org-scoped admin client (tracked separately).
export const createClient = (): SupabaseClient => {
  if (typeof window !== 'undefined') {
    return createSharedBrowserClient() as unknown as SupabaseClient
  }
  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = createClient()
