// One meal price, several meals (20270119, ported from autoura-saas #821).
//
// Old against new: a price with no further meals picks exactly as before;
// only a price that is given a second meal answers that meal too.
import { describe, it, expect } from 'vitest'
import {
  mealTypesOf, rateServesMeal, rateMealMatches, mealRateLists,
  mealOptionId, mealRateRowId, perMealEntries,
} from '@/lib/meals/meal-rate-meals'
import { pickMealRate } from '@/lib/pricing/service-rates'
import { priceMealLine } from '@/lib/b2b/variation-service-rates'
import { RATE_TABLE_CONFIGS, validateImportData } from '@/lib/bulk-rate-service'

const row = (over: Record<string, unknown>) => ({
  id: 'r1', restaurant_name: 'Nile Terrace', city: 'Luxor', tier: 'standard',
  meal_type: 'lunch', other_meal_types: [], base_rate_eur: 20, is_active: true, ...over,
})

// The rule before this change (lib/pricing/service-rates, until 20270119).
const oldServes = (r: { meal_type?: string | null }, meal: string) => (r.meal_type ?? '').toLowerCase() === meal

describe('which meals a price covers', () => {
  it('lists the first meal, then the others, without blanks or repeats', () => {
    expect(mealTypesOf({ meal_type: 'lunch', other_meal_types: ['dinner', ' Lunch ', ''] })).toEqual(['lunch', 'dinner'])
    expect(mealTypesOf({ meal_type: null, other_meal_types: null })).toEqual([])
  })

  it('serves a meal named first or among the others; the match stays exact', () => {
    const r = { meal_type: 'lunch', other_meal_types: ['dinner'] }
    expect(rateServesMeal(r, 'lunch')).toBe(true)
    expect(rateServesMeal(r, 'Dinner')).toBe(true)
    expect(rateServesMeal(r, 'breakfast')).toBe(false)
    // "set_lunch" is not "lunch", as before.
    expect(rateServesMeal({ meal_type: 'set_lunch' }, 'lunch')).toBe(false)
    expect(rateMealMatches(r, /dinner/i)).toBe(true)
  })

  it('agrees with the old rule on every price with one meal', () => {
    for (const m of ['lunch', 'dinner', 'Lunch', 'breakfast', 'set_lunch', '', null]) {
      for (const ask of ['lunch', 'dinner', 'breakfast']) {
        expect(rateServesMeal({ meal_type: m, other_meal_types: [] }, ask)).toBe(oldServes({ meal_type: m }, ask))
      }
    }
  })

  it('reads a form body into the stored shape', () => {
    expect(mealRateLists({ meal_type: 'lunch', other_meal_types: ['dinner', 'lunch'] })).toEqual({ meal_type: 'lunch', other_meal_types: ['dinner'] })
    // No first meal, no others (the column's check).
    expect(mealRateLists({ meal_type: '', other_meal_types: ['dinner'] })).toEqual({ meal_type: null, other_meal_types: [] })
  })
})

describe('the engine picks a several-meal price', () => {
  const lunchOnly = row({ id: 'a', restaurant_name: 'A', base_rate_eur: 18 })
  const both = row({ id: 'b', restaurant_name: 'B', base_rate_eur: 25, other_meal_types: ['dinner'] })
  const dinnerOnly = row({ id: 'c', restaurant_name: 'C', meal_type: 'dinner', base_rate_eur: 30 })

  it('single-meal prices: the same pick as before', () => {
    const rows = [lunchOnly, dinnerOnly]
    expect(pickMealRate(rows, { mealType: 'lunch', city: 'Luxor' })?.row.id).toBe('a')
    expect(pickMealRate(rows, { mealType: 'dinner', city: 'Luxor' })?.row.id).toBe('c')
  })

  it('a lunch price that also covers dinner answers a dinner with no dinner row', () => {
    // Before: no dinner price at all (a hole). Now: B's price.
    expect(pickMealRate([lunchOnly, both], { mealType: 'dinner', city: 'Luxor' })).toMatchObject({ rate: 25, row: { id: 'b' } })
  })

  it('competes with dinner rows by the usual order (name, here)', () => {
    expect(pickMealRate([both, dinnerOnly], { mealType: 'dinner', city: 'Luxor' })?.row.id).toBe('b')
  })

  it('a grid entry for the further meal names the row', () => {
    expect(pickMealRate([both], { mealType: 'dinner', rateId: 'b~dinner' })).toMatchObject({ rate: 25 })
    expect(priceMealLine([both], { serviceName: 'Dinner', rateId: 'b~dinner', tier: 'standard', numPax: 2, rateSym: '€' })).toMatchObject({ unitCost: 25, lineTotal: 50 })
  })
})

describe('the pricing grid lists a price once per meal', () => {
  it('the first meal keeps the row id; a further meal is <id>~<meal>', () => {
    const entries = perMealEntries(row({ id: 'x', other_meal_types: ['dinner'] }))
    expect(entries.map(e => [e.id, e.meal_type])).toEqual([['x', 'lunch'], ['x~dinner', 'dinner']])
    expect(mealOptionId('x', 'dinner', 1)).toBe('x~dinner')
    expect(mealRateRowId('x~dinner')).toBe('x')
    expect(mealRateRowId('x')).toBe('x')
  })

  it('a single-meal price is one entry, unchanged', () => {
    const r = row({ id: 'y' })
    expect(perMealEntries(r)).toEqual([r])
  })
})

describe('CSV: Other Meal Types', () => {
  const cfg = RATE_TABLE_CONFIGS.meal_rates
  const base = { restaurant_name: 'Nile Terrace', base_rate_eur: '20', meal_type: 'lunch' }

  it('reads "Dinner; Breakfast" as keys', () => {
    const out = validateImportData([{ ...base, other_meal_types: 'Dinner; Breakfast, dinner' }], cfg)
    expect(out.errors).toEqual([])
    expect(out.parsedValidRows![0].other_meal_types).toEqual(['dinner', 'breakfast'])
  })

  it('a blank cell leaves the stored list alone (not written)', () => {
    const out = validateImportData([{ ...base, other_meal_types: '' }], cfg)
    expect('other_meal_types' in out.parsedValidRows![0]).toBe(false)
  })
})
