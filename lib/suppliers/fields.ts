// ============================================
// What a supplier record is allowed to say about itself
// ============================================
// A supplier is WHO we deal with: a name, the roles they fill, how to reach
// them, where they are. Everything a role needs beyond that — a guide's
// languages and day rate, a fleet's vehicle bands, a ship's route, a
// commission — belongs with the RATES for that role, where it is priced and
// where the engine actually reads it. The supplier form used to collect nine
// role-specific extras; 2026-08-22 it was cut back to this, and the extras
// went to the rates area (operator decision: "the supplier form itself should
// be simple; all the details will be in the rates area").
//
// Three lists, one file, so the form and both API whitelists cannot drift:
//   SUPPLIER_FORM_FIELDS    what the supplier form shows, in order
//   SUPPLIER_RATES_FIELDS   supplier-level facts edited from the rates pages
//   SUPPLIER_WRITABLE_FIELDS  everything the API accepts on create/update
// ============================================

export type SupplierFieldKind = 'text' | 'email' | 'tel' | 'url' | 'select' | 'textarea' | 'roles'

export type SupplierFormField = {
  key: string
  /** i18n key under the `suppliers` namespace. */
  labelKey: string
  kind: SupplierFieldKind
  required?: boolean
  /** Section heading (i18n key) the field sits under. */
  sectionKey: 'sectionIdentity' | 'sectionContact' | 'sectionLocation' | 'sectionNotes'
  /** Fixed option list for selects; 'cities' resolves to the city list at render time. */
  options?: 'cities' | readonly string[]
  /** Spans both columns of the grid. */
  wide?: boolean
}

export const SUPPLIER_STATUSES = ['active', 'inactive', 'pending'] as const

/** The whole supplier form. The same for every role — there are no per-role extras. */
export const SUPPLIER_FORM_FIELDS: readonly SupplierFormField[] = [
  { key: 'name',          labelKey: 'supplierName',  kind: 'text',   required: true, sectionKey: 'sectionIdentity' },
  { key: 'supplier_code', labelKey: 'supplierCode',  kind: 'text',   sectionKey: 'sectionIdentity' },
  { key: 'types',         labelKey: 'roles',         kind: 'roles',  required: true, sectionKey: 'sectionIdentity' },
  { key: 'status',        labelKey: 'status',        kind: 'select', sectionKey: 'sectionIdentity', options: SUPPLIER_STATUSES },
  { key: 'contact_name',  labelKey: 'contactPerson', kind: 'text',   sectionKey: 'sectionContact' },
  { key: 'contact_email', labelKey: 'email',         kind: 'email',  sectionKey: 'sectionContact' },
  { key: 'contact_phone', labelKey: 'phone',         kind: 'tel',    sectionKey: 'sectionContact' },
  { key: 'whatsapp',      labelKey: 'whatsApp',      kind: 'tel',    sectionKey: 'sectionContact' },
  { key: 'website',       labelKey: 'website',       kind: 'url',    sectionKey: 'sectionContact' },
  { key: 'city',          labelKey: 'city',          kind: 'select', sectionKey: 'sectionLocation', options: 'cities' },
  { key: 'address',       labelKey: 'address',       kind: 'text',   sectionKey: 'sectionLocation' },
  { key: 'notes',         labelKey: 'notes',         kind: 'textarea', sectionKey: 'sectionNotes', wide: true },
] as const

/** Supplier-level facts that are NOT on the supplier form. Each is edited from
 *  the rates page that prices it, and still saved on the supplier row. */
export const SUPPLIER_RATES_FIELDS = [
  // Guide Rates page — the engine's fallback guide lookup matches on these.
  'languages',
  // Rates › Commissions — direction (we pay / we receive) and default rate.
  'default_commission_rate',
  'commission_type',
] as const

/** Columns the API accepts on create and update. `type` is derived from
 *  `types` (primary role = first role) but may also be sent; `country` is
 *  defaulted server-side. */
export const SUPPLIER_WRITABLE_FIELDS = [
  'name', 'supplier_code', 'type', 'types', 'status',
  'contact_name', 'contact_email', 'contact_phone', 'whatsapp', 'website',
  'city', 'address', 'country',
  'notes',
  ...SUPPLIER_RATES_FIELDS,
] as const

/** Columns that used to be on the form and are now ignored if a client still
 *  sends them. Listed so a test can prove they are neither shown nor written.
 *  The DATA stays on existing rows; nothing here is dropped from the table. */
export const SUPPLIER_RETIRED_FORM_FIELDS = [
  'phone2', 'payment_terms', 'bank_details',
  'vehicle_types', 'routes', 'cabin_count', 'star_rating',
  'cuisine_types', 'capacity', 'daily_rate',
] as const

export const COMMISSION_DIRECTIONS = ['payable', 'receivable'] as const
export type CommissionDirection = (typeof COMMISSION_DIRECTIONS)[number]

/**
 * The commission a supplier row actually carries, as the engine reads it: a
 * rate above 0 and its direction (none stated = "we receive", the
 * generator's own fallback). A rate of 0 is NO commission — the generator
 * skips it as no_rate (lib/commission-generation.ts), so a screen must not
 * show it as "We receive 0%".
 */
export function commissionDirectionOf(s: { default_commission_rate?: number | string | null; commission_type?: string | null }): CommissionDirection | null {
  if (s.default_commission_rate === null || s.default_commission_rate === undefined || s.default_commission_rate === '') return null
  const rate = Number(s.default_commission_rate)
  if (!Number.isFinite(rate) || rate <= 0) return null
  return s.commission_type === 'payable' ? 'payable' : 'receivable'
}

/**
 * Why a create / update body's commission fields are unacceptable, or null.
 * The Commissions page checks 0–100 in the browser; a direct PUT could store
 * -50 or 500, and the generator would pay it. Blank (null / '') clears.
 */
export function commissionFieldError(body: Record<string, unknown>): string | null {
  const rate = body.default_commission_rate
  if (rate !== undefined && rate !== null && rate !== '') {
    const n = typeof rate === 'number' ? rate : typeof rate === 'string' ? Number(rate.trim()) : NaN
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Commission rate must be a number from 0 to 100'
  }
  const type = body.commission_type
  if (type !== undefined && type !== null && type !== '' && !(COMMISSION_DIRECTIONS as readonly unknown[]).includes(type)) {
    return `Commission direction must be one of ${COMMISSION_DIRECTIONS.join(', ')}`
  }
  return null
}
