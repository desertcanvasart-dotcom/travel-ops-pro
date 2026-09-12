// The transportation sheet's vehicle columns come from the agency's vehicle
// types, not from a fixed five.
//
// Class C, phase 4a. The importer/exporter spoke sedan…bus only, so a 4x4
// defined in Settings → Vocabulary could be priced from the form (P2) and
// shown everywhere (P3) but never travel in a sheet — and a sheet is how
// rates move between installs. The sheet stays FLAT: one column-set per
// vehicle, generated from the vocabulary; the cells fold into the row's
// `vehicles` list on import and flatten back out on export.
import { describe, it, expect } from 'vitest'
import {
  RATE_TABLE_CONFIGS, PRESET_VEHICLE_COLUMNS, transportationConfigFor, vehicleColumnSpecsFor,
  getTemplateHeaders, getExportHeaders, buildTemplateRow,
} from '@/lib/bulk-rate-service'
import { vehiclesFromFlatRow, flattenVehicles, stripVehicleFields, legacyColumnsFor } from '@/lib/rates/vehicle-bands'

const agency = vehicleColumnSpecsFor([
  { key: 'sedan', label: 'Sedan', meta: { min_pax: 1, max_pax: 2 } },
  { key: '4x4', label: '4x4', meta: { min_pax: 1, max_pax: 6 } },
  { key: 'bus', label: 'Bus', meta: { min_pax: 25, max_pax: 45 } },
])

describe('transportationConfigFor — the sheet for an agency', () => {
  it('the default config is still the five presets, byte-for-byte in headers', () => {
    const headers = getTemplateHeaders(RATE_TABLE_CONFIGS.transportation_rates)
    for (const k of ['sedan', 'minivan', 'van', 'minibus', 'bus']) {
      expect(headers).toContain(`${k}_rate_eur`)
      expect(headers).toContain(`${k}_capacity_min`)
      expect(headers).not.toContain(`${k}_rate_non_eur`)
    }
    expect(PRESET_VEHICLE_COLUMNS.map(p => p.key)).toEqual(['sedan', 'minivan', 'van', 'minibus', 'bus'])
  })
  it('an agency-added vehicle gets its own column-set, in the agency\'s order, and the presets it dropped are gone', () => {
    const headers = getTemplateHeaders(transportationConfigFor(agency))
    expect(headers.filter(h => /_rate_eur$/.test(h))).toEqual(['sedan_rate_eur', '4x4_rate_eur', 'bus_rate_eur'])
    expect(headers).toContain('4x4_capacity_min')
    expect(headers).not.toContain('4x4_rate_non_eur') // legacy, readable, never offered
    expect(headers).not.toContain('minivan_rate_eur')
    // The non-vehicle columns keep their places around the block.
    expect(headers.indexOf('includes')).toBeLessThan(headers.indexOf('sedan_rate_eur'))
    expect(headers.indexOf('bus_capacity_max')).toBeLessThan(headers.indexOf('season'))
    expect(getExportHeaders(transportationConfigFor(agency))).toContain('4x4_rate_non_eur')
  })
  it('the template samples a vehicle\'s Settings band, even for a key the generic sampler cannot read', () => {
    const row = buildTemplateRow(transportationConfigFor(agency))
    expect([row['4x4_capacity_min'], row['4x4_capacity_max']]).toEqual(['1', '6'])
    expect([row.bus_capacity_min, row.bus_capacity_max]).toEqual(['25', '45'])
  })
  it('without a vocabulary the specs are the presets with their conventional bands', () => {
    expect(vehicleColumnSpecsFor([]).map(s => [s.key, s.min, s.max])).toEqual([['sedan', 1, 2], ['minivan', 3, 7], ['van', 8, 12], ['minibus', 13, 20], ['bus', 21, 45]])
  })
})

describe('a sheet row ↔ the vehicles list', () => {
  it('folds the cells into a list — the whole list, a blank band from the spec, no rate = not offered', () => {
    const row = { service_code: 'LXR-1', sedan_rate_eur: 45, '4x4_rate_eur': '85', '4x4_capacity_max': '5', bus_rate_eur: '' }
    const list = vehiclesFromFlatRow(row, agency)
    expect(list).toEqual([
      { key: 'sedan', rate_eur: 45, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
      { key: '4x4', rate_eur: 85, rate_non_eur: null, capacity_min: 1, capacity_max: 5 },
    ])
  })
  it('strips the cells so an unknown column never reaches the upsert, and mirrors the presets', () => {
    const row: Record<string, unknown> = { service_code: 'LXR-1', sedan_rate_eur: 45, '4x4_rate_eur': 85, '4x4_capacity_min': 1, '4x4_capacity_max': 6 }
    const list = vehiclesFromFlatRow(row, agency)!
    stripVehicleFields(row, agency.map(s => s.key))
    Object.assign(row, { vehicles: list, ...legacyColumnsFor(list) })
    expect(Object.keys(row).some(k => k.startsWith('4x4_'))).toBe(false)
    expect(row.sedan_rate_eur).toBe(45)
    expect(row.sedan_rate_non_eur).toBe(45)
    expect((row.vehicles as { key: string }[]).map(v => v.key)).toEqual(['sedan', '4x4'])
  })
  it('flattens a list back into the sheet\'s cells and round-trips', () => {
    const list = vehiclesFromFlatRow({ sedan_rate_eur: 45, '4x4_rate_eur': 85 }, agency)!
    const cells = flattenVehicles({ vehicles: list }, agency)
    expect(cells['4x4_rate_eur']).toBe(85)
    expect(cells['4x4_capacity_max']).toBe(6)
    expect(cells.bus_rate_eur).toBeNull() // not offered → blank cell
    expect(vehiclesFromFlatRow(cells, agency)).toEqual(list)
  })
  it('a vehicle the row offers but the sheet has no column for is left behind, not invented as a column', () => {
    const cells = flattenVehicles({ vehicles: [{ key: 'horse_carriage', rate_eur: 30, rate_non_eur: null, capacity_min: 1, capacity_max: 4 }] }, agency)
    expect(Object.keys(cells).some(k => k.startsWith('horse_carriage'))).toBe(false)
  })
})
