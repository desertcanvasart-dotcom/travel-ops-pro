// P1 of the vehicle-bands change must change no price.
//
// getTransportRateForPax used to read the five legacy column-sets directly;
// it now reads through vehicleBands(row), which prefers the `vehicles` list
// that migration 20261005 backfills from those same columns. For every row
// shape production holds — and a few it could — the vehicle and rate chosen
// for every group size 1…45 must be identical between:
//   (a) the legacy algorithm, reimplemented here verbatim as the reference,
//   (b) the new wrapper reading the legacy columns (rows not yet backfilled),
//   (c) the new wrapper reading the list the backfill would produce.
import { describe, it, expect } from 'vitest'
import { getTransportRateForPax, getAllVehicleTiers } from '@/lib/transport-rate-utils'

const KEYS = ['sedan', 'minivan', 'van', 'minibus', 'bus'] as const
const DEFAULTS = { sedan: [1, 2], minivan: [3, 7], van: [8, 12], minibus: [13, 20], bus: [21, 45] } as const

// (a) The algorithm as it stood before 20261005 — kept here as the oracle.
type Row = Record<string, number | null | undefined>

function legacyReference(rate: Row, pax: number) {
  const tiers: { tier: string; rateEur: number; rateNonEur: number; min: number; max: number }[] = []
  for (const tier of KEYS) {
    const rateEur = rate[`${tier}_rate_eur`]
    const rateNonEur = rate[`${tier}_rate_non_eur`]
    const min = rate[`${tier}_capacity_min`] ?? DEFAULTS[tier][0]
    const max = rate[`${tier}_capacity_max`] ?? DEFAULTS[tier][1]
    if (rateEur != null && rateEur > 0) tiers.push({ tier, rateEur, rateNonEur: rateNonEur ?? rateEur, min, max })
  }
  if (tiers.length === 0) return null
  const pick = tiers.find(t => pax >= t.min && pax <= t.max) ?? tiers.find(t => t.max >= pax) ?? tiers[tiers.length - 1]
  return { tier: pick.tier, rateEur: pick.rateEur, rateNonEur: pick.rateNonEur, capacityMin: pick.min, capacityMax: pick.max }
}

// The backfill in 20261005, as JavaScript.
function backfill(row: Row) {
  return KEYS
    .filter(k => (row[`${k}_rate_eur`] ?? 0) > 0)
    .map(k => ({ key: k, rate_eur: row[`${k}_rate_eur`] ?? 0, rate_non_eur: row[`${k}_rate_non_eur`] ?? null, capacity_min: row[`${k}_capacity_min`] ?? 0, capacity_max: row[`${k}_capacity_max`] ?? 0 }))
    .sort((a, b) => a.capacity_max - b.capacity_max || a.capacity_min - b.capacity_min)
}

const bands = { sedan_capacity_min: 1, sedan_capacity_max: 2, minivan_capacity_min: 3, minivan_capacity_max: 7, van_capacity_min: 8, van_capacity_max: 12, minibus_capacity_min: 13, minibus_capacity_max: 20, bus_capacity_min: 21, bus_capacity_max: 45 }

const FIXTURES: Record<string, Row> = {
  // What all 101 production rows look like on 2026-09-12: four vehicles, no van, default bands.
  'production shape': { ...bands, sedan_rate_eur: 45, minivan_rate_eur: 60, van_rate_eur: null, minibus_rate_eur: 95, bus_rate_eur: 140 },
  'with non-EU rates': { ...bands, sedan_rate_eur: 45, sedan_rate_non_eur: 50, minivan_rate_eur: 60, minivan_rate_non_eur: 66, minibus_rate_eur: 95, minibus_rate_non_eur: 100, bus_rate_eur: 140, bus_rate_non_eur: 155 },
  'all five': { ...bands, sedan_rate_eur: 45, minivan_rate_eur: 60, van_rate_eur: 75, minibus_rate_eur: 95, bus_rate_eur: 140 },
  'bus only': { ...bands, bus_rate_eur: 140 },
  'sedan and bus (big gap)': { ...bands, sedan_rate_eur: 45, bus_rate_eur: 140 },
  'agency bands (minivan from 1, no sedan)': { ...bands, minivan_capacity_min: 1, minivan_rate_eur: 60, minibus_rate_eur: 95, bus_rate_eur: 140 },
  'zero rates are not offered': { ...bands, sedan_rate_eur: 0, minivan_rate_eur: 60, bus_rate_eur: 140 },
}

const strip = (r: ReturnType<typeof getTransportRateForPax>) =>
  r && { tier: r.tier, rateEur: r.rateEur, rateNonEur: r.rateNonEur, capacityMin: r.capacityMin, capacityMax: r.capacityMax }

describe('vehicle-bands parity — the same vehicle and rate for every pax count', () => {
  for (const [name, row] of Object.entries(FIXTURES)) {
    it(`${name}: legacy columns → wrapper`, () => {
      for (let pax = 1; pax <= 45; pax++) {
        expect(strip(getTransportRateForPax(row, pax)), `pax ${pax}`).toEqual(legacyReference(row, pax))
      }
    })
    it(`${name}: backfilled list → wrapper`, () => {
      const listed = { ...row, vehicles: backfill(row) }
      for (let pax = 1; pax <= 45; pax++) {
        expect(strip(getTransportRateForPax(listed, pax)), `pax ${pax}`).toEqual(legacyReference(row, pax))
      }
    })
    it(`${name}: getAllVehicleTiers lists the same vehicles in the same order`, () => {
      const fromColumns = getAllVehicleTiers(row).map(r => r.tier)
      const fromList = getAllVehicleTiers({ ...row, vehicles: backfill(row) }).map(r => r.tier)
      expect(fromList).toEqual(fromColumns)
      expect(fromColumns).toEqual(KEYS.filter(k => (row[`${k}_rate_eur`] ?? 0) > 0))
    })
  }

  it('the oldest single-rate shape still answers as it did (vehicle_type word, sedan tier, 1–45)', () => {
    const r = getTransportRateForPax({ base_rate_eur: 80, base_rate_non_eur: 90, vehicle_type: 'Minibus' }, 10)
    expect(r).toMatchObject({ vehicleType: 'Minibus', rateEur: 80, rateNonEur: 90, capacityMin: 1, capacityMax: 45, tier: 'sedan' })
  })
})
