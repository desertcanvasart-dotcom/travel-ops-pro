// ============================================
// Suppliers from a CSV sheet
// ============================================
// Every rates page can be filled from a spreadsheet; the supplier roster
// could not, so an office with sixty suppliers typed them one by one. This
// is the sheet: one row per supplier, roles as a semicolon list of the
// vocabulary in lib/supplier-types.ts. Pure — the route parses and writes.
//
// Rule, same as the rates create routes since #341: an import never
// rewrites a supplier that exists. A row whose name is already on file is
// reported and skipped; edit that supplier on its page.
//
// SUPPLIER_CSV_COLUMNS below is the ONE definition of that sheet. The export
// route, the template, the importer and the guard test all derive from it.
// They used not to: the export was written by hand on the suppliers page with
// its own nine display headers ("Code", "Contact", "Email"), none of which the
// importer recognises, so export → delete → re-import came back missing the
// supplier_code, every contact field, the website, the address and the notes.
// The supplier_code loss was the worst of it, because a re-imported supplier
// is auto-assigned a NEW SUP-#### by the DB trigger — which silently breaks
// the supplier_code link in every rate CSV that had been exported alongside.

import { SUPPLIER_TYPE_VALUES } from '@/lib/supplier-types'
import { SUPPLIER_STATUSES } from '@/lib/suppliers/fields'
import { buildSupplierInsert } from '@/lib/suppliers/create-payload'

export interface SupplierCsvColumn {
  /** The CSV header, and the key the importer reads. */
  name: string
  label: string
  required: boolean
  hint?: string
  /** The `suppliers` column this cell carries, when it is not `name`. */
  column?: string
  /** The column holds a list; the cell is a `; `-separated join of it. */
  list?: boolean
  /** A value for the template's example row. Omitted = an empty cell. */
  sample?: string
}

export const SUPPLIER_CSV_COLUMNS: readonly SupplierCsvColumn[] = [
  { name: 'name', label: 'Name', required: true, sample: 'EXAMPLE-DELETE-THIS-ROW' },
  { name: 'supplier_code', label: 'Supplier Code', required: false, hint: 'portable key (SUP-0001); leave blank to auto-assign' },
  { name: 'roles', label: 'Roles', required: true, column: 'types', list: true, sample: 'air_carrier', hint: `one or more of ${SUPPLIER_TYPE_VALUES.join(' | ')}, separated by ;` },
  { name: 'status', label: 'Status', required: false, sample: 'active', hint: SUPPLIER_STATUSES.join(' | ') },
  { name: 'contact_name', label: 'Contact Person', required: false, sample: 'Reservations desk' },
  { name: 'contact_email', label: 'Email', required: false, sample: 'groups@example.com' },
  { name: 'contact_phone', label: 'Phone', required: false, sample: '+20 2 0000 0000' },
  { name: 'whatsapp', label: 'WhatsApp', required: false, sample: '+20 10 0000 0000' },
  { name: 'website', label: 'Website', required: false, sample: 'https://example.com' },
  { name: 'city', label: 'City', required: false, sample: 'Cairo' },
  { name: 'country', label: 'Country', required: false, sample: 'Egypt' },
  { name: 'address', label: 'Address', required: false },
  { name: 'notes', label: 'Notes', required: false, sample: 'Contract renews every October' },
]

export const EXAMPLE_SUPPLIER_NAME = 'EXAMPLE-DELETE-THIS-ROW'

/** The sheet's headers, in order — what the export writes and the importer
 *  reads. */
export function supplierCsvHeaders(): string[] {
  return SUPPLIER_CSV_COLUMNS.map(c => c.name)
}

/** One supplier row as the sheet's cells, keyed by header. */
export function supplierCsvRow(supplier: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of SUPPLIER_CSV_COLUMNS) {
    const value = supplier[c.column ?? c.name]
    out[c.name] = c.list
      ? (Array.isArray(value) ? value : value == null ? [] : [value]).filter(Boolean).join('; ')
      : value == null ? '' : String(value)
  }
  return out
}

