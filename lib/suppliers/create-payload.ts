// ============================================
// Build the row for INSERT INTO suppliers from a request body
// ============================================
// The suppliers table carries `type` (primary role) AND `types` (the full set
// of roles), with CHECK (type IS NULL OR type = ANY(types)) since
// 20260821_supplier_multi_type.sql. The API's field whitelist left `types`
// off, so every insert dropped it and the CHECK rejected the row (23514) —
// creating a supplier through the form 500'd from that migration onward. This
// module owns the whitelist AND the type/types normalization together, so the
// two can never drift apart again.
// ============================================

import { SUPPLIER_WRITABLE_FIELDS } from './fields'

/** Columns a create request may set. One list with the update route and the
 *  form — see lib/suppliers/fields.ts. `types` MUST be in it — see above. */
export const VALID_SUPPLIER_FIELDS = SUPPLIER_WRITABLE_FIELDS

export type SupplierInsert =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string }

export function buildSupplierInsert(body: Record<string, any>): SupplierInsert {
  const b = { ...body }

  // Reconcile the primary role with the set: the CHECK needs type ∈ types.
  if (Array.isArray(b.types) && b.types.length > 0) {
    b.type = b.type && b.types.includes(b.type) ? b.type : b.types[0]
  } else if (b.type) {
    b.types = [b.type]
  }

  if (!b.name || !b.type) return { ok: false, error: 'Name and type are required' }

  const row: Record<string, unknown> = {}
  for (const key of VALID_SUPPLIER_FIELDS) if (b[key] !== undefined) row[key] = b[key]

  row.country = b.country || 'Egypt'
  row.status = b.status || 'active'

  return { ok: true, row }
}
