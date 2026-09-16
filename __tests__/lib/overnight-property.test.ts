import { describe, it, expect } from 'vitest'
import { overnightLabel, overnightProperty, propertyFromService } from '@/lib/itineraries/overnight-property'
import { serviceLineForItinerary } from '@/lib/itineraries/template-days'
import { toClientItinerary } from '@/lib/itinerary-share'

// The itinerary, its PDF and the share page named only the overnight CITY;
// the hotel or ship is on the day's accommodation line (operator, 2026-09-17).

describe('reading the property off a day\'s services', () => {
  it('a calculator quote line: "Hotel - <name> (<city>)" and "Nile Cruise - <ship> (night k of n)"', () => {
    expect(propertyFromService({ service_type: 'accommodation', service_code: 'day7-hotel', service_name: 'Hotel - Steigenberger Nile Palace (Cairo)' }))
      .toEqual({ name: 'Steigenberger Nile Palace', kind: 'hotel' })
    expect(propertyFromService({ service_type: 'cruise', service_code: 'day2-cruise', service_name: 'Nile Cruise - Al Farida Nile Cruise (night 1 of 4)' }))
      .toEqual({ name: 'Al Farida Nile Cruise', kind: 'cruise' })
    // Live prod shape (2026-09-02): a double space before the city.
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Hotel - Kempinski Nile Hotel  (Cairo)' })?.name).toBe('Kempinski Nile Hotel')
  })

  it('supplier_name wins when present — the AI generator and new conversions set it', () => {
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Mena House (2 persons)', supplier_name: 'Marriott Mena House' }))
      .toEqual({ name: 'Marriott Mena House', kind: 'hotel' })
    expect(propertyFromService({ service_type: 'cruise', service_name: 'MS Sonesta - Full Board (Standard cabin)' })?.name).toBe('MS Sonesta')
    expect(propertyFromService({ service_type: 'accommodation', service_name: 'Old Cataract (2 persons)' })?.name).toBe('Old Cataract')
  })

  it('claims nothing for an unpriced placeholder, a supplement, a guide bed, or another service', () => {
    expect(propertyFromService({ service_type: 'accommodation', service_code: 'day3-hotel', service_name: 'Hotel (Cairo)' })).toBeNull()
    expect(propertyFromService({ service_type: 'cruise', service_name: 'Nile Cruise (night 1 of 4)' })).toBeNull()
    expect(propertyFromService({ service_type: 'accommodation', service_code: 'day3-hotel-supp-nile_view', service_name: 'Hotel supplement - Nile view (Sofitel)', supplier_name: 'Sofitel' })).toBeNull()
    expect(propertyFromService({ service_type: 'accommodation', service_code: 'day3-guide-bed', service_name: 'Throughout Guide — bed (Sofitel)' })).toBeNull()
    expect(propertyFromService({ service_type: 'transportation', service_name: 'Hotel - Transfer (Cairo)', supplier_name: 'Arkan' })).toBeNull()
  })

  it('takes the night line among the day\'s services, and labels hotels with their city', () => {
    const services = [
      { service_type: 'accommodation', service_code: 'day3-hotel-supp-nile_view', service_name: 'Hotel supplement - Nile view (Sofitel Winter Palace)' },
      { service_type: 'guide', service_name: 'Japanese Speaking Guide' },
      { service_type: 'accommodation', service_code: 'day3-hotel', service_name: 'Hotel - Sofitel Winter Palace (Luxor)' },
    ]
    const p = overnightProperty(services)
    expect(p).toEqual({ name: 'Sofitel Winter Palace', kind: 'hotel' })
    expect(overnightLabel(p, 'Luxor')).toBe('Sofitel Winter Palace, Luxor')
    expect(overnightLabel({ name: 'Steigenberger Cairo Pyramids', kind: 'hotel' }, 'Cairo')).toBe('Steigenberger Cairo Pyramids')
    expect(overnightLabel({ name: 'Al Farida Nile Cruise', kind: 'cruise' }, 'Aswan')).toBe('Al Farida Nile Cruise')
    expect(overnightLabel(null, 'Cairo')).toBe('Cairo')
  })
})

