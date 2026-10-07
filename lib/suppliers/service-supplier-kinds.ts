// ============================================
// Which suppliers a service line can be booked with
// ============================================
// The itinerary editor's supplier list offered every supplier for every line:
// "Recommended" knew types by names this app does not have ('dmc',
// 'cruise_line'), compared the supplier's primary type only and never looked
// at the city, and "All Other Suppliers" listed the rest — airlines and
// restaurants for a hotel night.
//
// Now a line asks /api/suppliers for its KIND of supplier — built-in supplier
// type keys (lib/supplier-types), which the route widens to the agency's own
// types that behave alike, matched against any of a supplier's roles — in its
// CITY: where the day is spent, or where the night is for a hotel or a ship.

/** Service type (itinerary_services.service_type) → supplier type keys. */
const KINDS: Record<string, string[]> = {
  accommodation: ['hotel'],
  hotel: ['hotel'],
  cruise: ['cruise'],
  transportation: ['transport', 'driver'],
  transport: ['transport', 'driver'],
  // Airport meet & assist and transfers: the car, or the people at the airport.
  transfer: ['transport', 'driver', 'airport_assistant'],
  train: ['train_operator'],
  sleeping_train: ['train_operator'],
  guide: ['guide'],
  tour_guide: ['guide'],
  meal: ['restaurant'],
  restaurant: ['restaurant'],
  entrance: ['attraction'],
  entrance_fee: ['attraction'],
  activity: ['activity_provider'],
  flight: ['air_carrier'],
  tip: ['ground_handler', 'other'],
  tips: ['ground_handler', 'other'],
  supplies: ['ground_handler', 'other'],
  service_fee: ['ground_handler', 'other'],
  other: ['ground_handler', 'other'],
}

/** The supplier type keys a service line is booked with; [] = no kind known. */
export function supplierTypesForService(serviceType: string | null | undefined): string[] {
  return KINDS[String(serviceType ?? '').trim().toLowerCase()] ?? []
}

const NIGHT_KINDS = new Set(['accommodation', 'hotel', 'cruise'])
const ON_BOARD = /^on board\b/i

/** The city a service line's supplier should be in: the night's for a hotel
 *  or ship, the day's for everything else. Null when the day names none. */
export function supplierCityForService(
  serviceType: string | null | undefined,
  day: { city?: string | null; overnight_city?: string | null },
): string | null {
  const city = String(day.city ?? '').trim() || null
  const night = String(day.overnight_city ?? '').trim()
  if (NIGHT_KINDS.has(String(serviceType ?? '').trim().toLowerCase()) && night && !ON_BOARD.test(night)) return night
  return city
}

export interface SupplierOption {
  id: string
  name: string
  city: string | null
}

/** The list in two groups: in the city first, then the same kind elsewhere. */
export function groupSuppliersByCity(
  inCity: readonly SupplierOption[],
  ofKind: readonly SupplierOption[],
): { inCity: SupplierOption[]; otherCities: SupplierOption[] } {
  const byName = (a: SupplierOption, b: SupplierOption) => a.name.localeCompare(b.name)
  const here = new Set(inCity.map(s => s.id))
  return {
    inCity: [...inCity].sort(byName),
    otherCities: ofKind
      .filter(s => !here.has(s.id))
      .sort((a, b) => (a.city ?? '￿').localeCompare(b.city ?? '￿') || byName(a, b)),
  }
}
