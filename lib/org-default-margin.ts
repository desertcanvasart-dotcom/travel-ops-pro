// ============================================
// The margin a company sells at by default
// ============================================
// Resolution order, everywhere a margin is needed and none was given:
//   request → user preference → organizations.default_margin_percent → 25
// 25 is the engine's historical default and only survives for an org that
// has never set one. Like lib/org-rate-currency.ts: never throws — pricing
// must not stop over a settings lookup.
// ============================================

export const FALLBACK_MARGIN_PERCENT = 25

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrgReader = { from(table: string): any }

/** Coerce to a margin in [0, 100], else null. */
export function normaliseMargin(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

/** The org's default margin, or null when none is configured / readable. */
export async function getOrgDefaultMargin(db: OrgReader, orgId: string | null | undefined): Promise<number | null> {
  if (!orgId) return null
  try {
    const { data, error } = await db.from('organizations').select('default_margin_percent').eq('id', orgId).maybeSingle()
    if (error) {
      console.warn(`[org-margin] could not read organizations.default_margin_percent for ${orgId}: ${error.message}`)
      return null
    }
    return normaliseMargin(data?.default_margin_percent)
  } catch (e) {
    console.warn(`[org-margin] lookup threw for ${orgId}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/**
 * One function for the whole chain. Pass what you have; the first usable
 * value wins. `requested` is what a caller explicitly sent (0 is a real
 * margin and is honoured); `userPreference` the user's own setting.
 */
export function resolveMarginPercent(input: {
  requested?: unknown
  userPreference?: unknown
  orgDefault?: unknown
}): number {
  return (
    normaliseMargin(input.requested) ??
    normaliseMargin(input.userPreference) ??
    normaliseMargin(input.orgDefault) ??
    FALLBACK_MARGIN_PERCENT
  )
}
