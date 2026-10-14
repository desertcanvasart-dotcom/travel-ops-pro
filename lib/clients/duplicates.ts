// Is this email already a client of this company?
//
// Email is the key the CRM treats as identifying (the trip auto-link, the
// mailbox sync and the B2B convert all look clients up by it). Two records
// with one address make those lookups misbehave — .maybeSingle() errors on two
// rows and the caller treats that as "not found" and makes a third — so a
// second one is refused at creation unless the operator insists.
import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLike } from '@/lib/db/escape-like'

export interface ExistingClient {
  id: string
  client_code: string
  name: string
}

/** The company's client holding this address, in any capitalisation, or null. */
export async function findClientByEmail(
  db: SupabaseClient,
  orgId: string,
  email: string,
  excludeId?: string,
): Promise<ExistingClient | null> {
  const address = email.trim()
  if (!address) return null
  let query = db
    .from('clients')
    .select('id, client_code, first_name, last_name')
    .eq('org_id', orgId)
    // Exact, not fuzzy: `_` and `%` are legal in an address but are LIKE
    // wildcards, so they are escaped and ilike only ignores the case.
    .ilike('email', escapeLike(address))
    .order('created_at', { ascending: true })
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  const row = (data as Array<{ id: string; client_code: string; first_name: string | null; last_name: string | null }> | null)?.[0]
  if (!row) return null
  return {
    id: row.id,
    client_code: row.client_code,
    name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
  }
}
