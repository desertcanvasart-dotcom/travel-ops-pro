import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { prepareSupplierRows, supplierCsvTemplate, EXAMPLE_SUPPLIER_NAME } from '@/lib/suppliers/import-csv'

const parse = (csv: string) => Papa.parse<Record<string, string>>(csv, {
  header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
}).data

describe('supplier CSV import', () => {
  it('the template round-trips: header + one example row the import skips', () => {
    const rows = parse(supplierCsvTemplate())
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe(EXAMPLE_SUPPLIER_NAME)
    const p = prepareSupplierRows(rows)
    expect(p.ready).toEqual([])
    expect(p.exampleRowsSkipped).toBe(1)
  })

  it('builds an insert with roles as an array and the first role as type', () => {
    const p = prepareSupplierRows(parse('name,roles,city\nEgyptAir,air_carrier; tour_operator,Cairo\n'))
    expect(p.errors).toEqual([])
    expect(p.ready[0].row).toMatchObject({ name: 'EgyptAir', types: ['air_carrier', 'tour_operator'], type: 'air_carrier', city: 'Cairo', status: 'active', country: 'Egypt' })
  })

  it('accepts a Roles column written as labels with spaces, case-insensitively', () => {
    const p = prepareSupplierRows(parse('Name,Roles\nNile Air,Air Carrier\n'))
    expect(p.errors).toEqual([])
    expect(p.ready[0].row).toMatchObject({ types: ['air_carrier'] })
  })

  it('names each rejected line and why', () => {
    const p = prepareSupplierRows(parse('name,roles,status\n,hotel,active\nSeti,spaceship,active\nSeti Abu Simbel,hotel,sleeping\nDup,hotel,\nDup,hotel,\n'))
    expect(p.errors.map(e => [e.line, e.message])).toEqual([
      [2, 'Name is required'],
      [3, 'Unknown role: spaceship'],
      [4, 'Status must be one of active, inactive, pending'],
      [6, 'Same name appears earlier in the file'],
    ])
    expect(p.ready.map(r => r.name)).toEqual(['Dup'])
  })
})
