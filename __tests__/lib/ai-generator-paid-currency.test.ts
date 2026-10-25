// The AI generators (land + cruise) price every rate in the run currency, and
// a line priced from rates entered in another currency says what its
// supplier is PAID in (lib/paid-currency, 20270109).
//
// Eight rate reads converted nothing before this: the land path's intercity,
// day-trip, per-city day-tour, per-city transfer and flight-day-tour
// transport, its hybrid cruise days' ship, and the cruise path's guide,
// entrance fees and activities — an EGP 500 entrance was priced as 500 of
// the run currency.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
// The run's exchange rates: 1 EUR = 50 EGP.
vi.mock('@/lib/rates/fx-source', async (orig) => ({
  ...(await orig<typeof import('@/lib/rates/fx-source')>()),
  fetchRunExchangeRates: async () => ({ base: 'EUR', date: '2027-03-01', rates: { EUR: 1, EGP: 50 } }),
}))

import { clearFixedCostsCache } from '@/lib/fixed-costs'
import { createCruiseItineraryServices } from '@/lib/ai/cruise-service-creation'

const RATE_TABLES = [
  'transportation_rates', 'accommodation_rates', 'guide_rates', 'entrance_fees', 'activity_rates',
  'meal_rates', 'airport_staff_rates', 'hotel_staff_rates', 'nile_cruises',
]

describe('every rate the generators read is converted to the run currency', () => {
  for (const file of ['lib/ai/service-creation.ts', 'lib/ai/cruise-service-creation.ts']) {
    it(file, () => {
      const src = readFileSync(file, 'utf8')
      const unconverted: string[] = []
      for (const m of src.matchAll(/\.from\('([a-z_]+)'\)\s*\.select\('([^']*)'\)/g)) {
        if (!RATE_TABLES.includes(m[1])) continue
        // A read of names only carries no money (fetchHotelsForCities).
        if (!/\*|rate|cost|price/.test(m[2])) continue
        const after = src.slice(m.index!, m.index! + 3000)
        if (!/normalize\(/.test(after)) unconverted.push(`${m[1]} at line ${src.slice(0, m.index!).split('\n').length}`)
      }
      expect(unconverted).toEqual([])
    })
  }

  it('the land path hands its normaliser to the hybrid cruise lookup', () => {
    const src = readFileSync('lib/ai/service-creation.ts', 'utf8')
    const call = src.slice(src.indexOf('hoistedCruiseRate = await getCruiseRate({'), src.indexOf('hoistedCruiseRate = await getCruiseRate({') + 400)
    expect(call).toContain('normalizer: rates.rateNormalizer')
  })
})

describe('the land generator names the rates behind each line', () => {
  const src = readFileSync('lib/ai/service-creation.ts', 'utf8')
  it('supplier lines carry __paidFrom; the insert turns it into paid fields and never writes it', () => {
    for (const source of [
      'paidFrom(rates.selectedGuide?.rate_currency)',
      'paidFrom(cityHotel.selectedHotel?.rate_currency)',
      'paidFrom(hoistedCruiseRate.rate_currency)',
      'paidFrom(intercityRateCurrency)',
      'paidFrom(transportRateCurrency)',
      'paidFrom(rates.hotelServiceRateCurrency)',
      '__paidFrom: entranceSources',
    ]) expect(src).toContain(source)
    expect(src.match(/await withPaidFields\(/g)).toHaveLength(2)
    expect(src).toContain('return rows.map(({ __paidFrom, ...row }) => {')
  })
})

describe('the cruise generator', () => {
  const dayByDay = [
    { day_number: 1, title: 'Board', city: 'Luxor', attractions: ['Karnak Temple'], meals: [], is_sailing_day: false },
    { day_number: 2, title: 'Sail', city: 'Aswan', attractions: [], meals: [], is_sailing_day: true },
    { day_number: 3, title: 'Disembark', city: 'Aswan', attractions: [], meals: [], is_sailing_day: false },
  ]
  const build = async () => {
    setMockTables({
      ...fullRateTables(),
      fixed_daily_costs: [],
      // Entered in EGP: 500 a person, and a guide at 1,500 a day.
      entrance_fees: [{ id: 'e1', org_id: 'org-1', attraction_name: 'Karnak Temple', city: 'Luxor', eur_rate: 500, non_eur_rate: 500, rate_currency: 'EGP', is_active: true }],
      activity_rates: [],
      guide_rates: [{ id: 'g1', org_id: 'org-1', guide_language: 'English', guide_name: 'Ahmed', base_rate_eur: 1500, base_rate_non_eur: 1500, rate_currency: 'EGP', is_active: true }],
      itinerary_days: [],
      itinerary_services: [],
    })
    clearFixedCostsCache()
    const supabase = createMockClient() as any
    await createCruiseItineraryServices(supabase, {
      itineraryId: 'it-1',
      cruiseContent: { found: true, content: null, variation: null, dayByDay, recommendedSuppliers: [] },
      cruiseRate: { found: false, shipName: '', supplierId: null, season: 'low', cabinAllocation: [], totalPerNight: 0, totalSupplierCost: 0, nights: 0 },
      startDateObj: new Date('2027-03-01'),
      durationDays: 3, totalPax: 4, isEuroPassport: true, tier: 'standard' as never,
      guideLanguage: 'English', skipPricing: false, marginPercent: 0, includeGuide: true,
      effectiveCity: 'Luxor', orgId: 'org-1', rateCurrency: 'EUR', currency: 'EUR',
    })
    const { data } = await supabase.from('itinerary_services').select('*')
    return (data ?? []) as Record<string, any>[]
  }

  it('an EGP 500 entrance fee is €10 a person, not €500 — and the line is paid EGP 2,000', async () => {
    const services = await build()
    const entrance = services.find(s => s.service_type === 'entrance')!
    expect(entrance).toMatchObject({ rate_eur: 10, total_cost: 40, paid_currency: 'EGP', paid_amount: 2000 })
    expect(entrance.paid_rate).toBeCloseTo(0.02, 10)
    expect(entrance).not.toHaveProperty('__paidFrom')
  })

  it('an EGP 1,500 guide is €30 a day, paid EGP 1,500', async () => {
    const guides = (await build()).filter(s => s.service_type === 'guide')
    expect(guides.length).toBeGreaterThan(0)
    expect(guides.every(g => g.total_cost === 30 && g.paid_currency === 'EGP' && g.paid_amount === 1500)).toBe(true)
  })

  it('a line from rates in the run currency carries no paid currency', async () => {
    const water = (await build()).filter(s => s.service_type === 'supplies')
    expect(water.every(w => w.paid_currency === null)).toBe(true)
  })
})
