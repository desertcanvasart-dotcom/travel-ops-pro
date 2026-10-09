// ============================================
// A record's trip and client must be the organisation's own
// ============================================
// Payments and invoices stored itinerary_id / client_id as the request gave
// them, through the service role. The list endpoints then embedded the trip
// through that key — another org's client name, phone and email on this org's
// payments and receipts pages — and the receipt WhatsApp went to that client.
// Same shape as quoteRefsInOrg (lib/b2b/quote-scope). A plain 404 for a
// foreign id, as for a missing one.

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** Each id given must be a row of this org's. Absent ids pass. Fails closed. */
export async function recordsInOrg(
  supabase: DbClient,
  orgId: string,
  refs: { itinerary_id?: unknown; client_id?: unknown }
): Promise<boolean> {
  if (!orgId) return false
  const checks: Array<[string, unknown]> = [['itineraries', refs.itinerary_id], ['clients', refs.client_id]]
  for (const [table, id] of checks) {
    if (id === undefined || id === null || id === '') continue
    if (typeof id !== 'string') return false
    const { data } = await supabase.from(table).select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!data) return false
  }
  return true
}
