// The fixed costs pricing reads — shared by the engine
// (lib/fixed-costs) and the Fixed Costs page, which must not import the
// engine module (it opens a service-role client at load).

/** The one cost type pricing reads: per person per touring day. */
export const WATER_COST_TYPE = 'Water Bottle'

/** The built-in water rate used when no active Water Bottle row prices. */
export const WATER_DEFAULT_PER_PERSON_PER_DAY = 2

/** Whether a cost type is the Water Bottle pricing reads — case and spacing
 *  ignored, so "water bottle" is the same cost. */
export function isWaterCostType(costType: string | null | undefined): boolean {
  return String(costType ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === WATER_COST_TYPE.toLowerCase()
}

/** Tips live in tipping_rates (Rates › Tipping). The Fixed Costs page refuses
 *  the name, and the engine skips a stray row so a tip is never charged twice. */
export const TIPS_COST_TYPE = 'Daily Tips'

export function isTipsCostType(costType: string | null | undefined): boolean {
  return String(costType ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === TIPS_COST_TYPE.toLowerCase()
}
