// The pricing grid after the Sell audit:
//   - figures are converted FROM the org's rate currency TO the one shown, and
//     a currency with no rate is not shown under a stale factor (display-fx);
//   - every pick is rebuilt from the rate it names, at the group's size
//     (hydrate-items): parsed, reloaded and tier-swapped items get their
//     periods, guide bed and non-EU price back; a vehicle follows the group;
//     a pick with no rate has no price;
//   - water is EUR 0.50 converted into the rate currency, or no price;
//   - the parse sizes vehicles for the group the text names.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

vi.mock('@/lib/vocabulary-server', () => ({ vocabularyItemsForCurrentOrg: vi.fn(async () => []) }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({}) }))

import { displayFx, shownSymbol } from '@/app/pricing-grid/lib/display-fx'
import { hydrateDays } from '@/app/pricing-grid/lib/hydrate-items'
import { calculateDay, convertAmount } from '@/app/pricing-grid/lib/calculator'
import { waterOption } from '@/app/api/pricing-grid/rate-options'
import type { ExchangeRates } from '@/lib/currency-service'
import type { GridConfig, GridDay, SlotValue } from '@/app/pricing-grid/types'

// EUR-based, as the run rates are: 1 EUR = 1.08 USD = 162 JPY. No EGP.
const RATES: ExchangeRates = { base: 'EUR', date: '2026-10-01', rates: { EUR: 1, USD: 1.08, JPY: 162 } }

describe('display currency (displayFx)', () => {
  it('converts rate currency → shown currency: $100 shows as ¥15,000, not 100 × EUR→JPY', () => {
    const fx = displayFx('USD', 'JPY', RATES)
    expect(fx.shown).toBe('JPY')
    expect(fx.missing).toBe(false)
    expect(convertAmount(100, fx.factor)).toBe(15000)
  })

  it('shows the rate currency as is', () => {
    expect(displayFx('USD', 'USD', RATES)).toEqual({ factor: null, shown: 'USD', missing: false })
    expect(convertAmount(100, null)).toBe(100)
  })

  it('a currency with no rate keeps the figures in the rate currency, labelled so, and says so', () => {
    const fx = displayFx('USD', 'EGP', RATES)
    expect(fx).toEqual({ factor: null, shown: 'USD', missing: true })
    expect(shownSymbol({ currency: 'EGP', shownCurrency: fx.shown })).toBe('$')
  })

  it('no rate currency known: no conversion and no currency sign', () => {
    expect(displayFx(null, 'JPY', RATES)).toEqual({ factor: null, shown: null, missing: true })
    expect(shownSymbol({ currency: 'JPY', shownCurrency: null })).toBe('')
  })
})

const slot = (slotId: string, selectedItems: any[], customAmount = 0): SlotValue => ({ slotId, selectedItems, customAmount })
const day = (slots: SlotValue[], dayNumber = 1): GridDay => ({ id: `d${dayNumber}`, dayNumber, title: '', city: 'Cairo', description: '', isExpanded: false, slots })
const cfg = (over: Partial<GridConfig> = {}): GridConfig => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c', withGuide: true, guideMode: 'spot',
  currency: 'USD', marginPercent: 0, exchangeRate: null, startDate: '2026-12-10', clientName: '', clientEmail: '',
  clientPhone: '', tourName: '', nationality: '', itineraryId: null, itineraryCode: null, partnerId: null, partnerName: '',
  ...over,
})

const PERIODS = [
  { name: 'Summer', from: '2026-06-01', to: '2026-09-30', rateEur: 100, rateNonEur: 110 },
  { name: 'Winter', from: '2026-12-01', to: '2027-01-31', rateEur: 150, rateNonEur: 160 },
]
const RATE_LIST = {
  guide: [{ id: 'g1', name: 'English (Egyptologist)', rateEur: 80, rateNonEur: 95 }],
  accommodation: [
    { id: 'h1', name: 'Mena House Cairo', rateEur: 100, rateNonEur: 110, periods: PERIODS, guide_rate: 40,
      single_supp_eur: 50, single_supp_non_eur: 55, supplements: [{ key: 'view', name: 'Pyramid View', rateEur: 20, rateNonEur: 25 }] },
  ],
  route: [
    { id: 'r1__sedan', name: 'Sedan (1-3 pax) — Cairo Day Tour', rateEur: 50, rateNonEur: 50, capacity_min: 1, capacity_max: 3 },
    { id: 'r1__van', name: 'Van (4-7 pax) — Cairo Day Tour', rateEur: 90, rateNonEur: 90, capacity_min: 4, capacity_max: 7 },
    { id: 'r1__minibus', name: 'Minibus (8-14 pax) — Cairo Day Tour', rateEur: 200, rateNonEur: 200, capacity_min: 8, capacity_max: 14 },
  ],
}

