// ============================================
// The Supplier Documents list's tiles: counted by the database
// ============================================
// The tiles were counted from the rows the list had loaded, so they followed
// the type and status filters (with Status "Sent", Draft, Confirmed and
// Completed read 0), the Total counted cancelled documents no tile showed,
// and a PostgREST row cap would have capped Total silently. They are now one
// count per status over the company's documents (or one trip's, when the list
// is opened for a trip), whatever the list is filtered to.

import { SUPPLIER_DOCUMENT_STATUSES, type SupplierDocumentStatus } from './supplier-document-fields'

export type SupplierDocumentStats = { total: number } & Record<SupplierDocumentStatus, number>

type CountQuery = PromiseLike<{ count: number | null; error: { message?: string } | null }> & {
  eq(col: string, value: string): CountQuery
}
type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function supplierDocumentStats(
  db: Db,
  orgId: string,
  itineraryId?: string | null
): Promise<SupplierDocumentStats> {
  const count = async (status?: string): Promise<number> => {
    let q = db.from('supplier_documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId) as CountQuery
    if (itineraryId) q = q.eq('itinerary_id', itineraryId)
    if (status) q = q.eq('status', status)
    const { count: n, error } = await q
    if (error) throw new Error(error.message || 'Could not count documents')
    return n ?? 0
  }
  const [total, ...byStatus] = await Promise.all([undefined, ...SUPPLIER_DOCUMENT_STATUSES].map(s => count(s)))
  const stats = { total } as SupplierDocumentStats
  SUPPLIER_DOCUMENT_STATUSES.forEach((s, i) => { stats[s] = byStatus[i] })
  return stats
}
