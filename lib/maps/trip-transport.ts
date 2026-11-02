// How a trip day's own services say the customer travels that day, for the
// route strip (lib/maps/route-strip). Only services that move the customer
// between places count — an airport transfer or a day tour stays in one city.

import type { TransportMode } from './route-strip'

const MODE_BY_SERVICE: Record<string, TransportMode> = {
  flight: 'plane',
  train: 'train',
  sleeping_train: 'train',
  cruise: 'ship',
  cruise_transport_package: 'ship',
  intercity: 'car',
  intercity_with_sightseeing: 'car',
}

export function tripTransport(services: Array<{ service_type?: string | null }> | null | undefined): TransportMode[] {
  const modes = (services ?? []).map(s => MODE_BY_SERVICE[s.service_type ?? '']).filter((m): m is TransportMode => Boolean(m))
  return [...new Set(modes)]
}