describe('a translated itinerary still names the property (Greptile on #455)', () => {
  it('the days API resolves property_name from the canonical line; the translated name alone would not parse', () => {
    const translated = { service_type: 'accommodation', service_code: 'day7-hotel', service_name: 'ホテル - ステイゲンバーガー・ナイル・パレス(カイロ)' }
    expect(propertyFromService(translated)).toBeNull()
    expect(propertyFromService({ ...translated, property_name: 'Steigenberger Nile Palace' })).toEqual({ name: 'Steigenberger Nile Palace', kind: 'hotel' })
  })

  it('the days route computes it before merging the translation', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('app/api/itineraries/[id]/days/route.ts', 'utf8')
    const resolve = src.indexOf('property_name: propertyFromService(service)')
    expect(resolve).toBeGreaterThan(-1)
    expect(resolve).toBeLessThan(src.indexOf('service_name: version?.service_name || service.service_name'))
  })
})

describe('the name travels from the quote to the itinerary', () => {
  it('a quote line\'s property_name becomes the service row\'s supplier_name', () => {
    const row = serviceLineForItinerary(
      { service_id: 'day7-hotel', service_name: 'Hotel - Steigenberger Nile Palace (Cairo)', service_category: 'accommodation', quantity: 1, quantity_mode: 'per_pax', unit_cost: 120, line_total: 120, property_name: 'Steigenberger Nile Palace' },
      { dayId: 'd7', pax: 2, marginPercent: 25, currency: 'USD' },
    )
    expect(row.supplier_name).toBe('Steigenberger Nile Palace')
    expect(serviceLineForItinerary({ service_name: 'Guide', service_category: 'guide' }, { dayId: 'd', pax: 2, marginPercent: 0, currency: 'USD' }).supplier_name).toBeNull()
  })
})

describe('the share page gets the NAME only', () => {
  it('copies the property name, never the line\'s price, notes or supplier id', () => {
    const client = toClientItinerary({ trip_name: 'Egypt' }, [{
      day_number: 1, city: 'Cairo', overnight_city: 'Cairo',
      services: [{ service_type: 'accommodation', service_code: 'day1-hotel', service_name: 'Hotel - Steigenberger Nile Palace (Cairo)', supplier_name: null, total_cost: 240, rate_eur: 120, notes: 'internal', supplier_id: 'sup-1' }],
    }])
    expect(client.days[0].overnightProperty).toEqual({ name: 'Steigenberger Nile Palace', kind: 'hotel' })
    const json = JSON.stringify(client)
    for (const leak of ['240', 'internal', 'sup-1', 'services']) expect(json).not.toContain(leak)
  })

  it('a day with no named property has none', () => {
    expect(toClientItinerary({}, [{ day_number: 1, city: 'Cairo' }]).days[0].overnightProperty).toBeNull()
  })
})

describe('is the named property still in the rates (staff warning)', () => {
  // Late import keeps the earlier blocks independent of this helper.
  it('matches names ignoring case, spacing and edges — the Kempinski row had a trailing space', async () => {
    const { propertyRateStatus, propertyKey } = await import('@/lib/itineraries/overnight-property')
    expect(propertyKey('  Kempinski  Nile Hotel ')).toBe('kempinski nile hotel')
    const catalog = {
      hotels: [{ name: 'Steigenberger Nile Palace', active: true }, { name: 'Old Hotel', active: false }],
      ships: [{ name: 'Al Farida Nile Cruise', active: true }],
    }
    expect(propertyRateStatus({ name: 'steigenberger nile palace', kind: 'hotel' }, catalog)).toBe('on_file')
    expect(propertyRateStatus({ name: 'Kempinski Nile Hotel', kind: 'hotel' }, catalog)).toBe('not_on_file')
    expect(propertyRateStatus({ name: 'Old Hotel', kind: 'hotel' }, catalog)).toBe('switched_off')
    // A hotel name is not a ship.
    expect(propertyRateStatus({ name: 'Steigenberger Nile Palace', kind: 'cruise' }, catalog)).toBe('not_on_file')
    expect(propertyRateStatus({ name: 'Al Farida Nile Cruise', kind: 'cruise' }, catalog)).toBe('on_file')
  })

  it('the days API reports it per night line and the page warns; the share page never sees it', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('app/api/itineraries/[id]/days/route.ts', 'utf8')).toContain('property_rate_status')
    expect(readFileSync('app/itineraries/[id]/page.tsx', 'utf8')).toContain('overnight-stale')
    expect(readFileSync('lib/itinerary-share.ts', 'utf8')).not.toContain('property_rate_status')
  })
})
