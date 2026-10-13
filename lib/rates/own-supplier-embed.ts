// ============================================
// A rate's embedded supplier — only when it is the company's own
// ============================================
// The rate lists embed the linked supplier (`supplier:suppliers(...)`) through
// the service-role client, and a PostgREST embed has no org filter of its own.
// A rate that carried another company's supplier_id — every write stored it
// unchecked until the writes went through validateAndResolveSupplierFields —
// handed back that company's supplier name, phone and email to anyone who can
// read the list (agents, through the pickers).
//
// So the embed selects the supplier's org_id, and this drops the embed when it
// is not the caller's company, and strips org_id from the one it keeps.

/** The embed to select: the columns the screens show, plus org_id for the check. */
export const OWN_SUPPLIER_EMBED = 'supplier:suppliers(id, name, city, contact_phone, contact_email, org_id)'

type WithSupplier = { supplier?: unknown }

/** One row: its supplier embed when it is this company's, else null. */
export function ownSupplierOnRow<T extends WithSupplier>(row: T, orgId: string): T {
  if (!row || typeof row !== 'object' || !('supplier' in row)) return row
  const s = row.supplier as Record<string, unknown> | null | undefined
  if (!s || typeof s !== 'object') return row
  if (s.org_id !== orgId) return { ...row, supplier: null }
  const { org_id: _org, ...visible } = s
  void _org
  return { ...row, supplier: visible }
}

/** Every row of a list, through ownSupplierOnRow. */
export function ownSupplierOnRows<T extends WithSupplier>(rows: readonly T[] | null | undefined, orgId: string): T[] {
  return (rows ?? []).map(r => ownSupplierOnRow(r, orgId))
}
