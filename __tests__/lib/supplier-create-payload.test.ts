// Creating a supplier through the form 500'd from the multi-type migration
// onward: the field whitelist dropped `types`, the row went in with an empty
// set, and CHECK (type = ANY(types)) rejected it (23514). These pin that the
// built row always carries `types` and that type ∈ types.
import { describe, it, expect } from 'vitest'
import { buildSupplierInsert, VALID_SUPPLIER_FIELDS } from '@/lib/suppliers/create-payload'

describe('buildSupplierInsert', () => {
  it('keeps `types` — the field whose absence broke supplier creation', () => {
    expect(VALID_SUPPLIER_FIELDS).toContain('types')
    const r = buildSupplierInsert({ name: 'A', type: 'guide', types: ['guide'] })
    expect(r.ok && r.row.types).toEqual(['guide'])
  })

  it('derives types from a lone type, so the CHECK is always satisfiable', () => {
    const r = buildSupplierInsert({ name: 'A', type: 'guide' })
    expect(r.ok && r.row.type).toBe('guide')
    expect(r.ok && r.row.types).toEqual(['guide'])
  })

  it('keeps the primary type inside the set when both are sent', () => {
    const r = buildSupplierInsert({ name: 'A', type: 'driver', types: ['guide', 'driver'] })
    expect(r.ok && r.row.type).toBe('driver')
    expect(r.ok && r.row.types).toEqual(['guide', 'driver'])
  })

  it('repairs a primary type that is not in the set instead of inserting an invalid row', () => {
    const r = buildSupplierInsert({ name: 'A', type: 'guide', types: ['driver'] })
    // type must be one of types or the DB rejects it — fall back to the set's first.
    expect(r.ok && r.row.type).toBe('driver')
  })

  it('requires a name and a type', () => {
    expect(buildSupplierInsert({ type: 'guide' })).toEqual({ ok: false, error: 'Name and type are required' })
    expect(buildSupplierInsert({ name: 'A' })).toEqual({ ok: false, error: 'Name and type are required' })
  })

  it('drops unknown columns and defaults the rest', () => {
    const r = buildSupplierInsert({ name: 'A', type: 'guide', bogus_column: 1, id: 'attacker-set' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row).not.toHaveProperty('bogus_column')
    expect(r.row).not.toHaveProperty('id')
    expect(r.row.country).toBe('Egypt')
    expect(r.row.status).toBe('active')
  })
})
