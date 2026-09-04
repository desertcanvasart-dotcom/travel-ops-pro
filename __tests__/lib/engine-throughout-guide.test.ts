import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Guide grades and the throughout ("+1") guide — operator decisions 2026-09-04:
// two grades (egyptologist / senior); throughout = one guide day 1 to the end,
// full fee on sightseeing days and the meet/assist rate otherwise, his bed at
// each property's period guide_rate (blank = hole, never free), meals charged
// for groups of 3 or fewer, one extra seat in the vehicle. Spot mode and the
// default grade must price byte-for-byte as before.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const BASE = {
  templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false,
  language: 'English', marginPercent: 0, numPax: 2, travelDate: '2026-11-03',
}

const gradedGuideRates = () => [
  { id: 'g-full', guide_language: 'English', guide_type: 'egyptologist', tour_duration: 'full_day', is_active: true, base_rate_eur: 75, rate_eur: 75 },
  { id: 'g-meet', guide_language: 'English', guide_type: 'egyptologist', tour_duration: 'meet_greet', is_active: true, base_rate_eur: 25, rate_eur: 25 },
  { id: 'g-senior', guide_language: 'English', guide_type: 'senior', tour_duration: 'full_day', is_active: true, base_rate_eur: 120, rate_eur: 120 },
]

const seasonedHotel = (guideRate: number) => {
  const t = fullRateTables() as any
  t.guide_rates = gradedGuideRates()
  t.accommodation_rates[0].seasons = [{
    name: 'All year', from: '2026-01-01', to: '2026-12-31',
    rates: {
      pp_double_eur: 85, single_supp_eur: 45, triple_red_eur: 0,
      pp_double_non_eur: 95, single_supp_non_eur: 50, triple_red_non_eur: 0,
      guide_rate: guideRate,
    },
  }]
  return t
}

const line = (r: any, id: string) => (r.services ?? []).find((s: any) => s.id === id)
const guideHoles = (r: any) => (r.holes ?? []).filter((h: any) => h.kind === 'guide')

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('spot mode (the default) is untouched', () => {
  it('prices exactly as before: one guide line on the sightseeing day, nothing new', async () => {
    setMockTables(seasonedHotel(40))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day1-guide')).toMatchObject({ serviceName: 'English Speaking Guide', unitCost: 75 })
    expect(line(r, 'day2-guide')).toBeUndefined()
    expect(line(r, 'day1-guide-bed')).toBeUndefined()
    expect(line(r, 'day1-guide-lunch')).toBeUndefined()
    expect(guideHoles(r)).toEqual([])
  })

  it('legacy rows without a grade still price the default ask (fallback)', async () => {
    // fullRateTables' guide row has no guide_type/tour_duration at all.
    setMockTables(fullRateTables())
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day1-guide')).toMatchObject({ unitCost: 75 })
  })
})

describe('throughout mode ("+1")', () => {
  it('bills every day — full rate with sightseeing, meet/assist without — and the bed at the period guide_rate', async () => {
    setMockTables(seasonedHotel(40))
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day1-guide')).toMatchObject({ serviceName: 'Throughout Guide — English', unitCost: 75, isPerPax: false })
    expect(line(r, 'day2-guide')).toMatchObject({ serviceName: 'Throughout Guide — English (meet/assist day)', unitCost: 25 })
    expect(line(r, 'day1-guide-bed')).toMatchObject({ serviceName: 'Throughout Guide — bed (Cairo Standard Hotel)', unitCost: 40, isPerPax: false })
    expect(guideHoles(r)).toEqual([])
  })

  it('a property with no guide_rate on its period is a HOLE, never a free bed', async () => {
    setMockTables(seasonedHotel(0))
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day1-guide-bed')).toBeUndefined()
    const holes = guideHoles(r)
    expect(holes.some((h: any) => h.reason === 'unpriced' && /guide bed/i.test(h.message))).toBe(true)
    expect(r.complete).toBe(false)
  })

  it('a missing meet/assist rate is a HOLE naming the duration to add', async () => {
    const t = seasonedHotel(40)
    t.guide_rates = t.guide_rates.filter((g: any) => g.tour_duration !== 'meet_greet')
    setMockTables(t)
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day2-guide')).toBeUndefined()
    expect(guideHoles(r).some((h: any) => /meet\/assist/i.test(h.message))).toBe(true)
  })

  it("3 or fewer pax pay the guide's meals at the group rate; 4+ eat him free", async () => {
    setMockTables(seasonedHotel(40))
    const small = await calculateAutoPricing({ ...BASE, numPax: 3, guideMode: 'throughout' })
    // Day 1 lunch is external at 30 (standard tier) — the guide's plate is a fixed line.
    expect(line(small, 'day1-guide-lunch')).toMatchObject({ unitCost: 30, isPerPax: false })

    setMockTables(seasonedHotel(40))
    const big = await calculateAutoPricing({ ...BASE, numPax: 4, guideMode: 'throughout' })
    expect(line(big, 'day1-guide-lunch')).toBeUndefined()
  })

  it('throughout costs more than spot for the same trip', async () => {
    setMockTables(seasonedHotel(40))
    const spot = await calculateAutoPricing(BASE)
    setMockTables(seasonedHotel(40))
    const thr = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(thr.totalCost).toBeGreaterThan(spot.totalCost)
  })
})

describe('guide grades', () => {
  it('the senior grade prices from the senior row', async () => {
    setMockTables(seasonedHotel(40))
    const r = await calculateAutoPricing({ ...BASE, guideGrade: 'senior' })
    expect(line(r, 'day1-guide')).toMatchObject({ unitCost: 120 })
  })

  it('a senior ask with no senior row is a HOLE — never silently the ordinary rate', async () => {
    const t = seasonedHotel(40)
    t.guide_rates = t.guide_rates.filter((g: any) => g.guide_type !== 'senior')
    setMockTables(t)
    const r = await calculateAutoPricing({ ...BASE, guideGrade: 'senior' })
    expect(line(r, 'day1-guide')).toBeUndefined()
    expect(guideHoles(r).some((h: any) => /guide_type=senior/.test(h.lookupAttempted))).toBe(true)
  })
})

import { calculateAgeBasedPricing } from '@/lib/auto-pricing-service'

describe('throughout guide on flights (+1 seat)', () => {
  const pax = { numAdults: 2, numChildren: 0, numInfants: 0 }

  it('adds one seat at the guide fare when given', () => {
    const r = calculateAgeBasedPricing(100, pax, 0, 200, 'USD', { seats: 1, farePerSeat: 120 })
    expect(r.flightTotal).toBe(200 * 2 + 120)
    expect(r.breakdown.find(b => b.category === 'Throughout Guide — flights')).toMatchObject({ count: 1, rate: 120 })
  })

  it('falls back to the customer fare when no guide fare is entered (a ticket always has a public price)', () => {
    const r = calculateAgeBasedPricing(100, pax, 0, 200, 'USD', { seats: 1, farePerSeat: null })
    expect(r.flightTotal).toBe(200 * 3)
    expect(r.breakdown.find(b => b.category === 'Throughout Guide — flights')?.note).toMatch(/Customer fare/)
  })

  it('without a guide, flight math is untouched', () => {
    const r = calculateAgeBasedPricing(100, pax, 0, 200, 'USD')
    expect(r.flightTotal).toBe(400)
    expect(r.breakdown.some(b => /Throughout/.test(b.category))).toBe(false)
  })
})
