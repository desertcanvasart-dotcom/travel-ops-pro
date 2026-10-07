// ============================================
// The cruise picker lists every ship, on every route it sails
// ============================================
// Resource Assignment's cruise picker read only the cruise directory
// (cruise_contacts), and its route filter offered three hard-coded codes
// (luxor_aswan, aswan_luxor, round_trip): a route written any other way —
// "Luxor - Aswan", "LXR-ASW", "Lake Nasser" — could not be filtered on, and a
// ship entered only under Rates → Nile Cruises was not offered at all.
//
// Now the list is both sources, one entry per ship per route: the directory
// entry, and each ship priced in nile_cruises (a row per cabin and season,
// grouped). A directory entry wins when both name the same ship on the same
// route. Routes are read however they are written; the three known ones get
// one key, anything else keeps its own words. Ported from autoura-saas #577.
// Pure.

export interface CruiseContactRow {
  id: string
  name?: string | null
  ship_name?: string | null
  route?: string | null
  routes?: string[] | null
  phone?: string | null
  is_active?: boolean | null
}

export interface NileCruiseRow {
  id: string
  property_id?: string | null
  ship_name?: string | null
  route_name?: string | null
  embark_city?: string | null
  disembark_city?: string | null
  is_active?: boolean | null
}

export interface AssignableCruise {
  id: string
  name: string
  ship_name: string | null
  /** The first route; `routes` holds every one. */
  route: string | null
  routes: string[]
  phone: string | null
  source: 'directory' | 'rates'
}

export const KNOWN_CRUISE_ROUTES: Record<string, string> = {
  luxor_aswan: 'Luxor → Aswan',
  aswan_luxor: 'Aswan → Luxor',
  round_trip: 'Round Trip',
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** "Luxor to Aswan", "LXR-ASW", "luxor_aswan", embark Luxor → disembark Aswan
 *  … → luxor_aswan; a route it does not know keeps its own words. */
export function cruiseRouteKey(r: { route_name?: string | null; embark_city?: string | null; disembark_city?: string | null }): string | null {
  const text = norm(r.route_name)
  if (text in KNOWN_CRUISE_ROUTES) return text
  const from = norm(r.embark_city)
  const to = norm(r.disembark_city)
  if (/round|return/.test(text) || (from && from === to)) return 'round_trip'
  const lux = /luxor|lxr/, asw = /aswan|asw/
  if (from && to) {
    if (lux.test(from) && asw.test(to)) return 'luxor_aswan'
    if (asw.test(from) && lux.test(to)) return 'aswan_luxor'
  }
  const li = text.search(lux), ai = text.search(asw)
  if (li >= 0 && ai >= 0) return li < ai ? 'luxor_aswan' : 'aswan_luxor'
  return r.route_name?.trim() || null
}

/** A route key's label: the known name, else the route as written. */
export function cruiseRouteLabel(route: string | null | undefined): string {
  if (!route) return ''
  return KNOWN_CRUISE_ROUTES[route] ?? route
}

export function assignableCruises(
  directory: readonly CruiseContactRow[],
  rates: readonly NileCruiseRow[],
): AssignableCruise[] {
  const out: AssignableCruise[] = []
  const held = new Set<string>() // ship|route already listed by the directory

  for (const c of directory) {
    if (c.is_active === false) continue
    const name = c.name?.trim()
    if (!name) continue
    const written = [...(c.routes ?? []), c.route].filter((r): r is string => !!r && !!r.trim())
    const routes = [...new Set(written.map(r => cruiseRouteKey({ route_name: r })).filter((r): r is string => !!r))]
    const ship = norm(c.ship_name || name)
    for (const r of routes.length ? routes : ['']) held.add(`${ship}|${r}`)
    out.push({ id: c.id, name, ship_name: c.ship_name?.trim() || null, route: routes[0] ?? null, routes, phone: c.phone ?? null, source: 'directory' })
  }

  const groups = new Map<string, { name: string; route: string | null; rows: NileCruiseRow[] }>()
  for (const r of rates) {
    if (r.is_active === false) continue
    const name = r.ship_name?.trim()
    if (!name) continue
    const route = cruiseRouteKey(r)
    if (held.has(`${norm(name)}|${route ?? ''}`)) continue
    const key = `${r.property_id || norm(name)}|${route ?? ''}`
    const g = groups.get(key) ?? { name, route, rows: [] }
    g.rows.push(r)
    groups.set(key, g)
  }
  // The id is the ship's property when linked, else the group's smallest row
  // id — stable, because double-booking checks compare assignments by it. One
  // ship on two routes shares a property; the second takes its own row id.
  const used = new Set(out.map(c => c.id))
  for (const g of [...groups.values()].sort((a, z) => a.name.localeCompare(z.name) || (a.route ?? '').localeCompare(z.route ?? ''))) {
    const smallest = g.rows.map(r => r.id).sort()[0]
    let id = g.rows.find(r => r.property_id)?.property_id || smallest
    if (used.has(id)) id = smallest
    used.add(id)
    out.push({ id, name: g.name, ship_name: null, route: g.route, routes: g.route ? [g.route] : [], phone: null, source: 'rates' })
  }

  return out.sort((a, z) => a.name.localeCompare(z.name) || (a.route ?? '').localeCompare(z.route ?? ''))
}

/** Every route the listed cruises sail, known ones first. */
export function cruiseRoutesPresent(cruises: readonly { routes?: string[] | null; route?: string | null }[]): string[] {
  const all = new Set<string>()
  for (const c of cruises) for (const r of c.routes?.length ? c.routes : c.route ? [c.route] : []) all.add(r)
  const known = Object.keys(KNOWN_CRUISE_ROUTES).filter(k => all.has(k))
  return [...known, ...[...all].filter(r => !(r in KNOWN_CRUISE_ROUTES)).sort()]
}
