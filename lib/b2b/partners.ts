// ============================================
// B2B partner input rules (POST / PUT /api/b2b/partners)
// ============================================
// The routes inserted and updated the raw body: any column was writable
// (created_by, an `id` on create, is_active as a string), a margin of 150 was
// stored and then priced as "not set" (the engine reads a margin outside
// 0-100 as none), numeric(5,2) overflowed to a 500 at 1000, and a blank
// partner_code was stored as ''. One allowlist, run for both.
//
// currency, show_net_rates, show_cost_breakdown, pricing_model, credit_limit
// and payment_terms are not accepted: nothing reads them and the form no
// longer shows them (the columns stay).

type Parsed = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

const TEXT_FIELDS: Array<[string, number]> = [
  ['contact_name', 255],
  ['email', 255],
  ['phone', 50],
  ['country', 100],
  ['notes', 5000],
]
const PERCENT_FIELDS: Array<[string, string]> = [
  ['default_margin_percent', 'Default margin'],
  ['commission_percent', 'Commission'],
]

export const PARTNER_CODE_MAX = 20

/** A percentage 0-100 (blank clears it), or an error string. */
function percent(value: unknown, label: string): { value: number | null } | { error: string } {
  if (value === null || value === undefined || value === '') return { value: null }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 100) return { error: `${label} must be a number between 0 and 100` }
  return { value: Math.round(n * 100) / 100 }
}

/**
 * Validate a partner body against the allowlist. `create` requires a company
 * name. A blank partner_code is left out of `data` (create generates one,
 * update keeps the old one) — an empty code is never stored.
 */
export function parsePartnerInput(body: unknown, mode: 'create' | 'update'): Parsed {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if (b.company_name !== undefined || mode === 'create') {
    const name = typeof b.company_name === 'string' ? b.company_name.trim() : ''
    if (!name) return { ok: false, error: 'Company name is required' }
    if (name.length > 255) return { ok: false, error: 'Company name is too long' }
    data.company_name = name
  }

  if (typeof b.partner_code === 'string' && b.partner_code.trim()) {
    const code = b.partner_code.trim()
    if (code.length > PARTNER_CODE_MAX) return { ok: false, error: `Partner code must be at most ${PARTNER_CODE_MAX} characters` }
    data.partner_code = code
  }

  for (const [field, max] of TEXT_FIELDS) {
    if (b[field] === undefined) continue
    if (b[field] !== null && typeof b[field] !== 'string') return { ok: false, error: `${field} must be text` }
    const v = ((b[field] as string | null) ?? '').trim()
    if (v.length > max) return { ok: false, error: `${field} is too long` }
    data[field] = v || null
  }

  for (const [field, label] of PERCENT_FIELDS) {
    if (b[field] === undefined) continue
    const r = percent(b[field], label)
    if ('error' in r) return { ok: false, error: r.error }
    data[field] = r.value
  }

  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return { ok: false, error: 'is_active must be true or false' }
    data.is_active = b.is_active
  }

  return { ok: true, data }
}

/** The part of a company name a code starts with: letters and digits only. */
function codePrefix(name: unknown): string {
  // The first three RAW characters of "QA Test Partner" are "QA ", which once
  // generated "QA -046" — a space inside an identifier (audit AUT-W06). A name
  // with fewer than three usable characters falls back rather than padding.
  const usable = (typeof name === 'string' ? name : '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return usable.length >= 3 ? usable.substring(0, 3) : 'PTR'
}

/**
 * The next free `PREFIX-NNN` for this company. `taken` is every code the
 * company already uses (any case). The three-digit numbers are probed from a
 * random start; once all 1000 of a prefix are taken it widens to four digits,
 * so generation can always finish.
 */
export function nextPartnerCode(name: unknown, taken: Iterable<string>, random: () => number = Math.random): string {
  const used = new Set<string>()
  for (const c of taken) used.add(String(c).toUpperCase())
  const prefix = codePrefix(name)
  for (const width of [3, 4]) {
    const size = 10 ** width
    const start = Math.floor(random() * size)
    for (let i = 0; i < size; i++) {
      const code = `${prefix}-${String((start + i) % size).padStart(width, '0')}`
      if (!used.has(code)) return code
    }
  }
  // Ten thousand codes under one prefix: not reachable in practice.
  return `${prefix}-${Date.now().toString().slice(-8)}`
}

/** Postgres unique_violation, as supabase-js reports it. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

export function partnerCodeTaken(code: string): string {
  return `The partner code "${code}" is already used by another partner in your company`
}

export interface PartnerRefCounts { quotes: number; trips: number; bookings: number }

/** Why a partner cannot be deleted, or null when nothing references it. */
export function partnerDeleteBlock(name: string, c: PartnerRefCounts): string | null {
  const parts: string[] = []
  if (c.quotes > 0) parts.push(`${c.quotes} ${c.quotes === 1 ? 'quote' : 'quotes'}`)
  if (c.trips > 0) parts.push(`${c.trips} ${c.trips === 1 ? 'trip' : 'trips'}`)
  if (c.bookings > 0) parts.push(`${c.bookings} ${c.bookings === 1 ? 'booking' : 'bookings'}`)
  if (parts.length === 0) return null
  return `Cannot delete ${name}: it is used by ${parts.join(', ')}. Deactivate it instead.`
}

export interface PartnerStats { total: number; active: number; countries: number; avg_margin: number | null }

/**
 * The Partners page's tiles, over ALL of the company's partners (not the rows
 * the filter loaded — with "Active only" on, Total always equalled Active). A
 * margin of 0 or none is "not set" to the pricing engine, so the average is
 * over the partners that set one.
 */
export function partnerStats(rows: ReadonlyArray<{ is_active?: boolean | null; country?: string | null; default_margin_percent?: unknown }>): PartnerStats {
  const margins = rows
    .map(r => Number(r.default_margin_percent))
    .filter(n => Number.isFinite(n) && n > 0 && n <= 100)
  return {
    total: rows.length,
    active: rows.filter(r => r.is_active !== false).length,
    countries: new Set(rows.map(r => (r.country ?? '').trim()).filter(Boolean)).size,
    avg_margin: margins.length ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10 : null,
  }
}
