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
