// ============================================
// ACTIVITY LOG — what changed, before and after
// ============================================
// The middleware row says who called which path. For the changes that decide
// who can do what (a role, an active flag, a membership) and what a customer
// pays (a season premium and its dates), the route that made the change adds
// a row whose `detail` holds the values before and after. Pure and free of
// server imports: the Activity Log page renders it in the browser.

export type ActivityValue = string | number | boolean | null

export interface ActivityChange {
  field: string
  from: ActivityValue
  to: ActivityValue
}

export interface ActivityDetail {
  /** Who or what was changed, in words a reader recognises (an email, a season name). */
  target: string | null
  changes: ActivityChange[]
}

const norm = (v: unknown): ActivityValue => {
  if (v === undefined || v === null) return null
  if (typeof v === 'number' || typeof v === 'boolean') return v
  // Numeric columns come back from PostgREST as strings ("15.00").
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return String(v)
}

/** The fields whose value differs between `before` and `after`, in `fields` order. */
export function diffChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): ActivityChange[] {
  const out: ActivityChange[] = []
  for (const field of fields) {
    const from = norm(before?.[field])
    const to = norm(after?.[field])
    if (from !== to) out.push({ field, from, to })
  }
  return out
}

/** "2027-04-29 – 2027-05-05", or null when there is no window. */
export function dateRange(start: unknown, end: unknown): string | null {
  if (!start || !end) return null
  return `${String(start).slice(0, 10)} – ${String(end).slice(0, 10)}`
}

/** A stored detail, or null for older rows and anything malformed. */
export function readDetail(raw: unknown): ActivityDetail | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as { target?: unknown; changes?: unknown }
  if (!Array.isArray(d.changes)) return null
  const changes = d.changes
    .filter((c): c is ActivityChange => !!c && typeof c === 'object' && typeof (c as ActivityChange).field === 'string')
    .map(c => ({ field: c.field, from: norm(c.from), to: norm(c.to) }))
  return { target: typeof d.target === 'string' ? d.target : null, changes }
}
