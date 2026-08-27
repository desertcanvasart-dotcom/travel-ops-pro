import { describe, it, expect } from 'vitest'
import { createRateNormalizer, RATE_MONETARY_COLUMNS } from '@/lib/rates/rate-currency'
import type { ExchangeRates } from '@/lib/currency-service'

// USD run currency; 1 USD = 50 EGP, 1 USD = 150 JPY — the worked example from
// docs/plans/per-rate-currency.md.
const RATES: ExchangeRates = {
  base: 'USD',
  rates: { USD: 1, EGP: 50, JPY: 150, EUR: 0.9, GBP: 0.8 },
  timestamp: 0,
} as unknown as ExchangeRates

const usd = (overrides?: Partial<Parameters<typeof createRateNormalizer>[1]>) =>
  createRateNormalizer('USD', { getRates: async () => RATES, ...overrides })

describe('createRateNormalizer', () => {
  it('returns the SAME array when no row sets a currency — the pre-migration world', async () => {
    const rows = [{ id: 1, base_rate_eur: 100, rate_currency: null }]
    const n = usd({ getRates: async () => { throw new Error('must not be called') } })
    expect(await n.normalize('meal_rates', rows)).toBe(rows)
    expect(n.misses).toEqual([])
  })

  it('returns the same array when every currency equals the run currency', async () => {
    const rows = [{ id: 1, base_rate_eur: 100, rate_currency: 'USD' }]
    const n = usd({ getRates: async () => { throw new Error('must not be called') } })
    expect(await n.normalize('meal_rates', rows)).toBe(rows)
  })

  it('converts an EGP row into the run currency: 5000 EGP → $100', async () => {
    const rows = [{ id: 1, base_rate_eur: 5000, base_rate_non_eur: 3500, rate_currency: 'EGP' }]
    const [r] = (await usd().normalize('meal_rates', rows))!
    expect(r.base_rate_eur).toBe(100)
    expect(r.base_rate_non_eur).toBe(70)
    // The fetched row itself was not rewritten.
    expect(rows[0].base_rate_eur).toBe(5000)
  })

  it('converts a JPY flight and leaves EGP-and-USD rows each correct in one batch', async () => {
    const rows = [
      { id: 'jp', base_rate_eur: 48000, tax_eur: 3000, rate_currency: 'JPY' },
      { id: 'eg', base_rate_eur: 5000, tax_eur: null, rate_currency: 'EGP' },
      { id: 'us', base_rate_eur: 180, tax_eur: 20, rate_currency: null },
    ]
    const out = (await usd().normalize('flight_rates', rows))!
    expect(out[0].base_rate_eur).toBe(320)   // 48000 / 150
    expect(out[0].tax_eur).toBe(20)          // 3000 / 150
    expect(out[1].base_rate_eur).toBe(100)
    expect(out[1].tax_eur).toBeNull()        // blank stays blank — unpriced, not 0
    expect(out[2]).toBe(rows[2])             // untouched row passes through by reference
  })

  it('rounds to the run currency: JPY totals carry no decimals', async () => {
    // rates[X] = how many X per 1 base — so "1 EGP = 3.05 JPY" with base JPY
    // is rates.EGP = 1/3.05.
    const n = createRateNormalizer('JPY', { getRates: async () => ({
      base: 'JPY', rates: { JPY: 1, EGP: 1 / 3.05 }, timestamp: 0,
    } as unknown as ExchangeRates) })
    const [r] = (await n.normalize('tipping_rates', [{ id: 1, rate_eur: 100, rate_currency: 'EGP' }]))!
    expect(r.rate_eur).toBe(305)
    expect(Number.isInteger(r.rate_eur)).toBe(true)
  })

  it('converts activity tier bands, not just the base columns', async () => {
    const rows = [{
      id: 1, base_rate_eur: 500, rate_currency: 'EGP',
      tiers: [{ min_pax: 1, max_pax: 8, rate_eur: 500, rate_non_eur: 400, label: 'Small' }],
    }]
    const [r] = (await usd().normalize('activity_rates', rows))!
    expect(r.base_rate_eur).toBe(10)
    expect((r.tiers as Array<Record<string, unknown>>)[0].rate_eur).toBe(10)
    expect((r.tiers as Array<Record<string, unknown>>)[0].rate_non_eur).toBe(8)
    expect((r.tiers as Array<Record<string, unknown>>)[0].label).toBe('Small')
  })

  it('NEVER guesses: an unbackable pair neutralises the row into a missing rate', async () => {
    const noEgp = { base: 'USD', rates: { USD: 1, JPY: 150 }, timestamp: 0 } as unknown as ExchangeRates
    const n = createRateNormalizer('USD', { getRates: async () => noEgp })
    const [r] = (await n.normalize('guide_rates', [{ id: 'g1', base_rate_eur: 5000, base_rate_non_eur: 4000, rate_currency: 'EGP' }]))!
    expect(r.base_rate_eur).toBeNull()
    expect(r.base_rate_non_eur).toBeNull()
    expect(n.misses).toEqual([{ table: 'guide_rates', id: 'g1', currency: 'EGP' }])
  })

  it('an FX fetch failure neutralises rather than passing 50x-wrong numbers through', async () => {
    const n = createRateNormalizer('USD', { getRates: async () => { throw new Error('api down') } })
    const [r] = (await n.normalize('meal_rates', [{ id: 1, base_rate_eur: 5000, rate_currency: 'EGP' }]))!
    expect(r.base_rate_eur).toBeNull()
    expect(n.misses).toHaveLength(1)
  })

  it('an unknown currency code behaves as NULL — the org default, untouched', async () => {
    const rows = [{ id: 1, base_rate_eur: 100, rate_currency: 'BTC' }]
    const n = usd({ getRates: async () => { throw new Error('must not be called') } })
    expect(await n.normalize('meal_rates', rows)).toBe(rows)
  })

  it('converts hotel season rates AND the flat fallback — 5000 EGP/night → $100', async () => {
    const rows = [{
      id: 'h1', rate_currency: 'EGP',
      pp_double_eur: 5000, single_supp_eur: 1500, pp_double_non_eur: null,
      seasons: [
        { name: 'High', from: '2026-10-01', to: '2026-12-19', rates: { pp_double_eur: 6000, single_supp_eur: 2000 } },
        { name: 'Low', from: '2026-05-01', to: '2026-09-30', rates: { pp_double_eur: 5000, single_supp_eur: 1500 } },
      ],
    }]
    const [r] = (await usd().normalize('accommodation_rates', rows))!
    expect(r.pp_double_eur).toBe(100)
    expect(r.pp_double_non_eur).toBeNull()   // blank stays blank
    const seasons = r.seasons as Array<{ name: string; rates: Record<string, number> }>
    expect(seasons[0].rates.pp_double_eur).toBe(120)
    expect(seasons[0].rates.single_supp_eur).toBe(40)
    expect(seasons[0].name).toBe('High')      // period metadata untouched
    expect(seasons[1].rates.pp_double_eur).toBe(100)
    // stored row untouched
    expect((rows[0].seasons as Array<{ rates: Record<string, number> }>)[0].rates.pp_double_eur).toBe(6000)
  })

  it('converts cruise cabin rates in periods and legacy fallback columns', async () => {
    const rows = [{
      id: 'c1', rate_currency: 'EGP', rate_low_double_eur: 10000, rate_double_eur: 9000,
      seasons: [{ name: 'Peak', rates: { double_eur: 12500, suite_eur: 25000 } }],
    }]
    const [r] = (await usd().normalize('nile_cruises', rows))!
    expect(r.rate_low_double_eur).toBe(200)
    expect(r.rate_double_eur).toBe(180)
    const seasons = r.seasons as Array<{ rates: Record<string, number> }>
    expect(seasons[0].rates.double_eur).toBe(250)
    expect(seasons[0].rates.suite_eur).toBe(500)
  })

  it('converts a JPY cruise transport package', async () => {
    const rows = [{ id: 'p1', rate_currency: 'JPY', minivan_rate: 15000, bus_rate: 45000, sedan_rate: null }]
    const [r] = (await usd().normalize('b2b_transport_packages', rows))!
    expect(r.minivan_rate).toBe(100)
    expect(r.bus_rate).toBe(300)
    expect(r.sedan_rate).toBeNull()
  })

  it('an unbackable hotel row neutralises its seasons too — a hole, not a 50x price', async () => {
    const noEgp = { base: 'USD', rates: { USD: 1 }, timestamp: 0 } as unknown as ExchangeRates
    const n = createRateNormalizer('USD', { getRates: async () => noEgp })
    const [r] = (await n.normalize('accommodation_rates', [{ id: 'h1', rate_currency: 'EGP', pp_double_eur: 5000, seasons: [{ rates: { pp_double_eur: 6000 } }] }]))!
    expect(r.pp_double_eur).toBeNull()
    expect(r.seasons).toBeNull()
  })

  it('every declared monetary column ends in a price-like name, never a count', () => {
    // Guard against a capacity/duration/percentage sneaking into the map —
    // converting a capacity by 50x would be as wrong as not converting a price.
    for (const cols of Object.values(RATE_MONETARY_COLUMNS)) {
      for (const c of cols) {
        expect(c).toMatch(/rate|cost|fee|tax|pp_double|supp|red/)
        expect(c).not.toMatch(/capacity|duration|pax|percent|kg|minutes/)
      }
    }
  })
})
