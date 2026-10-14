// ============================================
// A booking's supplier rows, from its itinerary's services
// ============================================
// booking_supplier_status holds one row per supplier per service date, each
// chased pending → requested → confirmed (or cancelled = not needed). Booking
// creation copied every service LINE raw — seven "Bottled Water" and the
// driver tips each became a "supplier" to confirm, with the line's
// service_type as the supplier type — while "Sync from itinerary" mapped
// types its own way. Both now build the list here:
//   * lines nobody confirms (tips, water, supplies, fees) are left out;
//   * service types map to one set of supplier types;
//   * the same supplier on the same day is ONE row (by supplier_id when the
//     line is linked, else by name), its costs summed;
//   * the cost is in the supplier's OWN currency (EGP for a guide, USD for a
//     cruise…) when every line of the row is in that one currency and its
//     original still agrees with total_cost (lib/supplier-own-currency, the
//     voucher's rule) — that is what the supplier confirms and is paid.
//     Otherwise it is the lines' total_cost, in the trip's currency.
//     cost_currency says which; null = the booking's currency.
// (Matches autoura-saas lib/bookings/booking-suppliers.ts.)

import { supplierOwnMoney, type OwnCurrencyLine } from '@/lib/supplier-own-currency'

/** Service type → booking supplier type; null = nobody to confirm, left off. */
export function supplierTypeForService(serviceType: string | null | undefined): string | null {
  const t = (serviceType ?? '').toLowerCase()
  const map: Record<string, string | null> = {
    hotel: 'hotel', accommodation: 'hotel',
    guide: 'guide', tour_guide: 'guide',
    transport: 'transport', transportation: 'transport', transfer: 'transport', vehicle: 'transport',
    airport_transfer: 'transport', cruise_transport_package: 'transport',
    train: 'transport', sleeping_train: 'transport',
    restaurant: 'restaurant', meal: 'restaurant', lunch: 'restaurant', dinner: 'restaurant', breakfast: 'restaurant',
    activity: 'activity', excursion: 'activity', tour: 'activity',
    entrance: 'entrance', entrance_fee: 'entrance', ticket: 'entrance',
    cruise: 'cruise', nile_cruise: 'cruise',
    flight: 'flight', domestic_flight: 'flight',
    airport_service: 'airport_service', meet_greet: 'airport_service', porter: 'airport_service',
    hotel_service: 'hotel_service',
    tips: null, tip: null, water: null, supplies: null, service_fee: null, extra_expenses: null,
  }
  return t in map ? map[t] : 'other'
}

export function serviceDate(dayNumber: number | null | undefined, dayDate: string | null | undefined, tripStart: string | null | undefined): string | null {
  if (dayDate) return dayDate.slice(0, 10)
  if (!tripStart || !dayNumber) return null
  const d = new Date(`${tripStart.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1))
  return d.toISOString().slice(0, 10)
}

/** Id-or-name key: a linked supplier groups on its id, an unlinked line on its name. */
export function supplierKey(l: { supplier_id?: string | null; supplier_name?: string | null; supplier_type?: string | null; service_date?: string | null }): string {
  const date = l.service_date ?? 'no-date'
  return l.supplier_id
    ? `id:${l.supplier_id}|${l.supplier_type ?? ''}|${date}`
    : `name:${(l.supplier_name ?? '').trim().toLowerCase()}|${l.supplier_type ?? ''}|${date}`
}

export interface ServiceForSupplier extends OwnCurrencyLine {
  supplier_id?: string | null
  supplier_name?: string | null
  service_name?: string | null
  service_type?: string | null
  notes?: string | null
  total_cost?: number | string | null
  rate_eur?: number | string | null
  day_number?: number | null
  day_date?: string | null
}

export interface SupplierLine {
  supplier_id: string | null
  supplier_type: string
  supplier_name: string
  service_description: string | null
  service_date: string | null
  quoted_cost: number | null
  /** Currency of quoted_cost; null = the booking's currency. */
  cost_currency: string | null
}

/** The currency a row's quoted and confirmed cost are in: its own, else the booking's. */
export function supplierCostCurrency(
  row: { cost_currency?: string | null },
  bookingCurrency: string | null | undefined,
): string {
  return String(row.cost_currency || bookingCurrency || 'EUR').trim().toUpperCase()
}

/**
 * The booking's supplier rows implied by its itinerary's services.
 * `tripCurrency` is the currency the services' total_cost is in (the
 * itinerary's); without it, a row not in its supplier's own currency gets
 * cost_currency null (= the booking's).
 */
export function supplierLinesFromServices(
  services: ServiceForSupplier[],
  tripStart: string | null | undefined,
  tripCurrency?: string | null,
): SupplierLine[] {
  const trip = String(tripCurrency ?? '').trim().toUpperCase()
  const byKey = new Map<string, { line: SupplierLine; group: ServiceForSupplier[] }>()
  for (const s of services) {
    const type = supplierTypeForService(s.service_type)
    if (!type) continue
    const line: SupplierLine = {
      supplier_id: s.supplier_id || null,
      supplier_type: type,
      supplier_name: String(s.supplier_name || s.service_name || 'Unknown').trim(),
      service_description: s.notes || null,
      service_date: serviceDate(s.day_number, s.day_date, tripStart),
      quoted_cost: null,
      cost_currency: null,
    }
    const key = supplierKey(line)
    const seen = byKey.get(key)
    if (seen) seen.group.push(s)
    else byKey.set(key, { line, group: [s] })
  }
  const lines = [...byKey.values()].map(({ line, group }): SupplierLine => {
    // Only with a known trip currency: "foreign" means foreign to it.
    const money = trip ? supplierOwnMoney(group, trip) : null
    if (money?.own) return { ...line, quoted_cost: money.total || null, cost_currency: money.currency }
    // The trip's currency: total_cost (rate_eur on lines saved before it).
    const sum = group.reduce((acc, s) => {
      const n = Number(s.total_cost ?? s.rate_eur)
      return Number.isFinite(n) ? acc + n : acc
    }, 0)
    return { ...line, quoted_cost: Math.round(sum * 100) / 100 || null, cost_currency: trip || null }
  })
  return lines.sort((a, b) => (a.service_date ?? '').localeCompare(b.service_date ?? ''))
}
