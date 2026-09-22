// ============================================
// Departures grid — AIR / 燃油 / LND / 合計 buckets
// ============================================
// The office prices a departure sheet by hand: for each departure date band it
// records AIR (round-trip air, per person), 燃油 (a fuel surcharge computed
// outside the system, one number), and LND (everything else on the ground),
// and adds them to a 合計 gross web rate. See handover/feature-specs/6.
//
// This module owns the ONE split rule the grid and any export share, kept pure
// so it can be unit-tested without the engine or the database — the same
// discipline as breakdown-order.ts.
//
// The split rule (confirmed against the engine's output):
//   AIR  = priced lines the engine emits as serviceType 'flight' — the air
//          tickets, domestic and international alike. A guide who flies with
//          the party is a 'guide' line, not 'flight', so it correctly stays in
//          LND. (Operator: domestic air belongs in AIR, not LND.)
//   LND  = every other priced line.
//   燃油  = never comes from the engine; it is the manual per-person number.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO — the seam the API owns:
//   It does not reconstruct per-person, post-margin money from the engine's
//   lines. A line's lineTotal is the GROUP cost, and isPerPax:false lines
//   (guide, vehicle) do not scale with pax; margin is applied to the trip
//   total, not per line. Splitting the engine's already-correct per-person
//   gross into an AIR share and an LND share is an allocation decision made
//   where the full PaxPricingResult is in hand (the API route). This module
//   takes amounts that are ALREADY per person and in the target currency and
//   only classifies, sums, adds fuel, and totals. Feed it group costs and you
//   get a group-cost bucketing back — never mix the two.

/** The minimal shape of an engine line this module needs to classify it.
 *  PricedService (auto-pricing-service.ts) is assignable to it. */
export interface BucketableLine {
  serviceType: string
  /** Any per-line amount ALREADY reduced to the basis you want out (per person
   *  and in the target currency for a sellable band; or raw group cost if you
   *  are only inspecting composition — but never blend the two in one call). */
  amount: number
}

export type Bucket = 'air' | 'land'

/** The one classification rule. Air tickets only; everything else is land. */
export function bucketOf(line: Pick<BucketableLine, 'serviceType'>): Bucket {
  return (line.serviceType ?? '').toLowerCase() === 'flight' ? 'air' : 'land'
}

export function isAirLine(line: Pick<BucketableLine, 'serviceType'>): boolean {
  return bucketOf(line) === 'air'
}

/** Sum the supplied `amount` of each line into its bucket. Amounts are taken
 *  as-is: this module does not convert currency or apply margin — the caller
 *  passes amounts already on the basis it wants summed. */
export function sumBuckets(lines: readonly BucketableLine[]): { air: number; land: number } {
  let air = 0
  let land = 0
  for (const line of lines) {
    const amt = Number(line.amount) || 0
    if (bucketOf(line) === 'air') air += amt
    else land += amt
  }
  return { air, land }
}

/** One row of the grid, per person, in the target currency. */
export interface DepartureBand {
  /** Round-trip air, per person. */
  airPp: number
  /** Fuel surcharge, per person. Null = not yet entered by the operator. */
  fuelPp: number | null
  /** Land total, per person. */
  landPp: number
  /** Gross = AIR + 燃油 + LND, per person. */
  totalPp: number
  /** True when the engine reported unpriced holes for this date, so totalPp is
   *  not a complete price and must be shown as incomplete, not flat. */
  incomplete: boolean
}

/** Assemble a band from already-per-person, already-converted parts. `fuelPp`
 *  null (operator has not entered it) is carried through as null and treated as
 *  0 for the total, so the row still sums without pretending fuel is priced. */
export function assembleBand(parts: {
  airPp: number
  fuelPp: number | null
  landPp: number
  incomplete?: boolean
}): DepartureBand {
  const airPp = Number(parts.airPp) || 0
  const landPp = Number(parts.landPp) || 0
  const fuelPp = parts.fuelPp == null ? null : Number(parts.fuelPp) || 0
  return {
    airPp,
    fuelPp,
    landPp,
    totalPp: airPp + (fuelPp ?? 0) + landPp,
    incomplete: Boolean(parts.incomplete),
  }
}

/** Convert an amount at a fixed FX rate expressed as target units per source
 *  unit (e.g. 160 JPY per 1 USD), rounding to whole target units — the office
 *  quotes whole yen. FX is a parameter, never hard-coded here. */
export function convertAtRate(amount: number, targetPerSource: number): number {
  return Math.round((Number(amount) || 0) * (Number(targetPerSource) || 0))
}