/** The example row, keyed by header. Built FROM the column list rather than
 *  written out positionally — the hand-written array it replaces was one value
 *  short, so every cell from `supplier_code` rightwards sat under the wrong
 *  header and the sheet taught the wrong layout to anyone who copied it. */
export function supplierCsvTemplateRow(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of SUPPLIER_CSV_COLUMNS) out[c.name] = c.sample ?? ''
  return out
}

/** The sheet to start from: a header row plus one example the import skips. */
export function supplierCsvTemplate(): string {
  const row = supplierCsvTemplateRow()
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`
  return `${supplierCsvHeaders().join(',')}\n${supplierCsvHeaders().map(h => quote(row[h])).join(',')}\n`
}

export interface SupplierCsvRow { [column: string]: string | undefined }

export interface PreparedSupplier {
  line: number
  row: Record<string, unknown>
  name: string
}

export interface SupplierImportPreview {
  ready: PreparedSupplier[]
  errors: { line: number; name: string; message: string }[]
  exampleRowsSkipped: number
}

const norm = (v: unknown) => String(v ?? '').trim()

/** Turn parsed CSV rows into insert payloads, or say per row why not.
 *  `allowedRoles` is the agency's supplier types (lib/supplier-types
 *  allowedSupplierTypeKeys); the built-ins when the caller has no org. */
export function prepareSupplierRows(rows: SupplierCsvRow[], allowedRoles: ReadonlySet<string> = new Set(SUPPLIER_TYPE_VALUES)): SupplierImportPreview {
  const out: SupplierImportPreview = { ready: [], errors: [], exampleRowsSkipped: 0 }
  const seen = new Set<string>()
  rows.forEach((raw, i) => {
    const line = i + 2 // 1-based, after the header
    const name = norm(raw.name)
    if (!name && Object.values(raw).every(v => !norm(v))) return // blank line
    if (name.toUpperCase() === EXAMPLE_SUPPLIER_NAME) { out.exampleRowsSkipped++; return }
    if (!name) { out.errors.push({ line, name: '', message: 'Name is required' }); return }

    const roles = norm(raw.roles ?? raw.types ?? raw.type).split(/[;|,/]/).map(r => r.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean)
    if (roles.length === 0) { out.errors.push({ line, name, message: 'Roles is required' }); return }
    const unknown = roles.filter(r => !allowedRoles.has(r))
    if (unknown.length) { out.errors.push({ line, name, message: `Unknown role: ${unknown.join(', ')}` }); return }

    const status = norm(raw.status).toLowerCase() || 'active'
    if (!(SUPPLIER_STATUSES as readonly string[]).includes(status)) { out.errors.push({ line, name, message: `Status must be one of ${SUPPLIER_STATUSES.join(', ')}` }); return }

    const key = name.toLowerCase()
    if (seen.has(key)) { out.errors.push({ line, name, message: 'Same name appears earlier in the file' }); return }
    seen.add(key)

    const built = buildSupplierInsert({
      name, types: roles, status,
      // A code from the file is honoured; blank leaves the DB trigger to
      // auto-assign the next SUP-####.
      supplier_code: norm(raw.supplier_code) || undefined,
      contact_name: norm(raw.contact_name) || null,
      contact_email: norm(raw.contact_email) || null,
      contact_phone: norm(raw.contact_phone) || null,
      whatsapp: norm(raw.whatsapp) || null,
      website: norm(raw.website) || null,
      city: norm(raw.city) || null,
      country: norm(raw.country) || undefined,
      address: norm(raw.address) || null,
      notes: norm(raw.notes) || null,
    })
    if (!built.ok) { out.errors.push({ line, name, message: built.error }); return }
    out.ready.push({ line, row: built.row, name })
  })
  return out
}
