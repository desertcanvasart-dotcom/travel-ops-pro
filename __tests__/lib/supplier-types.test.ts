// ============================================
// One vocabulary, in step with the database
// ============================================
// The supplier types had drifted into four hardcoded copies, and the booking
// page's was the oldest: nine values, missing every type added since, offering
// "Flight" and "Entrance/Ticket" for roles the database calls air_carrier and
// attraction. These tests fail the moment a list and the CHECK disagree again.

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { SUPPLIER_TYPES, SUPPLIER_TYPE_VALUES, supplierTypeLabel, SUPPLIER_TYPE_GROUPS } from '@/lib/supplier-types'

/**
 * The allowed set, read from the CHECK that actually constrains the column.
 *
 * This used to read one historical migration. Since the T3 squash the baseline
 * schema is the authority — a pg_dump of the live database — so this now reads
 * what the database really enforces rather than what one migration once said.
 */
function valuesFromMigration(): string[] {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations/20260829_baseline_schema.sql'),
    'utf8'
  )
  const start = sql.indexOf('CONSTRAINT suppliers_type_check CHECK')
  if (start === -1) throw new Error('suppliers_type_check not found in the baseline schema')
  // pg_dump renders it as ARRAY['hotel'::character varying, ...]; stop at the
  // end of that array so the neighbouring constraints are not swept in.
  const check = sql.slice(start, sql.indexOf(']', start))
  return [...new Set([...check.matchAll(/'([a-z_]+)'/g)].map(m => m[1]))]
}

describe('supplier type vocabulary', () => {
  it('offers exactly what the database allows', () => {
    expect([...SUPPLIER_TYPE_VALUES].sort()).toEqual([...valuesFromMigration()].sort())
  })

  it('has no duplicates', () => {
    expect(new Set(SUPPLIER_TYPE_VALUES).size).toBe(SUPPLIER_TYPE_VALUES.length)
  })

  it('puts every type in exactly one group', () => {
    const grouped = SUPPLIER_TYPE_GROUPS.flatMap(g => g.options.map(o => o.value))
    expect([...grouped].sort()).toEqual([...SUPPLIER_TYPE_VALUES].sort())
  })

  it('labels the legacy values the booking page used to write', () => {
    // booking_supplier_status is empty today, but a row written before this
    // must not render as a raw slug if one turns up.
    expect(supplierTypeLabel('flight')).toBe('Air Carrier')
    expect(supplierTypeLabel('entrance')).toBe('Attraction / Ticket')
    expect(supplierTypeLabel('activity')).toBe('Activity Provider')
  })

  it('never renders an empty or raw value', () => {
    expect(supplierTypeLabel(null)).toBe('Other')
    expect(supplierTypeLabel('')).toBe('Other')
    expect(supplierTypeLabel('something_new')).toBe('Something New')
  })

  it('keeps the suppliers screen in step with the same list', () => {
    // That screen carries icons and colours per type, so it keeps its own map —
    // but it must not offer a type the database would reject, nor miss one.
    const page = fs.readFileSync(path.resolve(process.cwd(), 'app/suppliers/suppliers-content.tsx'), 'utf8')
    const config = page.slice(page.indexOf('const TYPE_CONFIG'), page.indexOf('const STATUS_COLORS'))
    const keys = [...config.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    expect([...keys].sort()).toEqual([...SUPPLIER_TYPE_VALUES].sort())
  })
})
