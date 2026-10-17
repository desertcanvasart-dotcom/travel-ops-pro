import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rowsInRateCurrency } from '@/lib/rates/rows-in-rate-currency'
import { getApiUrl, normalizeRates } from '@/components/ServiceRatePicker'
import { RATE_TABLE_CONFIGS, validateImportData } from '@/lib/bulk-rate-service'

// Rates audit, Guides & Services: the pickers that copy a rate onto a voucher
// or a trip (#1), the pages' lists and form (#6, #10, #12, #15) and the guide
// CSV (#16).

const src = (p: string) => readFileSync(p, 'utf8')
// 1 USD = 50 EGP; no JPY rate.
const fx = async () => ({ base: 'USD', date: '2027-01-01', rates: { USD: 1, EGP: 50 } })

describe('picker rows in the company rate currency (#1)', () => {
  it('a 600 EGP row in a USD company is about $12, not $600', async () => {
    const [row] = await rowsInRateCurrency('meal_rates', [{ id: 'm', base_rate_eur: 600, base_rate_non_eur: 600, rate_currency: 'EGP' }], 'USD', { getRates: fx })
    expect(row).toMatchObject({ base_rate_eur: 12, rate_currency: 'USD', entered_currency: 'EGP' })
    expect(row.rate_unconvertible).toBeUndefined()
  })

  it('a row no rate can convert has no price and says so', async () => {
    const [row] = await rowsInRateCurrency('guide_rates', [{ id: 'g', base_rate_eur: 9000, rate_currency: 'JPY' }], 'USD', { getRates: fx })
    expect(row).toMatchObject({ base_rate_eur: null, rate_unconvertible: true })
  })

  it("a row on the company's currency passes as it is", async () => {
    const [row] = await rowsInRateCurrency('entrance_fees', [{ id: 'f', eur_rate: 20, rate_currency: null }], 'USD', { getRates: fx })
    expect(row).toMatchObject({ eur_rate: 20, rate_currency: 'USD', entered_currency: null })
  })

  it("the itinerary's rate picker asks for converted rows and drops unconvertible ones", () => {
    for (const t of ['meal', 'guide', 'entrance', 'activity']) expect(getApiUrl(t)).toContain('in_rate_currency=true')
    const rates = normalizeRates('guide', [
      { id: 'a', guide_language: 'Japanese', base_rate_eur: 30 },
      { id: 'b', guide_language: 'Japanese', base_rate_eur: null, rate_unconvertible: true },
    ], 2)
    expect(rates.map(r => r.id)).toEqual(['a'])
    expect(normalizeRates('meal', [{ id: 'm', restaurant_name: 'Deck', base_rate_eur: 300, per_person_rate: false }], 2)[0].details).toContain('per group')
  })

  it("the supplier voucher editor reads converted meal, guide and attraction rows, and a meal's basis", () => {
    const page = src('app/documents/supplier/[id]/edit/page.tsx')
    expect(page).toContain("/api/rates/meals?active_only=true&in_rate_currency=true")
    expect(page).toContain("/api/rates/guides?active_only=true&in_rate_currency=true")
    expect(page).toContain("/api/rates/attractions?active_only=true&in_rate_currency=true")
    expect(page).toContain('mealVoucherQuantity(rate, totalPax)')
    expect(page).not.toMatch(/total_cost: unitRate \* totalPax/)
  })
})

describe('the rate pages', () => {
  it('Guides, Meals and Activities load every rate; Show inactive filters on the page (#10)', () => {
    for (const [p, api] of [
      ['app/rates/guides/guide-rates-content.tsx', 'guides'],
      ['app/rates/meals/meal-rates-content.tsx', 'meals'],
      ['app/rates/activities/activity-rates-content.tsx', 'activities'],
    ]) {
      const s = src(p)
      expect(s).toContain(`fetch('/api/rates/${api}')`)
      expect(s).not.toContain("params.append('active_only', 'true')")
      expect(s).toContain('showInactive || rate.is_active')
    }
  })

  it('the activity tiles count a tiered rate as per person, so they add up to Total (#15)', () => {
    expect(src('app/rates/activities/activity-rates-content.tsx')).toMatch(/perPersonRates = rates\.filter\(r => r\.pricing_type === 'per_person' \|\| r\.pricing_type === 'tiered'/)
  })

  it('the attraction form no longer offers child or student discounts nothing reads (#12)', () => {
    const s = src('app/rates/attractions/attractions-content.tsx')
    expect(s).not.toContain('name="child_discount_percent"')
    expect(s).not.toContain('name="student_discount_percentage"')
  })

  it('the guide form says which durations are priced (#6)', () => {
    expect(src('app/rates/guides/guide-rates-content.tsx')).toContain("t('form.durationHint')")
    for (const lang of ['en', 'ja']) {
      const m = JSON.parse(src(`messages/${lang}.json`))
      expect(m.rates.guides.form.durationHint).toBeTruthy()
    }
  })
})

describe('guide CSV: the guide mode is a key (#16)', () => {
  it('"Throughout" in a sheet imports as throughout', () => {
    const preview = validateImportData([
      { service_code: 'GD-1', guide_language: 'Japanese', guide_type: 'egyptologist', tour_duration: 'full_day', guide_mode: 'Throughout', base_rate_eur: '100' },
    ], RATE_TABLE_CONFIGS.guide_rates)
    expect(preview.errors).toEqual([])
    expect(preview.parsedValidRows?.[0]).toMatchObject({ guide_language: 'japanese', guide_mode: 'throughout' })
  })
})
