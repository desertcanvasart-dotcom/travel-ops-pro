// The symptom, pinned: export a supplier, delete it, import the same file,
// and get the same supplier back.
//
// That is how this bug class is actually found — somebody types their roster
// in by hand, exports it, deletes the records, re-imports, and the data comes
// back missing. Here it came back missing eight of thirteen fields, because
// the export was written by hand on the suppliers page with its own display
// headers ("Code", "Contact", "Email") that the importer does not recognise,
// and because website, address, country and notes were never written at all.
//
// This test runs the real serialiser (Papa.unparse over the shared column set)
// into the real parser (the route's header transform) into the real
// prepareSupplierRows, with no stand-ins between them.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import {
  SUPPLIER_CSV_COLUMNS,
  supplierCsvHeaders,
  supplierCsvRow,
  supplierCsvTemplate,
  supplierCsvTemplateRow,
  prepareSupplierRows,
  type SupplierCsvRow,
} from '@/lib/suppliers/import-csv'

/** What POST /api/suppliers/export writes for these suppliers. */
function exportCsv(suppliers: Record<string, unknown>[]): string {
  return Papa.unparse({
    fields: supplierCsvHeaders(),
    data: suppliers.map(s => {
      const cells = supplierCsvRow(s)
      return SUPPLIER_CSV_COLUMNS.map(c => cells[c.name])
    }),
  })
}

/** What POST /api/suppliers/import does to a file before preparing rows. */
function importRows(csv: string): SupplierCsvRow[] {
  return Papa.parse<SupplierCsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  }).data
}

const SUPPLIER = {
  id: 'aaaa1111-0000-0000-0000-000000000001',
  supplier_code: 'SUP-0042',
  name: 'Nile Dream Cruises',
  type: 'cruise',
  types: ['cruise', 'transport'],
  status: 'active',
  contact_name: 'Reservations desk',
  contact_email: 'res@nile-dream.example',
  contact_phone: '+20 2 1111 2222',
  whatsapp: '+20 100 333 4444',
  website: 'https://nile-dream.example',
  city: 'Luxor',
  country: 'Egypt',
  address: '12 Corniche el-Nil',
  notes: 'Contract renews every October',
}

describe('suppliers: export → delete → re-import', () => {
  it('brings every field back, the portable code included', () => {
    const [prepared] = prepareSupplierRows(importRows(exportCsv([SUPPLIER])), new Set(['cruise', 'transport'])).ready
    expect(prepared).toBeDefined()
    expect(prepared.row).toMatchObject({
      // THE one that mattered most: without it the DB trigger mints a new
      // SUP-####, and every rate CSV exported beside this file points at a
      // supplier_code that no longer exists.
      supplier_code: 'SUP-0042',
      name: 'Nile Dream Cruises',
      types: ['cruise', 'transport'],
      status: 'active',
      contact_name: 'Reservations desk',
      contact_email: 'res@nile-dream.example',
      contact_phone: '+20 2 1111 2222',
      whatsapp: '+20 100 333 4444',
      website: 'https://nile-dream.example',
      city: 'Luxor',
      country: 'Egypt',
      address: '12 Corniche el-Nil',
      notes: 'Contract renews every October',
    })
  })

  it('loses nothing the sheet claims to carry', () => {
    // Stated against the column list rather than a hand-written field list, so
    // a new column cannot be added to the sheet and then quietly dropped.
    const [prepared] = prepareSupplierRows(importRows(exportCsv([SUPPLIER])), new Set(['cruise', 'transport'])).ready
    for (const c of SUPPLIER_CSV_COLUMNS) {
      const source = SUPPLIER[(c.column ?? c.name) as keyof typeof SUPPLIER]
      if (source == null || source === '') continue
      expect(prepared.row[c.column ?? c.name], `${c.name} did not survive the round-trip`).toEqual(source)
    }
  })

  it('survives a quote and a newline in the notes', () => {
    // `.map(v => `"${v || ''}"`).join(',')` — the hand-rolled serialiser this
    // replaced — produced a corrupt file for either of these, and `notes` is a
    // textarea, so a multi-line note is the normal case. A single one used to
    // shift every row below it.
    const awkward = {
      ...SUPPLIER,
      name: 'Nile "Dream" Cruises, Ltd',
      notes: 'Line one\nLine two, with a comma\nHe said "fine"',
    }
    const rows = prepareSupplierRows(importRows(exportCsv([awkward, { ...SUPPLIER, id: 'b', name: 'Second Supplier' }])), new Set(['cruise', 'transport']))
    expect(rows.errors).toEqual([])
    expect(rows.ready).toHaveLength(2)
    expect(rows.ready[0].row).toMatchObject({ name: 'Nile "Dream" Cruises, Ltd', notes: awkward.notes })
    // The row below is untouched — the escape held.
    expect(rows.ready[1].row).toMatchObject({ name: 'Second Supplier', supplier_code: 'SUP-0042' })
  })

  it('exports the headers even when nothing is selected', () => {
    // Papa.unparse(rows) returns "" for zero rows — headers and all — so an
    // empty export would hand back a blank file instead of the sheet's shape.
    expect(exportCsv([]).trim()).toBe(supplierCsvHeaders().join(','))
  })
})

describe('the suppliers template', () => {
  it('puts every example value under its own header', () => {
    // The example row used to be a positional array one value SHORT of the
    // column list, so from `supplier_code` rightwards every cell sat under the
    // wrong header: the sheet taught 'air_carrier' as a Supplier Code and
    // 'Cairo' as a Website.
    const [row] = Papa.parse<Record<string, string>>(supplierCsvTemplate(), { header: true, skipEmptyLines: true }).data
    expect(row).toEqual(supplierCsvTemplateRow())
    expect(row.roles).toBe('air_carrier')
    expect(row.city).toBe('Cairo')
    expect(row.supplier_code).toBe('')
  })

  it('is skipped rather than imported, and validates apart from that', () => {
    const preview = prepareSupplierRows(importRows(supplierCsvTemplate()), new Set(['air_carrier']))
    expect(preview.exampleRowsSkipped).toBe(1)
    expect(preview.ready).toHaveLength(0)
    expect(preview.errors).toEqual([])

    // The same row under a real name must import cleanly — otherwise the sheet
    // is teaching a layout that does not work.
    const filled = importRows(supplierCsvTemplate()).map(r => ({ ...r, name: 'A Real Airline' }))
    const real = prepareSupplierRows(filled, new Set(['air_carrier']))
    expect(real.errors).toEqual([])
    expect(real.ready[0].row).toMatchObject({ name: 'A Real Airline', types: ['air_carrier'], city: 'Cairo' })
  })
})
