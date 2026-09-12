// The one reader for a transportation rate's vehicles (lib/rates/vehicle-bands).
//
// A rate's vehicles were twenty columns for five hardcoded names; they are
// now a list keyed by the vocabulary vehicle key, with the columns kept
// for readers not yet converted. These pin the reader's three fallbacks,
// the storage sanitiser, and the chooser — which must be the rule the
// columns always had: exact band, else the smallest vehicle whose maximum
// covers the group, else the largest.
import { describe, it, expect } from 'vitest'
import {
  sanitizeVehicles, parseVehicles, vehicleBands, vehicleRateForPax, LEGACY_VEHICLE_BANDS,
  vehiclesFromBody, legacyColumnsFor, allowedVehicleKeys, unknownVehicleKeys, bodyTouchesVehicles,
  vehicleKeyLabel,
} from '@/lib/rates/vehicle-bands'

describe('vehicleKeyLabel — a readable word where no vocabulary label is at hand', () => {
  it('reads presets as before and an agency key as words', () => {
    expect(['sedan', 'minivan', 'bus'].map(vehicleKeyLabel)).toEqual(['Sedan', 'Minivan', 'Bus'])
    expect(vehicleKeyLabel('horse_carriage')).toBe('Horse Carriage')
    expect(vehicleKeyLabel('4x4')).toBe('4x4')
    expect(vehicleKeyLabel('suv')).toBe('Suv') // the vocabulary label ("SUV") wins wherever it is available
  })
})

const v = (key: string, rate: number, min: number, max: number, nonEur: number | null = null) =>
  ({ key, rate_eur: rate, rate_non_eur: nonEur, capacity_min: min, capacity_max: max })

describe('sanitizeVehicles — a list fit to store', () => {
  it('keeps priced vehicles, drops unpriced ones, sorts by band', () => {
    const out = sanitizeVehicles([v('bus', 140, 21, 45), { key: 'van', rate_eur: '', capacity_min: 8, capacity_max: 12 }, v('sedan', 45, 1, 2)])
    expect(out?.map(b => b.key)).toEqual(['sedan', 'bus'])
  })
  it('slugs the key and accepts an agency-added vehicle', () => {
    expect(sanitizeVehicles([v('Horse Carriage', 30, 1, 4)])?.[0].key).toBe('horse_carriage')
    expect(sanitizeVehicles([v('4x4', 85, 1, 6)])?.[0].key).toBe('4x4')
  })
  it('refuses what it cannot repair: a bad key, min > max, a duplicate, a non-list', () => {
    expect(sanitizeVehicles([v('', 45, 1, 2)])).toBeNull()
    expect(sanitizeVehicles([v('sedan', 45, 3, 2)])).toBeNull()
    expect(sanitizeVehicles([v('sedan', 45, 1, 2), v('Sedan', 50, 1, 2)])).toBeNull()
    expect(sanitizeVehicles({ key: 'sedan' })).toBeNull()
    expect(sanitizeVehicles('sedan')).toBeNull()
  })
  it('an empty list is a real "offers nothing", not a missing list', () => {
    expect(sanitizeVehicles([])).toEqual([])
    expect(parseVehicles(null)).toBeNull()
    expect(parseVehicles(undefined)).toBeNull()
  })
  it('non-EU null means same as EUR; negative non-EU is treated as unset', () => {
    expect(sanitizeVehicles([v('sedan', 45, 1, 2, 50)])?.[0].rate_non_eur).toBe(50)
    expect(sanitizeVehicles([v('sedan', 45, 1, 2, -1)])?.[0].rate_non_eur).toBeNull()
  })
  it('parseVehicles tolerates the JSONB arriving as a string', () => {
    expect(parseVehicles(JSON.stringify([v('sedan', 45, 1, 2)]))?.[0].key).toBe('sedan')
    expect(parseVehicles('not json')).toBeNull()
  })
})

