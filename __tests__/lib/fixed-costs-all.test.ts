// Every ACTIVE fixed cost is charged, each as its own named line, per person
// for each sightseeing day (owner decision 2026-10-14). Before, only a cost
// named "Water Bottle" was priced and any other row was saved and ignored.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { fixedCostItemsFromRows, getFixedDailyCosts, clearFixedCostsCache } from '@/lib/fixed-costs'
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'
import { createCruiseItineraryServices } from '@/lib/ai/cruise-service-creation'

// A stand-in normaliser: EGP → run currency at 50 per unit; BTC has no rate.
const normalizer = {
  misses: [] as unknown[],
  normalize: async (_t: string, rows: Record<string, unknown>[]) =>
    rows.map(r => r.rate_currency === 'EGP'
      ? { ...r, cost_per_person_per_day: Number(r.cost_per_person_per_day) / 50 }
      : r.rate_currency === 'BTC' ? { ...r, cost_per_person_per_day: null } : r),
}

describe('fixedCostItemsFromRows (pure)', () => {
  const water = { cost_type: 'Water Bottle', cost_per_person_per_day: 1, is_active: true }
  const wifi = { cost_type: 'Wifi', cost_per_person_per_day: 3, is_active: true }

  it('water first, then every other active cost as its own item', () => {
    const out = fixedCostItemsFromRows([wifi, water, { cost_type: 'Snacks', cost_per_person_per_day: 2, is_active: true }])
    expect(out.items.map(i => [i.name, i.perPersonPerDay, i.isWater])).toEqual([
      ['Water Bottle', 1, true], ['Snacks', 2, false], ['Wifi', 3, false],
    ])
    expect(out.extraItems.map(i => i.name)).toEqual(['Snacks', 'Wifi'])
    expect(out.waterPerPersonPerDay).toBe(1)
    expect(out.warnings).toEqual([])
  })

  it('an inactive row never charges — not even water, which then falls back with its warning', () => {
    const out = fixedCostItemsFromRows([{ ...wifi, is_active: false }, { ...water, is_active: false }])
    expect(out.extraItems).toEqual([])
    expect(out.waterPerPersonPerDay).toBe(2)
    expect(out.warnings[0]).toMatch(/no active "Water Bottle" row/)
  })

  it('no rows: the 2.00 water fallback with its warning, and no other line', () => {
    const out = fixedCostItemsFromRows([])
    expect(out.items).toEqual([{ name: 'Water Bottle', perPersonPerDay: 2, isWater: true }])
    expect(out.extraItems).toEqual([])
    expect(out.warnings).toHaveLength(1)
  })

  it('a cost with no exchange rate is not charged and the warning names it', () => {
    const out = fixedCostItemsFromRows([water, { ...wifi, rate_currency: 'BTC', cost_per_person_per_day: null }], { converted: true })
    expect(out.extraItems).toEqual([])
    expect(out.warnings).toEqual(['"Wifi" not charged: the row is in BTC and no exchange rate was available'])
  })

  it('a zero cost adds no line; tips never come from here', () => {
    const out = fixedCostItemsFromRows([water, { ...wifi, cost_per_person_per_day: 0 }, { cost_type: 'Daily Tips', cost_per_person_per_day: 5.84, is_active: true }])
    expect(out.extraItems).toEqual([])
    expect(out.warnings).toEqual([])
  })

  it('getFixedDailyCosts converts each cost from its own currency', async () => {
    setMockTables({ fixed_daily_costs: [
      { cost_type: 'Water Bottle', cost_per_person_per_day: 20, rate_currency: 'EGP', is_active: true },
      { cost_type: 'Wifi', cost_per_person_per_day: 100, rate_currency: 'EGP', is_active: true },
      { cost_type: 'Gold', cost_per_person_per_day: 1, rate_currency: 'BTC', is_active: true },
    ] })
    clearFixedCostsCache()
    const out = await getFixedDailyCosts('org-1', normalizer as never)
    expect(out.waterPerPersonPerDay).toBe(0.4)
    expect(out.extraItems).toEqual([{ name: 'Wifi', perPersonPerDay: 2, isWater: false }])
    expect(out.warnings).toEqual(['"Gold" not charged: the row is in BTC and no exchange rate was available'])
  })
})

