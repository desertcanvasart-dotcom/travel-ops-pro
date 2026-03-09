import { createClient } from '@supabase/supabase-js'

// ============================================
// SERVER-SIDE SUPABASE CLIENT
// Use this in ALL API routes (app/api/**)
// Uses the service role key to bypass RLS
//
// DO NOT use @/app/supabase in API routes —
// that is a browser client and will fail
// intermittently due to missing auth context.
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey)

export function createServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}
