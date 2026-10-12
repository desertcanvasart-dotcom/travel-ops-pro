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

/** Each id given must be a row of this org's. Absent ids pass. Fails closed.
 *  supplier_id: suppliers carry org_id since migration 20261205. */
export async function recordsInOrg(
  supabase: DbClient,
  orgId: string,
  refs: { itinerary_id?: unknown; client_id?: unknown; invoice_id?: unknown; supplier_id?: unknown }
): Promise<boolean> {
  if (!orgId) return false
  const checks: Array<[string, unknown]> = [
    ['itineraries', refs.itinerary_id],
    ['clients', refs.client_id],
    ['invoices', refs.invoice_id],
    ['suppliers', refs.supplier_id],
  ]
  for (const [table, id] of checks) {
    if (id === undefined || id === null || id === '') continue
    if (typeof id !== 'string') return false
    const { data } = await supabase.from(table).select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!data) return false
  }
  return true
}

// What a task may link to (app/tasks: client, itinerary, invoice, expense).
const TASK_LINK_TABLES: Record<string, string> = {
  itinerary: 'itineraries',
  client: 'clients',
  invoice: 'invoices',
  expense: 'expenses',
}

/**
 * A task's assignee, department and linked record must each be this org's
 * (team_members and departments carry org_id since migration 20261203).
 * Absent refs pass; a link of an unknown kind does not. Fails closed.
 */
export async function taskRefsInOrg(
  supabase: DbClient,
  orgId: string,
  refs: { assigned_to?: unknown; department_id?: unknown; linked_type?: unknown; linked_id?: unknown }
): Promise<boolean> {
  if (!orgId) return false
  const checks: Array<[string, unknown]> = [
    ['team_members', refs.assigned_to],
    ['departments', refs.department_id],
  ]
  if (refs.linked_id !== undefined && refs.linked_id !== null && refs.linked_id !== '') {
    const table = typeof refs.linked_type === 'string' ? TASK_LINK_TABLES[refs.linked_type] : undefined
    if (!table) return false
    checks.push([table, refs.linked_id])
  }
  for (const [table, id] of checks) {
    if (id === undefined || id === null || id === '') continue
    if (typeof id !== 'string') return false
    const { data } = await supabase.from(table).select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!data) return false
  }
  return true
}
