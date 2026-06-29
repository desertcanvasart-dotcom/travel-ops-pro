import { describe, it, expect } from 'vitest'

// The compare route's field-diff is pure logic; this mirrors it to lock the
// behaviour (changed-only, deep compare for objects, label mapping).
// Kept in lockstep with app/api/b2b/quotes/[id]/revisions/compare/route.ts.

const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'total_cost', label: 'Total Cost' },
  { key: 'selling_price', label: 'Selling Price' },
  { key: 'services_snapshot', label: 'Services' },
  { key: 'notes', label: 'Notes' },
]

function calculateDifferences(oldData: any, newData: any) {
  const out: Array<{ field: string; label: string; old_value: any; new_value: any }> = []
  for (const f of FIELDS) {
    const oldValue = oldData?.[f.key]
    const newValue = newData?.[f.key]
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      out.push({ field: f.key, label: f.label, old_value: oldValue, new_value: newValue })
    }
  }
  return out
}

describe('quote revision diff', () => {
  it('returns only changed scalar fields', () => {
    const a = { status: 'draft', total_cost: 100, selling_price: 130, notes: 'x' }
    const b = { status: 'sent', total_cost: 100, selling_price: 150, notes: 'x' }
    const diff = calculateDifferences(a, b)
    expect(diff.map((d) => d.field).sort()).toEqual(['selling_price', 'status'])
    expect(diff.find((d) => d.field === 'status')).toMatchObject({ old_value: 'draft', new_value: 'sent', label: 'Status' })
  })

  it('deep-compares object/array fields (services_snapshot)', () => {
    const a = { services_snapshot: [{ id: 1 }] }
    const b = { services_snapshot: [{ id: 2 }] }
    expect(calculateDifferences(a, b).map((d) => d.field)).toEqual(['services_snapshot'])
    expect(calculateDifferences(a, { services_snapshot: [{ id: 1 }] })).toEqual([])
  })

  it('returns [] when nothing changed', () => {
    const a = { status: 'draft', total_cost: 100, selling_price: 130, notes: null }
    expect(calculateDifferences(a, { ...a })).toEqual([])
  })

  it('treats matching nulls as equal and null vs value as changed', () => {
    // to_jsonb(row) snapshots always include every column, so values are
    // null (present) rather than missing.
    expect(calculateDifferences({ notes: null }, { notes: null })).toEqual([])
    expect(calculateDifferences({ notes: null }, { notes: 'hi' }).map((d) => d.field)).toEqual(['notes'])
  })
})
