// ============================================
// A rate option as the grid's selected items
// ============================================
// The same items a pick in the row makes (SlotRow): the option, plus a
// hotel's single supplement as a second item. For code that picks without
// the dropdown — the tier swap and the itinerary-format reader.

import type { RateOption, SelectedItem } from '../types'

export function optionItems(slotId: string, opt: RateOption): SelectedItem[] {
  const item: SelectedItem = {
    rateId: opt.id,
    name: opt.name,
    rateEur: opt.rateEur,
    rateNonEur: opt.rateNonEur,
    serviceType: opt.service_type,
    pricingClass: opt.pricing_class,
    guideRate: opt.guide_rate,
    ...(opt.tip_role ? { tipRole: opt.tip_role } : {}),
    ...(opt.trip_shape ? { tripShape: opt.trip_shape } : {}),
    periods: opt.periods,
    sailingDays: opt.sailingDays,
  }
  const items: SelectedItem[] = [item]
  const supp = (opt as RateOption & { single_supp_eur?: number; single_supp_non_eur?: number })
  if (slotId === 'accommodation' && supp.single_supp_eur) {
    items.push({
      rateId: `${opt.id}_supp`,
      name: 'Single Supplement',
      rateEur: supp.single_supp_eur || 0,
      rateNonEur: supp.single_supp_non_eur || 0,
      periods: opt.singleSuppPeriods,
    })
  }
  return items
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** "Mena House Giza (luxury | BB)" → "mena house giza"; the parser's "Mena House (Giza)" → "mena house giza" too. */
function hotelKeys(name: unknown): string[] {
  const n = norm(name)
  const m = n.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  if (!m) return [n]
  const inside = m[2]
  return inside.includes('|') ? [m[1]] : [m[1], `${m[1]} ${inside}`.trim()]
}

/**
 * The new tier's stand-in for a picked hotel: the SAME hotel if the new tier
 * has it; else one in the picked hotel's own city; else one in the day's
 * city. It used to be the first hotel of the day's city — so moving Marriott
 * Mena House (Giza) to Luxury on a day called "Cairo" swapped in whichever
 * Cairo hotel came first, or nothing.
 */
export function hotelForTier(picked: { name?: string } | undefined, dayCity: string | undefined, options: RateOption[]): RateOption | undefined {
  const keys = hotelKeys(picked?.name).filter(Boolean)
  if (keys.length === 0) return undefined
  const same = options.find(o => keys.includes(hotelKeys(o.name)[0]))
  if (same) return same
  const ownCity = options.map(o => norm(o.city)).find(c => c && keys.some(k => k.endsWith(` ${c}`)))
  if (ownCity) {
    const inOwn = options.find(o => norm(o.city) === ownCity)
    if (inOwn) return inOwn
  }
  const day = norm(dayCity)
  return day ? options.find(o => norm(o.city) === day) : undefined
}
