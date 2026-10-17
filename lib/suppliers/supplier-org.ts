// ============================================
// Whose suppliers a supplier helper may see
// ============================================
// suppliers and supplier_properties belong to one company (org_id, migration
// 20261205). Every helper in lib/suppliers/ resolves ids, names and codes
// within ONE company: a rate form or CSV must never link another company's
// supplier.
//
// The helpers take the company explicitly. The rate routes that call them
// predate per-company suppliers, so when a caller passes nothing the helper
// asks for the request's own company (getCurrentOrgId) — and with no company
// it resolves nothing (fails closed). Passing null is "no company": nothing.

import { getCurrentOrgId } from '@/lib/auth/current-org'

export async function supplierOrgId(orgId?: string | null): Promise<string | null> {
  if (orgId !== undefined) return orgId || null
  try {
    return await getCurrentOrgId()
  } catch {
    // Outside a request (a script, a test without a session): no company.
    return null
  }
}

/** A uuid no row has: filtering by it matches nothing. */
export const NO_SUPPLIER_ID = '00000000-0000-0000-0000-000000000000'

/**
 * For a rate list's `?supplier_id=` filter: the id itself when it is one of
 * the caller's company's suppliers, otherwise an id that matches nothing — so
 * another company's supplier id lists no rates (the same answer as an id that
 * does not exist), whatever the rate table holds.
 */
export async function ownSupplierFilterId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => any },
  supplierId: string,
  orgId?: string | null
): Promise<string> {
  const org = await supplierOrgId(orgId)
  if (!org || !supplierId) return NO_SUPPLIER_ID
  const { data } = await db.from('suppliers').select('id').eq('id', supplierId).eq('org_id', org).maybeSingle()
  return data ? supplierId : NO_SUPPLIER_ID
}
