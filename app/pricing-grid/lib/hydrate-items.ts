// ============================================
// A picked item takes its price from its rate — on screen and in the save
// ============================================
// A grid item carries a rate id and a copy of that rate's price. The copy went
// stale or arrived thin in several ways:
//   - an AI-parsed day carried only id, name and two prices (and the parse's
//     own non-EU prices disagreed with the rates list), so no dated periods,
//     no guide bed;
//   - a reloaded itinerary rebuilt items from its saved lines: no periods, no
//     guide rate, no supplement key;
//   - the tier swap replaced a hotel with id, name and two prices;
//   - the save priced whatever the request carried — a stale tab, a draft
//     restored from this browser, an edited body.
// And a picked vehicle kept its size whatever the group became.
//
// One rule, used by the page whenever rates or the group size change and by
// the save on the server's own copy of the rates: every item is rebuilt from
// the rate option with its id. A route takes the vehicle that seats the
// group (vehicleForPax — the vehicle SlotRow's list shows). An item whose
// rate is not in the list (deleted, deactivated, a line with no rate id) has
// NO price: 0, reported, never the price it came with.
//
// Pure: the page, the save route and the tests share it.

import type { AllRates, GridDay, RateOption, SelectedItem } from '../types'
import { isSingleSupplementItem } from '../types'
import { routeKey, vehicleForPax } from './option-filters'

export interface UnpricedItem {
  dayNumber: number
  slotId: string
  rateId: string
  name: string
}

/** An item's fields, as the rate option has them today. */
function fromOption(item: SelectedItem, opt: RateOption): SelectedItem {
  const out: SelectedItem = {
    rateId: opt.id,
    name: opt.name,
    rateEur: opt.rateEur,
    rateNonEur: opt.rateNonEur,
  }
  if (opt.service_type !== undefined) out.serviceType = opt.service_type
  if (opt.pricing_class !== undefined) out.pricingClass = opt.pricing_class
  if (opt.guide_rate !== undefined) out.guideRate = opt.guide_rate
  if (opt.tip_role) out.tipRole = opt.tip_role
  else if (item.tipRole) out.tipRole = item.tipRole
  if (opt.trip_shape) out.tripShape = opt.trip_shape
  if (opt.periods) out.periods = opt.periods
  if (opt.sailingDays) out.sailingDays = opt.sailingDays
  if (opt.pricing_basis) {
    out.pricingBasis = opt.pricing_basis
    out.unitCapacity = opt.unit_capacity ?? null
  }
  return out
}

/** No rate behind it: no price, and nothing dated or derived that could
 *  give it one. The id and name stay, so the operator sees what it was. */
const unpriced = (item: SelectedItem): SelectedItem => ({
  rateId: item.rateId,
  name: item.name,
  rateEur: 0,
  rateNonEur: 0,
  ...(item.supplementKey ? { supplementKey: item.supplementKey } : {}),
  ...(item.tipRole ? { tipRole: item.tipRole } : {}),
})

const SUPP_MARK = '#supp:'

function resolveItem(slotId: string, item: SelectedItem, options: RateOption[], pax: number): SelectedItem | null {
  const rateId = String(item.rateId ?? '')
  const byId = (id: string) => options.find(o => o.id === id)

  // A property's agency supplement: `<propertyId>#supp:<key>`.
  const suppAt = rateId.indexOf(SUPP_MARK)
  if (suppAt !== -1) {
    const key = rateId.slice(suppAt + SUPP_MARK.length)
    const supp = byId(rateId.slice(0, suppAt))?.supplements?.find(s => s.key === key)
    if (!supp) return null
    return {
      rateId,
      name: `${supp.name} (supplement)`,
      rateEur: supp.rateEur,
      rateNonEur: supp.rateNonEur,
      supplementKey: key,
      ...(supp.periods ? { periods: supp.periods } : {}),
    }
  }

  // The hotel's single supplement: `<hotelId>_supp` (SlotRow).
  if (slotId === 'accommodation' && isSingleSupplementItem(item)) {
    const hotel = byId(rateId.replace(/_supp$/, '')) as (RateOption & { single_supp_eur?: number; single_supp_non_eur?: number }) | undefined
    if (!hotel) return null
    return {
      rateId,
      name: 'Single Supplement',
      rateEur: Number(hotel.single_supp_eur) || 0,
      rateNonEur: Number(hotel.single_supp_non_eur) || 0,
      ...(hotel.singleSuppPeriods ? { periods: hotel.singleSuppPeriods } : {}),
    }
  }

  // A vehicle on a route: the route's vehicle that seats the group.
  if (slotId === 'route' && rateId.includes('__')) {
    const key = routeKey({ id: rateId } as RateOption)
    const vehicles = options.filter(o => routeKey(o) === key && o.id.includes('__'))
    if (vehicles.length === 0) return null
    return fromOption(item, vehicleForPax(vehicles, pax))
  }

  const opt = byId(rateId)
  return opt ? fromOption(item, opt) : null
}

const same = (a: SelectedItem, b: SelectedItem) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Every day's picks rebuilt from `rates` at a group of `pax`. Returns the same
 * `days` array when nothing changed (a React state update can skip it), and
 * the items left without a rate.
 */
export function hydrateDays<D extends Pick<GridDay, 'dayNumber' | 'slots'>>(
  days: D[],
  rates: Partial<AllRates>,
  pax: number,
): { days: D[]; unpriced: UnpricedItem[] } {
  const missing: UnpricedItem[] = []
  let changed = false
  const next = days.map((day, idx) => {
    let dayChanged = false
    const slots = (day.slots || []).map(slot => {
      const items = slot.selectedItems || []
      if (items.length === 0) return slot
      const options = ((rates as Record<string, RateOption[] | undefined>)[slot.slotId]) ?? []
      let slotChanged = false
      const rebuilt = items.map(item => {
        const resolved = resolveItem(slot.slotId, item, options, pax)
        // A typed amount wins over the slot's picks (calculator, save), so
        // a pick under it is not a missing price.
        if (!resolved && !(slot.customAmount > 0)) missing.push({ dayNumber: day.dayNumber || idx + 1, slotId: slot.slotId, rateId: String(item.rateId ?? ''), name: String(item.name ?? '') })
        const out = resolved ?? unpriced(item)
        if (same(out, item)) return item
        slotChanged = true
        return out
      })
      if (!slotChanged) return slot
      dayChanged = true
      return { ...slot, selectedItems: rebuilt }
    })
    if (!dayChanged) return day
    changed = true
    return { ...day, slots }
  })
  return { days: changed ? next : days, unpriced: missing }
}
