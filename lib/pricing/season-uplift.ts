// ============================================
// The operator's demand premium
// ============================================
// Supplier seasonality already lives on the rate rows: a hotel or a cruise ship
// costs more in its own high season, and the engine picks that up from the
// travel date. This is the other kind — the operator's own judgement that
// Golden Week sells out, so it is worth more.
//
// It therefore sits AFTER margin, on the selling price, and never touches
// supplier cost. Cost is what somebody charged; this is what the operator has
// decided to ask.
//
// Pure. The windows come from pricing_season_dates, the arithmetic is here, and
// neither needs a database to be checked.

/** One dated window, joined to the season that owns it. */
export interface SeasonWindow {
  seasonId: string
  name: string
  upliftPercent: number
  /** Inclusive, both ends. YYYY-MM-DD. */
  startDate: string
  endDate: string
}

export interface SeasonMatch {
  seasonId: string
  name: string
  upliftPercent: number
}

const day = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

/**
 * The season a departure falls in, or null for an ordinary date.
 *
 * WHICH DATE: the departure. A trip that runs into Golden Week without leaving
 * in it is priced as an ordinary departure, because the departure date is what
 * the operator publishes, chooses and sells.
 *
 * OVERLAP: the highest premium wins. Windows will overlap — New Year and a
 * broad "winter peak" can cover the same days — and the alternative rules are
 * worse: first-created is invisible to the person reading the calendar, and
 * summing them turns two 15% seasons into 32.25%.
 */
export function seasonForDate(
  windows: SeasonWindow[],
  departureDate: string | null | undefined
): SeasonMatch | null {
  const at = day(departureDate)
  if (at == null) return null

  let best: SeasonMatch | null = null
  for (const w of windows) {
    const from = day(w.startDate)
    const to = day(w.endDate)
    if (from == null || to == null) continue
    if (at < from || at > to) continue
    if (!best || w.upliftPercent > best.upliftPercent) {
      best = { seasonId: w.seasonId, name: w.name, upliftPercent: w.upliftPercent }
    }
  }
  return best
}

/**
 * Service types the premium never applies to.
 *
 * The operator's rule: a fixed base somebody else sets is passed through, not
 * marked up. Airport tax, visa fees and the insurance premium are already
 * outside this — they are invoice lines, not priced services — so what is left
 * to name here are the two the engine DOES price and that are equally fixed.
 * Nobody tips 15% more because it is Obon, and the Supreme Council of
 * Antiquities does not raise its entrance fee because a tour sold out.
 */
export const PASS_THROUGH_SERVICE_TYPES = new Set(['tips', 'entrance'])

/**
 * What the pass-throughs inside a selling price come to, at that price's margin.
 *
 * A priced service row carries a PER-PERSON amount when it scales with the group
 * (an entrance fee is one ticket) and a whole-group amount when it does not (the
 * day's tips are one envelope). Multiplying the first kind by the headcount is
 * the whole job, and getting it wrong is expensive in one direction only: a
 * premium charged on tickets the operator merely passes on.
 *
 * `personEquivalents` is a count, not a headcount: a child at half price carries
 * half a person's entrance fees into the price. `groupShare` is the fraction of
 * the group-fixed pass-throughs the price actually contains — one whole share
 * unless a discount has amortised them differently.
 */
export function passThroughSelling(input: {
  services: Array<{ serviceType: string; lineTotal: number | null | undefined; isPerPax: boolean }>
  personEquivalents: number
  groupShare?: number
  marginPercent: number
}): number {
  const heads = Math.max(0, input.personEquivalents)
  const groupShare = input.groupShare ?? 1
  let cost = 0
  for (const service of input.services) {
    if (!PASS_THROUGH_SERVICE_TYPES.has(service.serviceType)) continue
    const lineTotal = Number(service.lineTotal) || 0
    cost += service.isPerPax ? lineTotal * heads : lineTotal * groupShare
  }
  return cost * (1 + (input.marginPercent || 0) / 100)
}

export interface UpliftBreakdown {
  /** The premium in currency, already rounded by the caller's rules. */
  amount: number
  /** What the premium was charged on — selling price less pass-throughs. */
  base: number
  percent: number
  seasonName: string | null
}

/**
 * Split a selling price into the part a premium applies to and the part that is
 * passed straight through, then compute the premium.
 *
 * `passThroughTotal` is the client-price share of the services named above. It
 * is subtracted rather than the premium being applied service by service,
 * because the operator sets one percentage against one price and should be able
 * to check the arithmetic on paper.
 */
export function computeUplift(input: {
  sellingPrice: number
  passThroughTotal?: number
  season: SeasonMatch | null
}): UpliftBreakdown {
  const percent = input.season?.upliftPercent ?? 0
  const passThrough = Math.max(0, input.passThroughTotal ?? 0)
  const base = Math.max(0, input.sellingPrice - passThrough)

  return {
    amount: percent > 0 ? (base * percent) / 100 : 0,
    base,
    percent,
    seasonName: input.season?.name ?? null,
  }
}
