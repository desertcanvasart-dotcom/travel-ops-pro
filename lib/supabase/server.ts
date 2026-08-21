// Server-side Supabase client. Delegates to the shared service-role factory,
// which throws on a missing key instead of silently degrading to the anon key
// — see lib/supabase/service-client.ts for why that mattered.
import { createServiceClient } from './service-client'

export const createClient = () => createServiceClient()
