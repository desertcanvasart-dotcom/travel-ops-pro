// ============================================
// What a trip may point at: only its own company's records
// ============================================
// The trip routes write through the service role, which bypasses RLS, and
// took client_id, partner_id, destination_id, thread_id, the guide and the
// vehicle as the request gave them. A booking then embedded the partner by
// that id and copied the other company's partner name onto this company's
// booking; a trip on the other company's client moved that client's figures.
// Each id given must be a row of this org's; absent ids pass. Fails closed —
// a plain 404, as for a missing id. Same shape as lib/org-refs recordsInOrg.

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** The id fields a trip carries, and the table each must be a row of. */
export const TRIP_REF_TABLES = {
  client_id: 'clients',
  partner_id: 'b2b_partners',
  destination_id: 'destinations',
  template_id: 'tour_templates',
  thread_id: 'communication_threads',
  assigned_guide_id: 'suppliers',
  assigned_vehicle_id: 'vehicles',
} as const

export type TripRef = keyof typeof TRIP_REF_TABLES

/** The first field whose id is not this org's row, or null when all are. */
export async function foreignTripRef(
  supabase: DbClient,
  orgId: string,
  refs: Partial<Record<TripRef, unknown>>
): Promise<TripRef | null> {
  for (const field of Object.keys(TRIP_REF_TABLES) as TripRef[]) {
    const id = refs[field]
    if (id === undefined || id === null || id === '') continue
    if (!orgId || typeof id !== 'string') return field
    const { data } = await supabase.from(TRIP_REF_TABLES[field]).select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!data) return field
  }
  return null
}

/** The words a 404 uses for each field. */
export const TRIP_REF_LABELS: Record<TripRef, string> = {
  client_id: 'Client',
  partner_id: 'Partner',
  destination_id: 'Destination',
  template_id: 'Programme',
  thread_id: 'Conversation',
  assigned_guide_id: 'Guide',
  assigned_vehicle_id: 'Vehicle',
}
