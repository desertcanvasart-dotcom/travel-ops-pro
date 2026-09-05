// A supplier with money or records attached must refuse to delete and say why.
// Bulk delete depends on this: one blocked supplier in a selection fails alone,
// with its reason, while the rest go.
import { describe, it, expect } from 'vitest'
import { describeBlockers, SUPPLIER_REFERENCE_CHECKS } from '@/lib/suppliers/delete-guard'

describe('describeBlockers', () => {
  it('allows deletion when nothing references the supplier', () => {
    expect(describeBlockers(SUPPLIER_REFERENCE_CHECKS.map((c) => ({ label: c.label, count: 0 })))).toBeNull()
  })

  it('names every blocking reference with its count', () => {
    const msg = describeBlockers([
      { label: 'invoices', count: 3 },
      { label: 'expenses', count: 0 },
      { label: 'child properties', count: 2 },
    ])
    expect(msg).toBe('Supplier is referenced by 3 invoices, 2 child properties — deactivate it instead')
  })

  it('guards the money tables, not the rate tables', () => {
    // Rates are ON DELETE SET NULL by design — a deleted supplier's rates
    // become unattributed, as single-row delete has always behaved.
    const tables = SUPPLIER_REFERENCE_CHECKS.map((c) => c.table)
    for (const t of ['supplier_invoices', 'expenses', 'commissions', 'itinerary_services']) expect(tables).toContain(t)
    for (const t of ['guide_rates', 'transportation_rates', 'hotel_staff_rates']) expect(tables).not.toContain(t)
  })

  it('does not query the dropped supplier-IS-property column', () => {
    // suppliers.parent_supplier_id was dropped by 20260831_supplier_properties.sql.
    // A check against a missing column errors, reads as count 0, and passes
    // silently — dead weight. Properties now live in supplier_properties with
    // ON DELETE CASCADE, so the guard has nothing to count there.
    expect(SUPPLIER_REFERENCE_CHECKS.some((c) => String(c.column) === 'parent_supplier_id')).toBe(false)
  })
})