describe('vehicleBands — three fallbacks, in order', () => {
  const columns = {
    sedan_rate_eur: 45, sedan_capacity_min: 1, sedan_capacity_max: 2,
    minivan_rate_eur: 60, minivan_capacity_min: 3, minivan_capacity_max: 7,
    van_rate_eur: null, van_capacity_min: 8, van_capacity_max: 12,
    minibus_rate_eur: 95, minibus_capacity_min: 13, minibus_capacity_max: 20,
    bus_rate_eur: 140, bus_rate_non_eur: 150, bus_capacity_min: 21, bus_capacity_max: 45,
  }
  it('1. the list wins when the row has one, even over populated columns', () => {
    const row = { ...columns, vehicles: [v('4x4', 85, 1, 6)] }
    expect(vehicleBands(row).map(b => b.key)).toEqual(['4x4'])
  })
  it('2. else the legacy columns — only priced vehicles, the row\'s own bands, non-EU carried', () => {
    const bands = vehicleBands(columns)
    expect(bands.map(b => b.key)).toEqual(['sedan', 'minivan', 'minibus', 'bus'])
    expect(bands[3]).toEqual(v('bus', 140, 21, 45, 150))
  })
  it('2b. a column with no band falls back to the legacy default band', () => {
    expect(vehicleBands({ sedan_rate_eur: 45 })[0]).toMatchObject({ capacity_min: LEGACY_VEHICLE_BANDS.sedan.min, capacity_max: LEGACY_VEHICLE_BANDS.sedan.max })
  })
  it('3. else the oldest shape: one base rate for one vehicle_type', () => {
    expect(vehicleBands({ base_rate_eur: 80, vehicle_type: 'Minibus', capacity_min: 10, capacity_max: 20 }))
      .toEqual([v('minibus', 80, 10, 20)])
    expect(vehicleBands({ base_rate_eur: 80 })).toEqual([v('vehicle', 80, 1, 45)])
  })
  it('nothing priced → empty', () => {
    expect(vehicleBands({})).toEqual([])
    expect(vehicleBands({ sedan_rate_eur: 0, base_rate_eur: 0 })).toEqual([])
  })
})

describe('vehicleRateForPax — the rule the columns always had', () => {
  const row = { vehicles: [v('sedan', 45, 1, 2), v('minivan', 60, 3, 7), v('minibus', 95, 13, 20), v('bus', 140, 21, 45)] }
  it('exact band', () => {
    expect(vehicleRateForPax(row, 2)?.key).toBe('sedan')
    expect(vehicleRateForPax(row, 5)?.key).toBe('minivan')
  })
  it('a gap in the bands (no van) → the smallest vehicle whose maximum covers', () => {
    expect(vehicleRateForPax(row, 10)?.key).toBe('minibus')
  })
  it('beyond every band → the largest offered', () => {
    expect(vehicleRateForPax(row, 60)?.key).toBe('bus')
  })
  it('an agency-added band competes on size like any other', () => {
    const withSuv = { vehicles: [...row.vehicles, v('suv', 55, 1, 4)] }
    expect(vehicleRateForPax(withSuv, 2)?.key).toBe('sedan') // smaller band first
    expect(vehicleRateForPax(withSuv, 4)?.key).toBe('suv')
  })
  it('nothing offered → null', () => {
    expect(vehicleRateForPax({}, 2)).toBeNull()
  })
})

