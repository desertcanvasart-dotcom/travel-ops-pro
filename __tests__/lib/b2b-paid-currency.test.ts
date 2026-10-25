// The B2B quote engine and the calculator carry the currency each rate was
// entered in onto the quote's services_snapshot (paid_currency + paid_fx), and
// the trip made from a quote — calculator or website order — says what each
// supplier is PAID in (lib/paid-currency, 20270109). Prices are unchanged.
//
// Two B2B rate reads converted nothing before this: the itinerary→quote
// entrance fee and the calculator's picked cruise.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
// The run's exchange rates: 1 EUR = 50 EGP.
vi.mock('@/lib/rates/fx-source', async (orig) => ({
  ...(await orig<typeof import('@/lib/rates/fx-source')>()),
  fetchRunExchangeRates: async () => ({ base: 'EUR', date: '2027-03-01', rates: { EUR: 1, EGP: 50 } }),
}))

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'
import { clearFixedCostsCache } from '@/lib/fixed-costs'
import { snapshotPaidFields } from '@/lib/paid-currency'
import { serviceLineForItinerary } from '@/lib/itineraries/template-days'
import { priceEntranceLine, priceMealLine } from '@/lib/b2b/variation-service-rates'
import { linesInWebsiteCurrency } from '@/lib/pricing/website-price'

describe('snapshotPaidFields', () => {
  it('keeps the entered currency and its factor; nothing for the rate currency', () => {
    expect(snapshotPaidFields('egp', 0.02)).toEqual({ paid_currency: 'EGP', paid_fx: 0.02 })
    expect(snapshotPaidFields('EUR', 1)).toEqual({})
    expect(snapshotPaidFields(null, null)).toEqual({})
    expect(snapshotPaidFields('EGP', null)).toEqual({})
  })
})

describe('the engine', () => {
  it('a guide rate entered as EGP 1,500 prices at €30 and its line says EGP', async () => {
    const tables = fullRateTables()
    tables.guide_rates = tables.guide_rates.map(g => ({ ...g, base_rate_eur: 1500, rate_eur: 1500, rate_currency: 'EGP' })) as never
    setMockTables(tables)
    clearFixedCostsCache()
    const r = await calculateDayBasedPricing({ orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard', isEurPassport: true })
    const guides = r.services.filter(s => s.serviceType === 'guide' && !s.unpriced)
    expect(guides.length).toBeGreaterThan(0)
    for (const g of guides) {
      expect(g.unitCost).toBe(30)
      expect(g.enteredCurrency).toBe('EGP')
      expect(g.enteredFx).toBeCloseTo(0.02, 10)
    }
    // a line from a rate in the rate currency carries neither
    const hotel = r.services.find(s => s.serviceType === 'accommodation' && !s.unpriced)
    expect(hotel?.enteredCurrency).toBeUndefined()
  })
})

describe('the calculator\'s template lines', () => {
  it('entrance and meal pricers say what their rate was entered in', () => {
    const fee = priceEntranceLine([{ id: 'f', attraction_name: 'Karnak', eur_rate: 10, non_eur_rate: 10, rate_currency: 'EGP', is_active: true }], { serviceName: 'Karnak', numPax: 2, isEurPassport: true, rateSym: '€' })
    expect(fee).toMatchObject({ unitCost: 10, enteredCurrency: 'EGP' })
    const meal = priceMealLine([{ id: 'm', restaurant_name: 'Deck', meal_type: 'lunch', tier: 'standard', base_rate_eur: 8, rate_currency: 'EGP', is_active: true }], { serviceName: 'Lunch', tier: 'standard', numPax: 2, rateSym: '€' })
    expect(meal?.enteredCurrency).toBe('EGP')
  })

  it('both calculator paths and the website order put the fields on the snapshot', () => {
    const calc = readFileSync('app/api/b2b/calculate-price/route.ts', 'utf8')
    expect(calc.match(/snapshotPaidFields\(s\.enteredCurrency, s\.enteredFx\)/g)).toHaveLength(2)
    expect(calc).toContain('...snapshotPaidFields(enteredCurrency, enteredCurrency ? await serviceNormalizer.fxFor(enteredCurrency) : null)')
    expect(readFileSync('lib/intake/process-order.ts', 'utf8')).toContain('...snapshotPaidFields(s.enteredCurrency, s.enteredFx)')
  })
})

describe('a quote becomes a trip', () => {
  const opts = { dayId: 'd1', pax: 2, marginPercent: 0, currency: 'EUR' }

  it('a calculator quote line from an EGP guide: €30 on the trip, paid EGP 1,500', () => {
    const row = serviceLineForItinerary(
      { service_name: 'Guide', service_category: 'guide', quantity: 1, quantity_mode: 'fixed', unit_cost: 30, line_total: 30, paid_currency: 'EGP', paid_fx: 0.02 },
      opts,
    )
    expect(row).toMatchObject({ total_cost: 30, paid_currency: 'EGP', paid_amount: 1500, paid_rate: 0.02 })
  })

  it('a website order line in yen keeps it too: ¥4,500 on the trip, paid EGP 1,500', () => {
    const [line] = linesInWebsiteCurrency(
      [{ service_name: 'Guide', service_category: 'guide', quantity: 1, quantity_mode: 'fixed', unit_cost: 30, line_total: 30, paid_currency: 'EGP', paid_fx: 0.02 }],
      'EUR', 150,
    )
    const row = serviceLineForItinerary(line, { ...opts, currency: 'JPY' })
    expect(row).toMatchObject({ total_cost: 4500, supplier_currency: 'EUR', paid_currency: 'EGP', paid_amount: 1500 })
    expect(row.paid_rate).toBeCloseTo(3, 10)
  })

  it('a line without them has no paid currency', () => {
    const row = serviceLineForItinerary({ service_name: 'Hotel', service_category: 'accommodation', quantity: 1, quantity_mode: 'fixed', unit_cost: 80, line_total: 80 }, opts)
    expect(row).toMatchObject({ paid_currency: null, paid_amount: null, paid_rate: null })
  })
})

describe('every money-bearing rate read on the B2B side is converted', () => {
  const RATE_TABLES = [
    'transportation_rates', 'accommodation_rates', 'guide_rates', 'entrance_fees', 'activity_rates', 'meal_rates',
    'airport_staff_rates', 'hotel_staff_rates', 'nile_cruises', 'b2b_transport_packages', 'tipping_rates',
    'flight_rates', 'train_rates', 'sleeping_train_rates',
  ]
  for (const file of ['lib/auto-pricing-service.ts', 'app/api/b2b/quote-from-itinerary/route.ts', 'app/api/b2b/calculate-price/route.ts']) {
    it(file, () => {
      const src = readFileSync(file, 'utf8')
      const unconverted: string[] = []
      for (const m of src.matchAll(/\.from\('([a-z_]+)'\)\s*\.select\(([`'])([^`']*)\2/g)) {
        if (!RATE_TABLES.includes(m[1])) continue
        if (!/\*|rate|cost|price|vehicles|seasons/.test(m[3])) continue
        if (!/normaliz/.test(src.slice(m.index!, m.index! + 3000))) unconverted.push(`${m[1]} at line ${src.slice(0, m.index!).split('\n').length}`)
      }
      expect(unconverted).toEqual([])
    })
  }
})
