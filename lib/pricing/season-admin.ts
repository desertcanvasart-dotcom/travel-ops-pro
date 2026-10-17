// Shared validation for the season calendar the pricing engine reads.
// Kept out of the route files because Next type-checks what a route.ts may
// export, and because a percentage the operator typed should be rejected in
// one place whether it arrives on a create or an edit.

export const SEASON_COLOURS = [
  '#647C47', '#c2410c', '#b45309', '#7c2d12', '#166534', '#1d4ed8', '#6d28d9', '#be123c',
]

/** A percentage the operator typed, or null if it was not a usable number. */
export function parseUpliftPercent(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
  if (!Number.isFinite(n)) return null
  // Mirrors the CHECK on the column, so a bad value is a 400 here rather than a
  // 500 from Postgres.
  if (n < 0 || n > 200) return null
  return Math.round(n * 100) / 100
}

export function isHexColour(raw: unknown): raw is string {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw)
}

/** A calendar date, or null. Anything with a time on it is not a window edge. */
export function parseDateOnly(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const iso = raw.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  // Round-trip so 2026-02-31 is rejected rather than silently becoming March.
  return new Date(t).toISOString().slice(0, 10) === iso ? iso : null
}

// The columns are varchar(80) and varchar(120). A longer value used to reach
// Postgres and come back as a bare 500 ("Failed to create season"), with no
// word about why.
export const SEASON_NAME_MAX = 80
export const SEASON_LABEL_MAX = 120

/** A 400 message when a typed name or label is too long, else null. */
export function lengthError(kind: 'name' | 'label', value: string): string | null {
  const max = kind === 'name' ? SEASON_NAME_MAX : SEASON_LABEL_MAX
  // Characters as Postgres counts them (code points), not UTF-16 units.
  if ([...value].length <= max) return null
  return kind === 'name'
    ? `Season name can be at most ${max} characters`
    : `Label can be at most ${max} characters`
}
