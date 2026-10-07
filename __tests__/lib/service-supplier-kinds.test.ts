// The itinerary editor's supplier list: a line's kind of supplier, in its city
// (lib/suppliers/service-supplier-kinds.ts).
import { describe, it, expect } from 'vitest'
import { supplierTypesForService, supplierCityForService, groupSuppliersByCity } from '@/lib/suppliers/service-supplier-kinds'
import { SUPPLIER_TYPE_VALUES } from '@/lib/supplier-types'

describe('the kind of supplier a line is booked with', () => {
  it('a hotel night hotels, a car transport and drivers, a tip ground handlers', () => {
    expect(supplierTypesForService('accommodation')).toEqual(['hotel'])
    expect(supplierTypesForService('transportation')).toEqual(['transport', 'driver'])
    expect(supplierTypesForService('tips')).toEqual(['ground_handler', 'other'])
    expect(supplierTypesForService(' Meal ')).toEqual(['restaurant'])
  })
  it('none for a kind it does not know', () => {
    expect(supplierTypesForService('mystery')).toEqual([])
    expect(supplierTypesForService(null)).toEqual([])
  })
  it('every key it asks for is a supplier type this app has', () => {
    for (const st of ['accommodation', 'cruise', 'transportation', 'transfer', 'train', 'guide', 'meal', 'entrance', 'activity', 'flight', 'tips', 'supplies', 'service_fee', 'other']) {
      for (const key of supplierTypesForService(st)) expect(SUPPLIER_TYPE_VALUES).toContain(key)
    }
  })
})

describe('where the supplier should be', () => {
  const dayTrip = { city: 'Alexandria', overnight_city: 'Cairo' }
  it('a hotel or a ship: where the night is', () => {
    expect(supplierCityForService('accommodation', dayTrip)).toBe('Cairo')
    expect(supplierCityForService('cruise', { city: 'Luxor', overnight_city: 'Aswan' })).toBe('Aswan')
  })
  it('everything else: where the day is spent', () => {
    expect(supplierCityForService('meal', dayTrip)).toBe('Alexandria')
    expect(supplierCityForService('tips', dayTrip)).toBe('Alexandria')
  })
  it('no night, or on board: the day’s city', () => {
    expect(supplierCityForService('accommodation', { city: 'Cairo', overnight_city: null })).toBe('Cairo')
    expect(supplierCityForService('accommodation', { city: 'Luxor', overnight_city: 'On board' })).toBe('Luxor')
    expect(supplierCityForService('meal', { city: '' })).toBeNull()
  })
})

describe('the list', () => {
  it('the city first, then the same kind elsewhere — each once', () => {
    const mena = { id: '1', name: 'Mena House', city: 'Cairo' }
    const four = { id: '2', name: 'Four Seasons', city: 'Cairo' }
    const old = { id: '3', name: 'Old Cataract', city: 'Aswan' }
    const winter = { id: '4', name: 'Winter Palace', city: 'Luxor' }
    const nowhere = { id: '5', name: 'Agency hotel desk', city: null }
    const g = groupSuppliersByCity([mena, four], [winter, mena, nowhere, old, four])
    expect(g.inCity.map(s => s.name)).toEqual(['Four Seasons', 'Mena House'])
    expect(g.otherCities.map(s => s.name)).toEqual(['Old Cataract', 'Winter Palace', 'Agency hotel desk'])
  })
})
