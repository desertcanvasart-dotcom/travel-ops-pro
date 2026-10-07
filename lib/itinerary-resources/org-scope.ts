// ============================================
// A trip's assignments belong to the trip's organisation
// ============================================
// itinerary_resources has no org_id of its own: an assignment is the
// organisation's through its itinerary. The routes read it with the
// service-role client, which bypasses RLS, so each one checks the trip first.
// (The resources themselves — rates, suppliers — are shared by the whole
// install by design and are not scoped.)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Whether this itinerary is the organisation's. */
export async function itineraryInOrg(db: Db, itineraryId: string, orgId: string): Promise<boolean> {
  const { data } = await db.from('itineraries').select('id').eq('id', itineraryId).eq('org_id', orgId).maybeSingle()
  return !!data
}

/** The assignment, when it is on one of the organisation's itineraries. */
export async function assignmentInOrg(
  db: Db, assignmentId: string, orgId: string,
): Promise<{ id: string; itinerary_id: string } | null> {
  const { data } = await db
    .from('itinerary_resources')
    .select('id, itinerary_id, itinerary:itineraries!inner(org_id)')
    .eq('id', assignmentId)
    .eq('itinerary.org_id', orgId)
    .maybeSingle()
  return data ? { id: data.id, itinerary_id: data.itinerary_id } : null
}

/** Of these itinerary ids, the ones that are the organisation's. */
export async function itinerariesInOrg(db: Db, ids: readonly string[], orgId: string): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Set()
  const { data } = await db.from('itineraries').select('id').in('id', unique).eq('org_id', orgId)
  return new Set((data ?? []).map((r: { id: string }) => r.id))
}
