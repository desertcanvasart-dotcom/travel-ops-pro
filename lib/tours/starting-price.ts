// ============================================
// A tour's "Starting from" price
// ============================================
// The Tours page card read a cached price that nothing ever wrote — every
// card said N/A (operator, 2026-09-17). Decisions:
//
//   - The basis: price PER PERSON for 2 travellers with non-EU (Japanese)
//     passports — who the office sells to — at the org's default margin, with
//     no travel date (so no seasonal premium).
//   - The tier: the cheapest tier whose price is COMPLETE. When no tier is
//     complete, the price is still shown, MARKED incomplete with how many
//     services lack a rate — never presented as a real price — from the tier
//     MISSING THE FEWEST services (cheapest among those). The plain cheapest
//     would reward missing rates: on NMS803 Luxury read $1,021 with 9 services
//     unpriced against Standard's $2,072 with 4 (prod, 2026-09-17).
//   - Refreshed when a programme's days are saved, nightly, and from the
//     Tours page's Refresh prices button.
//
// Each tier is priced by the same engine as Calculate Price
// (calculateAutoPricing), so the card and the calculator agree for the same
// basis.

import { calculateAutoPricing } from '@/lib/auto-pricing-service'
import { tierLadderForOrg } from '@/lib/vocabulary-server'
import { getOrgDefaultMargin } from '@/lib/org-default-margin'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'

// Structural: the route clients and the service-role client all fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export const STARTING_PRICE_BASIS = { numPax: 2, isEurPassport: false } as const

export interface TierPrice {
  tier: string
  pricePerPerson: number
  complete: boolean
  gaps: number
}

export interface StartingPrice {
  price: number
  tier: string
  complete: boolean
  gaps: number
}

/** The cheapest complete tier; else the priced tier missing the fewest
 *  services (cheapest on a tie), marked incomplete. null when no tier priced. */
export function pickStartingPrice(tiers: readonly TierPrice[]): StartingPrice | null {
  const priced = tiers.filter(t => t.pricePerPerson > 0)
  const better = (a: TierPrice, b: TierPrice) =>
    a.complete ? a.pricePerPerson < b.pricePerPerson : a.gaps < b.gaps || (a.gaps === b.gaps && a.pricePerPerson < b.pricePerPerson)
  const best = (list: TierPrice[]) => list.reduce<TierPrice | null>((cur, t) => (!cur || better(t, cur) ? t : cur), null)
  const pick = best(priced.filter(t => t.complete)) ?? best(priced)
  return pick
    ? { price: Math.round(pick.pricePerPerson), tier: pick.tier, complete: pick.complete, gaps: pick.complete ? 0 : pick.gaps }
    : null
}

/** The install's organisation, for a caller with no session (the nightly job).
 *  An install carries one organisation (lib/org-identity). */
export async function installOrgId(db: Db): Promise<string | null> {
  const { data } = await db.from('organizations').select('id').order('created_at', { ascending: true }).limit(1)
  return (data?.[0]?.id as string | undefined) ?? null
}

/**
 * Recompute and store the starting price for the given templates (all active
 * ones when omitted). Returns what was stored per template.
 */
export async function refreshStartingPrices(
  db: Db,
  orgId: string | null,
  templateIds?: readonly string[]
): Promise<Array<{ id: string; name: string; result: StartingPrice | null; error?: string }>> {
  let query = db.from('tour_templates').select('id, template_name').eq('is_active', true)
  if (templateIds?.length) query = query.in('id', [...templateIds])
  const { data: templates, error } = await query
  if (error) throw new Error(error.message)

  const tiers = orgId ? await tierLadderForOrg(db as never, orgId) : ['standard']
  const margin = (await getOrgDefaultMargin(db as never, orgId)) ?? 25
  const rateCurrency = await getOrgRateCurrency(db as never, orgId)

  const out: Array<{ id: string; name: string; result: StartingPrice | null; error?: string }> = []
  for (const template of (templates ?? []) as Array<{ id: string; template_name: string }>) {
    try {
      const perTier: TierPrice[] = []
      for (const tier of tiers) {
        const r = await calculateAutoPricing({
          templateId: template.id,
          tier,
          numPax: STARTING_PRICE_BASIS.numPax,
          isEurPassport: STARTING_PRICE_BASIS.isEurPassport,
          marginPercent: margin,
          rateCurrency,
        })
        if (r.success) {
          // Services without a rate, counted as LINES — as the calculator's
          // banner counts them: one missing guide rate leaves several days
          // unpriced but is one hole (Greptile on #461).
          const unpricedLines = (r.services ?? []).filter(s => s.unpriced).length
          perTier.push({ tier, pricePerPerson: r.pricePerPerson, complete: r.complete, gaps: unpricedLines || (r.holes?.length ?? 0) })
        }
      }
      const result = pickStartingPrice(perTier)
      const { error: updateError } = await db
        .from('tour_templates')
        .update({
          cached_starting_price: result?.price ?? null,
          cached_starting_tier: result?.tier ?? null,
          cached_price_complete: result ? result.complete : null,
          cached_price_gaps: result ? result.gaps : null,
          cached_price_updated_at: new Date().toISOString(),
        })
        .eq('id', template.id)
      out.push(updateError
        ? { id: template.id, name: template.template_name, result, error: updateError.message }
        : { id: template.id, name: template.template_name, result })
    } catch (e) {
      out.push({ id: template.id, name: template.template_name, result: null, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
