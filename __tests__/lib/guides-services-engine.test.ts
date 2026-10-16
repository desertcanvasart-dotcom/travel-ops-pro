import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Rates audit, Guides & Services #5–#8, through the day-based engine:
// a guide is priced at the rate of the day's city and date (half a day when
// the trip says so), a meal at ONE restaurant's rate with its basis and
// minimum, an entrance fee only inside its validity period, and an add-on
// fee never from the day's wording.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const PARAMS = {
  orgId: 'org-1',
  templateId: TEMPLATE_ID,
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 25,
  travelDate: '2027-03-10',
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const guide = (over: Record<string, unknown>) => ({
  guide_language: 'english', guide_type: 'egyptologist', tour_duration: 'full_day', guide_mode: 'spot', is_active: true, ...over,
})

async function price(mutate: (t: any) => void, params: Record<string, unknown> = {}) {
  const t = fullRateTables() as any
  mutate(t)
  setMockTables(t)
  return calculateDayBasedPricing({ ...PARAMS, ...params })
}

const line = (r: any, id: string) => r.services.find((s: any) => s.id === id)
const totalAt = (r: any, pax: number) => r.paxPricing.find((p: any) => p.numPax === pax).withoutLeader.totalCost

describe('guides: the day\'s city and date (#5, #6)', () => {
  it('a Luxor rate listed first does not price a Cairo day', async () => {
    const r = await price(t => {
      t.guide_rates = [guide({ id: 'g-lxr', city: 'Luxor', base_rate_eur: 200 }), guide({ id: 'g-cai', city: 'Cairo', base_rate_eur: 75 })]
    })
    expect(line(r, 'day1-guide').unitCost).toBe(75)
  })

  it('a rate whose validity ended before the trip is not used; the one covering it is', async () => {
    const r = await price(t => {
      t.guide_rates = [
        guide({ id: 'g-old', city: 'Cairo', base_rate_eur: 60, rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31' }),
        guide({ id: 'g-new', city: 'Cairo', base_rate_eur: 90, rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' }),
      ]
    })
    expect(line(r, 'day1-guide').unitCost).toBe(90)
  })

  it('a half-day tour prices the half-day rate', async () => {
    const r = await price(t => {
      t.tour_templates[0].tour_type = 'half_day'
      t.guide_rates = [guide({ id: 'g-full', base_rate_eur: 75 }), guide({ id: 'g-half', tour_duration: 'half_day', base_rate_eur: 40 })]
    })
    expect(line(r, 'day1-guide').unitCost).toBe(40)
  })

  it('a half day with no half-day rate is priced at the full day, and says so', async () => {
    const r = await price(t => {
      t.tour_templates[0].tour_type = 'half_day'
      t.guide_rates = [guide({ id: 'g-full', base_rate_eur: 75 })]
    })
    expect(line(r, 'day1-guide').unitCost).toBe(75)
    expect(line(r, 'day1-guide').notes).toMatch(/no half-day rate/)
  })
})

describe('meals: one restaurant, its basis and minimum (#7)', () => {
  const meal = (over: Record<string, unknown>) => ({ tier: 'standard', meal_type: 'lunch', city: 'Cairo', is_active: true, per_person_rate: true, ...over })

  it('no averaging: the starred restaurant prices the lunch', async () => {
    const r = await price(t => {
      t.meal_rates = [meal({ id: 'm-a', restaurant_name: 'Alpha', base_rate_eur: 10 }), meal({ id: 'm-b', restaurant_name: 'Beta', base_rate_eur: 30, is_preferred: true })]
    })
    expect(line(r, 'day1-lunch').unitCost).toBe(30)
  })

  it('a per-group price is charged once, not per traveller', async () => {
    const r = await price(t => {
      t.meal_rates = [meal({ id: 'm-g', restaurant_name: 'Felucca Lunch', base_rate_eur: 300, per_person_rate: false })]
    })
    const l = line(r, 'day1-lunch')
    expect(l.quantityMode).toBe('fixed')
    expect(l.isPerPax).toBe(false)
    // The same 300 at 2 and at 10 travellers.
    const withoutMeal = await price(t => { t.meal_rates = [] })
    expect(totalAt(r, 2) - totalAt(withoutMeal, 2)).toBeCloseTo(300)
    expect(totalAt(r, 10) - totalAt(withoutMeal, 10)).toBeCloseTo(300)
  })

  it('a restaurant has no minimum group: a stored minimum_pax prices like none', async () => {
    const withMin = await price(t => { t.meal_rates = [meal({ id: 'm-min', restaurant_name: 'Nile Deck', base_rate_eur: 20, minimum_pax: 10 })] })
    const noMin = await price(t => { t.meal_rates = [meal({ id: 'm-min', restaurant_name: 'Nile Deck', base_rate_eur: 20, minimum_pax: 1 })] })
    expect(totalAt(withMin, 2)).toBeCloseTo(totalAt(noMin, 2))
    expect(totalAt(withMin, 12)).toBeCloseTo(totalAt(noMin, 12))
  })
})

describe('entrance fees: validity and add-ons (#5, #8)', () => {
  it('a fee outside its validity is not charged; the one covering the trip is', async () => {
    const r = await price(t => {
      t.entrance_fees = [
        { id: 'fee-old', attraction_name: 'Giza Plateau', is_active: true, eur_rate: 20, non_eur_rate: 20, rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31' },
        { id: 'fee-new', attraction_name: 'Giza Plateau', is_active: true, eur_rate: 25, non_eur_rate: 25, rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' },
      ]
    })
    expect(line(r, 'entrance-fee-new')?.unitCost).toBe(25)
    expect(line(r, 'entrance-fee-old')).toBeUndefined()
  })

  it('an add-on fee is not charged from the day\'s wording', async () => {
    const r = await price(t => {
      t.entrance_fees = [{ id: 'fee-addon', attraction_name: 'Giza Plateau Interior', is_active: true, is_addon: true, eur_rate: 50, non_eur_rate: 50 }]
    })
    expect(line(r, 'entrance-fee-addon')).toBeUndefined()
    expect(r.warnings.some((w: string) => w.includes('No entrance fee found for "Giza Plateau"'))).toBe(true)
  })
})