describe('the auto-pricing engine', () => {
  const run = (rows: Record<string, unknown>[]) => {
    const tables = fullRateTables()
    tables.fixed_daily_costs = rows as never
    setMockTables(tables)
    clearFixedCostsCache()
    return calculateDayBasedPricing({ orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard', isEurPassport: true })
  }
  const water = { id: 'w', cost_type: 'Water Bottle', cost_per_person_per_day: 1, is_active: true }
  const wifi = { id: 'x', cost_type: 'Wifi', cost_per_person_per_day: 3, is_active: true }
  type Result = Awaited<ReturnType<typeof run>>
  const total = (r: Result, n: number) => r.paxPricing.find(p => p.numPax === n)!.withoutLeader.totalCost
  const waterDays = (r: Result) => r.services.filter(s => s.serviceType === 'water').length

  beforeEach(() => clearFixedCostsCache())

  it('Water Bottle plus Wifi: both lines on every sightseeing day, totals add, at 2 and 10 pax', async () => {
    const base = await run([water])
    const both = await run([water, wifi])
    const n = waterDays(base)
    expect(n).toBeGreaterThan(0)
    const wifiLines = both.services.filter(s => s.serviceName === 'Wifi')
    expect(wifiLines).toHaveLength(n)
    expect(wifiLines.every(l => l.isPerPax && l.unitCost === 3 && l.lineTotal === 3)).toBe(true)
    expect(both.services.filter(s => s.serviceName === 'Bottled Water')).toHaveLength(n)
    for (const pax of [2, 10]) {
      expect(total(both, pax) - total(base, pax)).toBeCloseTo(3 * n * pax, 2)
    }
    // The tour leader eats it too.
    const lead = (r: Result) => r.paxPricing.find(p => p.numPax === 2)!.withLeader.tourLeaderCost
    expect(lead(both) - lead(base)).toBeCloseTo(3 * n, 2)
  })

  it('an inactive cost is not charged', async () => {
    const base = await run([water])
    const r = await run([water, { ...wifi, is_active: false }])
    expect(r.services.some(s => s.serviceName === 'Wifi')).toBe(false)
    expect(total(r, 2)).toBe(total(base, 2))
  })

  it('no rows: water falls back to 2.00 with its warning and nothing else is added', async () => {
    const r = await run([])
    const w = r.services.filter(s => s.serviceType === 'water')
    expect(w.length).toBeGreaterThan(0)
    expect(w.every(s => s.unitCost === 2)).toBe(true)
    expect(r.services.filter(s => s.id.startsWith('fixed-cost-'))).toEqual([])
    expect(r.warnings.some(x => /Water priced at the built-in 2.00/.test(x))).toBe(true)
  })

  it('an unconvertible cost is not charged and the quote warns, naming it', async () => {
    const base = await run([water])
    const r = await run([water, { id: 'g', cost_type: 'Gold', cost_per_person_per_day: 9, rate_currency: 'ZZZ', is_active: true }])
    expect(r.services.some(s => s.serviceName === 'Gold')).toBe(false)
    expect(total(r, 2)).toBe(total(base, 2))
    expect(r.warnings.some(x => /"Gold" not charged/.test(x))).toBe(true)
  })
})

describe('the cruise AI builder', () => {
  const dayByDay = [
    { day_number: 1, title: 'Board', city: 'Luxor', attractions: [], meals: [], is_sailing_day: false },
    { day_number: 2, title: 'Sail', city: 'Aswan', attractions: [], meals: [], is_sailing_day: true },
    { day_number: 3, title: 'Temple', city: 'Aswan', attractions: [], meals: [], is_sailing_day: false },
  ]
  const build = async (rows: Record<string, unknown>[]) => {
    setMockTables({ ...fullRateTables(), fixed_daily_costs: rows as never, itinerary_days: [], itinerary_services: [] })
    clearFixedCostsCache()
    const supabase = createMockClient() as any
    const res = await createCruiseItineraryServices(supabase, {
      itineraryId: 'it-1',
      cruiseContent: { found: true, content: null, variation: null, dayByDay, recommendedSuppliers: [] },
      cruiseRate: { found: false, shipName: '', supplierId: null, season: 'low', cabinAllocation: [], totalPerNight: 0, totalSupplierCost: 0, nights: 0 },
      startDateObj: new Date('2027-03-01'),
      durationDays: 3, totalPax: 4, isEuroPassport: true, tier: 'standard' as never,
      guideLanguage: 'English', skipPricing: false, marginPercent: 0, includeGuide: false,
      effectiveCity: 'Luxor', orgId: 'org-1',
    })
    const { data } = await supabase.from('itinerary_services').select('*')
    return { res, services: (data ?? []) as Record<string, any>[] }
  }

  it('charges Wifi next to water on each non-sailing day, per person, and in the total', async () => {
    const { res, services } = await build([
      { cost_type: 'Water Bottle', cost_per_person_per_day: 1, is_active: true },
      { cost_type: 'Wifi', cost_per_person_per_day: 3, is_active: true },
    ])
    const wifi = services.filter(s => s.service_name === 'Wifi')
    expect(wifi).toHaveLength(2)
    expect(wifi.every(s => s.quantity === 4 && s.rate_eur === 3 && s.total_cost === 12)).toBe(true)
    expect(services.filter(s => s.service_name === 'Water Bottles')).toHaveLength(2)
    expect(res.totalSupplierCost).toBeGreaterThanOrEqual(2 * 12 + 2 * 4)
  })

  it('an unconvertible cost is not charged and warns', async () => {
    const { res, services } = await build([
      { cost_type: 'Water Bottle', cost_per_person_per_day: 1, is_active: true },
      { cost_type: 'Gold', cost_per_person_per_day: 9, rate_currency: 'ZZZ', is_active: true },
    ])
    expect(services.some(s => s.service_name === 'Gold')).toBe(false)
    expect(res.warnings.some(w => /"Gold" not charged/.test(w))).toBe(true)
  })
})

describe('the land AI builder', () => {
  // createLandItineraryServices needs the whole rate bundle (hotels, guides,
  // meals, transport…) to run; its water block is pinned by source instead.
  it('charges each extra item per person on the same days as water, with the same margin', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('lib/ai/service-creation.ts', 'utf8')
    const water = src.indexOf('service_code: \'WATER\'')
    const extra = src.indexOf('for (const item of extraFixedItems)')
    const hotel = src.indexOf('// Hotel (only if included')
    expect(water).toBeGreaterThan(0)
    // Inside the same touring-day block as water, before the hotel.
    expect(extra).toBeGreaterThan(water)
    expect(extra).toBeLessThan(hotel)
    expect(src).toContain('const itemCost = item.perPersonPerDay * totalPax')
    expect(src).toContain('client_price: withMargin(itemCost)')
    expect(src).toContain('warnings.push(...(fixedCosts.warnings ?? []))')
  })
})
