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

import { SUPPLIER_TYPE_VALUES } from '@/lib/supplier-types'
import { SUPPLIER_STATUSES } from '@/lib/suppliers/fields'
import { buildSupplierInsert } from '@/lib/suppliers/create-payload'

export const SUPPLIER_CSV_COLUMNS = [
  { name: 'name', label: 'Name', required: true },
  { name: 'supplier_code', label: 'Supplier Code', required: false, hint: 'portable key (SUP-0001); leave blank to auto-assign' },
  { name: 'roles', label: 'Roles', required: true, hint: `one or more of ${SUPPLIER_TYPE_VALUES.join(' | ')}, separated by ;` },
  { name: 'status', label: 'Status', required: false, hint: SUPPLIER_STATUSES.join(' | ') },
  { name: 'contact_name', label: 'Contact Person', required: false },
  { name: 'contact_email', label: 'Email', required: false },
  { name: 'contact_phone', label: 'Phone', required: false },
  { name: 'whatsapp', label: 'WhatsApp', required: false },
  { name: 'website', label: 'Website', required: false },
  { name: 'city', label: 'City', required: false },
  { name: 'country', label: 'Country', required: false },
  { name: 'address', label: 'Address', required: false },
  { name: 'notes', label: 'Notes', required: false },
] as const

export const EXAMPLE_SUPPLIER_NAME = 'EXAMPLE-DELETE-THIS-ROW'

/** The sheet to start from: a header row plus one example the import skips. */
export function supplierCsvTemplate(): string {
  const header = SUPPLIER_CSV_COLUMNS.map(c => c.name).join(',')
  const example = [
    EXAMPLE_SUPPLIER_NAME, 'air_carrier', 'active', 'Reservations desk', 'groups@example.com',
    '+20 2 0000 0000', '+20 10 0000 0000', 'https://example.com', 'Cairo', 'Egypt', '', 'Contract renews every October',
  ].map(v => `"${v}"`).join(',')
  return `${header}\n${example}\n`
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

/** Turn parsed CSV rows into insert payloads, or say per row why not. */
export function prepareSupplierRows(rows: SupplierCsvRow[]): SupplierImportPreview {
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
    const unknown = roles.filter(r => !(SUPPLIER_TYPE_VALUES as readonly string[]).includes(r))
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
