// ============================================
// An airport route saved under another type
// ============================================
// A rate whose route is an airport but whose type is not an airport transfer
// ("Cairo Airport · Full Day") is almost always a rate saved under the wrong
// type — said after a parse, not silently priced. A layover tour (airport →
// tour → airport) is the exception: a day-tour type is right for it.

import type { GridDay, RateOption } from '../types'
import { isLayoverRoute } from '@/lib/rates/layover-route'

const AIRPORT = /\bairport\b|\b(cai|hbe|lxr|asw|hrg|ssh|rmf|spx)\b/i

type RouteOption = RateOption & { origin_city?: string | null; destination_city?: string | null }

export function transportTypeWarnings(days: GridDay[], routeOptions: RateOption[]): string[] {
  const byId = new Map(routeOptions.map(o => [o.id, o as RouteOption]))
  const out: string[] = []
  for (const day of days) {
    const route = day.slots.find(s => s.slotId === 'route')
    for (const item of route?.selectedItems ?? []) {
      const o = byId.get(item.rateId)
      if (!o?.service_type || o.service_type === 'airport_transfer' || o.service_type === 'cruise_transport_package') continue
      // The route's own name: without the "Van (3-7 pax) — " vehicle and the
      // " · Day Tour" type the option name adds (the type would read as a tour).
      const name = o.name.replace(/^.*?—\s*/, '').split(' · ')[0]
      if (isLayoverRoute({ route_name: name, origin_city: o.origin_city, destination_city: o.destination_city })) continue
      const where = [o.origin_city, o.destination_city].filter(Boolean).join(' ')
      if (AIRPORT.test(where)) {
        out.push(`Day ${day.dayNumber}: "${name}" is an airport route saved as "${String(o.service_type).replace(/_/g, ' ')}", not an airport transfer — check its type in Rates → Transportation.`)
      }
    }
  }
  return out
}
