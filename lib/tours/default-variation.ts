// ============================================
// Which variation a tour opens on
// ============================================
// The tour page, its language versions and copy-translate all open a template
// on "its first variation". That used to be `.order('tier').limit(1)` with no
// is_active filter: alphabetical (budget < deluxe < luxury < standard), and a
// withdrawn variation the catalogue no longer lists still opened — and was
// priced — from View Details.
//
// One rule now, for all three: only active variations, and the company's own
// default tier first (what "standard" means on its ladder — the tier the
// pricing engine and the B2B calculator price at unless told otherwise), then
// up the ladder from the lowest. A tier not on the ladder comes last.

import type { SupabaseClient } from '@supabase/supabase-js'
import { defaultTierKey } from '@/lib/vocabulary'
import { tierLadderForOrg } from '@/lib/vocabulary-server'

/** The active variations, best default first (see above). */
export function orderVariationsForDefault<T extends { tier?: string | null; is_active?: boolean | null }>(
  variations: readonly T[],
  ladder: readonly string[]
): T[] {
  const preferred = defaultTierKey(ladder)
  const rank = (tier: string | null | undefined): number => {
    if (tier && tier === preferred) return -1
    const pos = tier ? ladder.indexOf(tier) : -1
    return pos < 0 ? ladder.length : pos
  }
  return variations
    .filter(v => v.is_active !== false)
    .slice()
    .sort((a, b) => rank(a.tier) - rank(b.tier) || String(a.tier ?? '').localeCompare(String(b.tier ?? '')))
}

/** The variation a template opens on, or null when it has no active one. */
export function pickDefaultVariation<T extends { tier?: string | null; is_active?: boolean | null }>(
  variations: readonly T[],
  ladder: readonly string[]
): T | null {
  return orderVariationsForDefault(variations, ladder)[0] ?? null
}

/**
 * Read a template's active variations (this company's only) and pick the one
 * it opens on. `select` must include `tier`.
 */
export async function findDefaultVariation<T extends { tier?: string | null }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  orgId: string,
  templateId: string,
  select: string
): Promise<T | null> {
  const [{ data }, ladder] = await Promise.all([
    db
      .from('tour_variations')
      .select(select)
      .eq('org_id', orgId)
      .eq('template_id', templateId)
      .eq('is_active', true),
    tierLadderForOrg(db, orgId),
  ])
  return pickDefaultVariation((data ?? []) as unknown as T[], ladder)
}

/** A variation or template that is no longer offered: the page says so
 *  instead of opening (and pricing) it. */
export function isWithdrawn(row: { is_active?: boolean | null } | null | undefined): boolean {
  return !!row && row.is_active === false
}
