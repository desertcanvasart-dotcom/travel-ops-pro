// ============================================
// A customer trip's hotels and ship, night by night, for the 日程表
// ============================================
// Reads the itinerary's own night lines (lib/itineraries/overnight-property)
// and the property record each names, for what to print: the Japanese name,
// phone and address (supplier_properties.name_ja / contact_phone / address).
//
// Which record: the one a rate row with that name links to (property_id) —
// two properties can share a name ("Steigenberger Nile Palace" exists in
// Cairo and Luxor) — else the only property of that kind with that name, else
// none (the English name prints, no phone or address). Never a guess.

import type { SupabaseClient } from '@supabase/supabase-js'
import { overnightProperty, propertyKey } from '@/lib/itineraries/overnight-property'
import type { TripStay } from './assemble-program-itinerary'

type PropertyRow = { id: string; name: string; property_type: string; name_ja: string | null; contact_phone: string | null; address: string | null }

export async function loadTripStays(supabase: SupabaseClient, itineraryId: string, orgId: string): Promise<TripStay[]> {
  const { data: trip } = await supabase.from('itineraries').select('id').eq('id', itineraryId).eq('org_id', orgId).maybeSingle()
  if (!trip) return []

  const { data: days, error } = await supabase
    .from('itinerary_days')
    .select('day_number, services:itinerary_services(service_type, service_code, service_name, supplier_name)')
    .eq('itinerary_id', itineraryId)
  if (error || !days) return []

  const nights = days
    .map(d => ({ day: Number(d.day_number), property: overnightProperty((d as { services?: Array<Record<string, string | null>> }).services ?? []) }))
    .filter((n): n is { day: number; property: NonNullable<typeof n.property> } => Boolean(n.property))
  if (nights.length === 0) return []

  const [{ data: hotels }, { data: ships }, { data: properties }] = await Promise.all([
    supabase.from('accommodation_rates').select('property_name, property_id'),
    supabase.from('nile_cruises').select('ship_name, property_id'),
    supabase.from('supplier_properties').select('id, name, property_type, name_ja, contact_phone, address').in('property_type', ['hotel', 'ship']),
  ])
  const byId = new Map((properties as PropertyRow[] | null ?? []).map(p => [p.id, p]))
  const linked = new Map<string, string>()
  for (const r of hotels ?? []) if (r.property_id) linked.set(`hotel|${propertyKey(r.property_name)}`, r.property_id)
  for (const r of ships ?? []) if (r.property_id) linked.set(`cruise|${propertyKey(r.ship_name)}`, r.property_id)

  const recordFor = (kind: 'hotel' | 'cruise', name: string): PropertyRow | null => {
    const viaRate = linked.get(`${kind}|${propertyKey(name)}`)
    if (viaRate && byId.has(viaRate)) return byId.get(viaRate)!
    const type = kind === 'hotel' ? 'hotel' : 'ship'
    const same = (properties as PropertyRow[] | null ?? []).filter(p => p.property_type === type && propertyKey(p.name) === propertyKey(name))
    return same.length === 1 ? same[0] : null
  }

  return nights
    .sort((a, b) => a.day - b.day)
    .map(({ day, property }) => {
      const record = recordFor(property.kind, property.name)
      return {
        day,
        kind: property.kind,
        name: property.name,
        name_ja: record?.name_ja?.trim() || null,
        phone: record?.contact_phone?.trim() || null,
        address: record?.address?.trim() || null,
      }
    })
}