describe('vehiclesFromBody — what a write carries', () => {
  const existing = [v('sedan', 45, 1, 2), v('4x4', 85, 1, 6), v('bus', 140, 21, 45)]

  it('a list replaces the row\'s vehicles', () => {
    const r = vehiclesFromBody({ vehicles: [v('minivan', 60, 3, 7)] }, existing)
    expect(r.vehicles?.map(b => b.key)).toEqual(['minivan'])
  })
  it('a malformed list is refused, not repaired', () => {
    expect(vehiclesFromBody({ vehicles: [v('sedan', 45, 3, 2)] }).invalid).toMatch(/min ≤ max/)
    expect(vehiclesFromBody({ vehicles: 'sedan' }).invalid).toBeTruthy()
  })
  it('legacy fields PATCH the row: a vehicle the client does not know survives', () => {
    // An importer that speaks only sedan…bus re-prices the sedan; the 4x4 priced from the form stays.
    const r = vehiclesFromBody({ sedan_rate_eur: '50' }, existing)
    expect(r.vehicles?.map(b => [b.key, b.rate_eur])).toEqual([['sedan', 50], ['4x4', 85], ['bus', 140]])
    expect(r.vehicles?.[0]).toMatchObject({ capacity_min: 1, capacity_max: 2 }) // band kept from the row
  })
  it('a legacy field blanked or zero removes that vehicle, as a blank column always did', () => {
    expect(vehiclesFromBody({ bus_rate_eur: null }, existing).vehicles?.map(b => b.key)).toEqual(['sedan', '4x4'])
    expect(vehiclesFromBody({ bus_rate_eur: 0 }, existing).vehicles?.map(b => b.key)).toEqual(['sedan', '4x4'])
  })
  it('a legacy vehicle new to the row takes the conventional band unless given one', () => {
    const r = vehiclesFromBody({ minivan_rate_eur: 60 }, [])
    expect(r.vehicles?.[0]).toEqual(v('minivan', 60, LEGACY_VEHICLE_BANDS.minivan.min, LEGACY_VEHICLE_BANDS.minivan.max))
    const withBand = vehiclesFromBody({ minivan_rate_eur: 60, minivan_capacity_min: '1', minivan_capacity_max: '8' }, [])
    expect(withBand.vehicles?.[0]).toMatchObject({ capacity_min: 1, capacity_max: 8 })
  })
  it('no vehicle field at all → nothing to change', () => {
    expect(vehiclesFromBody({ notes: 'x' }, existing)).toEqual({})
    expect(bodyTouchesVehicles({ notes: 'x' })).toBe(false)
    expect(bodyTouchesVehicles({ van_capacity_max: 14 })).toBe(true)
    expect(bodyTouchesVehicles({ vehicles: [] })).toBe(true)
  })
})

describe('legacyColumnsFor — the mirror for readers not yet converted', () => {
  it('writes the five presets, clears an absent one, leaves a custom vehicle to the list', () => {
    const cols = legacyColumnsFor([v('sedan', 45, 1, 2, 50), v('4x4', 85, 1, 6)])
    expect(cols).toMatchObject({
      sedan_rate_eur: 45, sedan_rate_non_eur: 50, sedan_capacity_min: 1, sedan_capacity_max: 2,
      bus_rate_eur: null, bus_rate_non_eur: null, bus_capacity_min: LEGACY_VEHICLE_BANDS.bus.min, bus_capacity_max: LEGACY_VEHICLE_BANDS.bus.max,
    })
    expect(Object.keys(cols).some(k => k.startsWith('4x4'))).toBe(false)
  })
  it('rate_non_eur null mirrors as "same as EUR"', () => {
    expect(legacyColumnsFor([v('minivan', 60, 3, 7)]).minivan_rate_non_eur).toBe(60)
  })
})

describe('allowedVehicleKeys — the agency\'s list, plus what the row already carries', () => {
  it('the vocabulary when there is one, else the presets', () => {
    expect([...allowedVehicleKeys(['sedan', 'suv', '4x4'])]).toEqual(['sedan', 'suv', '4x4'])
    expect([...allowedVehicleKeys([])]).toEqual(['sedan', 'minivan', 'van', 'minibus', 'bus'])
  })
  it('a vehicle hidden in Settings stays allowed on a row that prices it', () => {
    const allowed = allowedVehicleKeys(['sedan'], [v('horse_carriage', 30, 1, 4)])
    expect(unknownVehicleKeys([v('horse_carriage', 30, 1, 4)], allowed)).toEqual([])
    expect(unknownVehicleKeys([v('tuk_tuk', 10, 1, 2)], allowed)).toEqual(['tuk_tuk'])
  })
})