describe('every pick rebuilt from its rate (hydrateDays)', () => {
  it('a parsed guide sold to non-EU travellers takes the non-EU price, not the EU price the parse sent', () => {
    const parsed = [day([slot('guide', [{ rateId: 'g1', name: 'English Guide', rateEur: 80, rateNonEur: 80 }])])]
    const [d] = hydrateDays(parsed, RATE_LIST as never, 2).days
    expect(d.slots[0].selectedItems[0]).toMatchObject({ rateNonEur: 95, name: 'English (Egyptologist)' })
    expect(calculateDay(d, cfg()).groupTotal).toBe(95)
  })

  it('a parsed or reloaded hotel gets its dated periods and the guide bed back', () => {
    const thin = [day([slot('accommodation', [{ rateId: 'h1', name: 'Mena', rateEur: 100, rateNonEur: 110 }])])]
    const [d] = hydrateDays(thin, RATE_LIST as never, 2).days
    expect(d.slots[0].selectedItems[0]).toMatchObject({ guideRate: 40, periods: PERIODS })
    // 10 December is in the Winter period, not the first (base) one.
    expect(calculateDay(d, cfg()).perPersonTotal).toBe(160)
    expect(calculateDay(d, cfg({ guideMode: 'throughout' })).groupTotal).toBe(40)
  })

  it('a reloaded single supplement and agency supplement take their own prices and key', () => {
    const reloaded = [day([slot('accommodation', [
      { rateId: 'h1', name: 'Mena', rateEur: 1, rateNonEur: 1 },
      { rateId: 'h1_supp', name: 'Single Supplement', rateEur: 1, rateNonEur: 1 },
      { rateId: 'h1#supp:view', name: 'Pyramid View (supplement)', rateEur: 1, rateNonEur: 1 },
    ])])]
    const items = hydrateDays(reloaded, RATE_LIST as never, 1).days[0].slots[0].selectedItems
    expect(items[1]).toMatchObject({ rateEur: 50, rateNonEur: 55 })
    expect(items[2]).toMatchObject({ rateNonEur: 25, supplementKey: 'view' })
  })

  it('the vehicle follows the group: a route picked at 2 is the minibus at 10', () => {
    const picked = [day([slot('route', [{ rateId: 'r1__sedan', name: 'Sedan (1-3 pax) — Cairo Day Tour', rateEur: 50, rateNonEur: 50 }])])]
    const [d] = hydrateDays(picked, RATE_LIST as never, 10).days
    expect(d.slots[0].selectedItems[0]).toMatchObject({ rateId: 'r1__minibus', rateNonEur: 200 })
    expect(calculateDay(d, cfg({ pax: 10 })).groupTotal).toBe(200)
  })

  it('a pick with no rate behind it has no price, and is reported — never the price it came with', () => {
    const stale = [day([slot('guide', [{ rateId: 'gone', name: 'Old Guide', rateEur: 75, rateNonEur: 75 }])], 3)]
    const { days, unpriced } = hydrateDays(stale, RATE_LIST as never, 2)
    expect(days[0].slots[0].selectedItems[0]).toMatchObject({ rateEur: 0, rateNonEur: 0 })
    expect(unpriced).toEqual([{ dayNumber: 3, slotId: 'guide', rateId: 'gone', name: 'Old Guide' }])
  })

  it('returns the same days when nothing changes (the page can skip the update)', () => {
    const once = hydrateDays([day([slot('guide', [{ rateId: 'g1', name: 'x', rateEur: 1, rateNonEur: 1 }])])], RATE_LIST as never, 2).days
    expect(hydrateDays(once, RATE_LIST as never, 2).days).toBe(once)
  })
})

describe('water (waterOption)', () => {
  it('is EUR 0.50 converted into the rate currency', async () => {
    expect((await waterOption('EUR')).rateNonEur).toBe(0.5)
    expect((await waterOption('JPY', async () => RATES)).rateNonEur).toBe(81)
  })
  it('with no rate to convert it, it has no price and says so', async () => {
    const w = await waterOption('EGP', async () => RATES)
    expect(w.rateNonEur).toBe(0)
    expect(w.details).toMatch(/no EUR→EGP exchange rate/)
  })
})

describe('the AI parse (app/api/pricing-grid/parse)', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/pricing-grid/parse/route.ts'), 'utf8')
  it('sizes vehicles for the group the text names, not the pax it was sent', () => {
    expect(src).toContain('const groupSize = metaPax > 0 ? metaPax : (Number(pax) || 2)')
    expect(src).not.toContain('tieredIdFor(depTransfer, pax || 2)')
    expect(src).not.toContain('tieredIdFor(pkg, pax || 2)')
    expect(src).not.toContain('const paxNum = pax || 2')
  })
  it('reports the non-EU prices the rates list uses', () => {
    expect(src).toContain('rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur)')
    expect(src).toContain('rateNonEur: toNum(r.rate_double_non_eur || r.rate_low_double_non_eur')
    expect(src).toContain('rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur) + toNum(r.tax_non_eur || r.tax_eur)')
  })
  it('the page re-prices parsed picks from the rates list at the parsed group size', () => {
    const page = readFileSync(join(process.cwd(), 'app/pricing-grid/page.tsx'), 'utf8')
    expect(page).toContain('hydrateDays(parsedDays, rates, groupSize)')
  })
})

describe('the margin a reset goes back to', () => {
  const header = readFileSync(join(process.cwd(), 'app/pricing-grid/components/GridHeader.tsx'), 'utf8')
  const page = readFileSync(join(process.cwd(), 'app/pricing-grid/page.tsx'), 'utf8')
  it("is the company's default, not a hard-coded 25 / 10", () => {
    expect(header).not.toMatch(/b2b:\s*10,\s*\n\s*b2c:\s*25/)
    expect(header).toContain('marginPercent: defaultMargin,')
    expect(header).toContain('partner.default_margin_percent ?? defaultMargin')
    expect(page).toContain('setConfig({ ...DEFAULT_CONFIG, marginPercent: defaultMargin })')
    expect(page).toContain('defaultMargin={defaultMargin}')
  })
  it('the inbox’s client id travels to the save', () => {
    expect(page).toContain("const clientIdParam = searchParams?.get('clientId')")
    expect(page).toContain('clientId: itn.client_id || null')
  })
})
