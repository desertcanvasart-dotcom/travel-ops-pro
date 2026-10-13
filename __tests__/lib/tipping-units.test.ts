// Rates › Tipping offers five Rate Units — per day, per service, per cruise,
// per night, per person — and the engine used to price per_day rows only: a
// per-service porter tip or a per-cruise crew tip was saved, shown, and never
// charged. The Pricing Grid ignored the unit the other way: a per-person tip
// of 5 was charged 5 for the whole group. Tips were also rounded to whole
// units (2.50 → 3), and a blank Service Code made the same code for two
// cities (the second save a 500).
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  buildRatesObject, getItemizedTippingRates, getDailyTippingRate, itemizeTipRows, priceTip,
  tipGridOption, tipServiceCode,
} from '@/lib/tipping-utils'
import { calculateDay } from '@/app/pricing-grid/lib/calculator'
import type { GridConfig, GridDay, SelectedItem, SlotValue } from '@/app/pricing-grid/types'

type Row = { role_type: string; context?: string | null; city?: string | null; rate_eur: number; rate_unit: string }

const supabaseWith = (rows: Row[]) => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }),
})

describe('priceTip: every Rate Unit the page offers is priced', () => {
  it('per_day: once that day, however many services', () => {
    expect(priceTip({ rate_eur: 10, rate_unit: 'per_day' }, { quantity: 2 })).toEqual({ unitCost: 10, quantity: 1, total: 10, perPax: false })
  })
  it('per_service: once per service (two airports = two porter tips)', () => {
    expect(priceTip({ rate_eur: 3, rate_unit: 'per_service' }, { quantity: 2 })).toEqual({ unitCost: 3, quantity: 2, total: 6, perPax: false })
  })
  it('per_night: once per night covered', () => {
    expect(priceTip({ rate_eur: 4, rate_unit: 'per_night' }, { quantity: 1 })?.total).toBe(4)
  })
  it('per_cruise: on the first day of the cruise only', () => {
    expect(priceTip({ rate_eur: 50, rate_unit: 'per_cruise' }, { cruiseStart: true })?.total).toBe(50)
    expect(priceTip({ rate_eur: 50, rate_unit: 'per_cruise' }, { cruiseStart: false })).toBeNull()
  })
  it('per_person: per traveller', () => {
    expect(priceTip({ rate_eur: 5, rate_unit: 'per_person' }, {})).toEqual({ unitCost: 5, quantity: 1, total: 5, perPax: true })
  })
  it('a zero rate charges nothing', () => {
    expect(priceTip({ rate_eur: 0, rate_unit: 'per_day' }, {})).toBeNull()
  })
})

describe('the itemized rates keep every unit', () => {
  it('a per_service porter tip and a per_cruise crew tip are no longer dropped', async () => {
    const rates = await getItemizedTippingRates(supabaseWith([
      { role_type: 'porter', context: 'airport', rate_eur: 3, rate_unit: 'per_service' },
      { role_type: 'boat_crew', context: 'cruise', rate_eur: 40, rate_unit: 'per_cruise' },
    ]) as never, 'org-1')
    expect(rates.getTip('porter', 'airport')?.rate_unit).toBe('per_service')
    expect(rates.getTip('boat_crew', 'cruise')?.rate_eur).toBe(40)
  })

  it('an agency-added unit has no rule and stays unpriced', () => {
    expect(itemizeTipRows([{ role_type: 'guide', rate_eur: 9, rate_unit: 'per_moon' }])).toEqual([])
  })

  it('tips are rounded to cents, not whole units', async () => {
    const rates = await getItemizedTippingRates(supabaseWith([{ role_type: 'driver', rate_eur: 2.5, rate_unit: 'per_day' }]) as never, 'org-1')
    expect(rates.getRate('driver')).toBe(2.5)
    expect(await getDailyTippingRate(supabaseWith([{ role_type: 'driver', rate_eur: 2.5, rate_unit: 'per_day' }]) as never, 'org-1')).toBe(2.5)
  })
})

describe('getRate (the AI builders’ shape) follows the unit as far as it can', () => {
  const rows = itemizeTipRows([
    { role_type: 'boat_crew', context: 'cruise', rate_eur: 40, rate_unit: 'per_cruise' },
    { role_type: 'guide', context: 'day_tour', rate_eur: 5, rate_unit: 'per_person' },
  ])
  it('a per_cruise tip is charged on the first ask only', () => {
    const rates = buildRatesObject(rows)
    expect(rates.getRate('boat_crew', 'cruise')).toBe(40)
    expect(rates.getRate('boat_crew', 'cruise')).toBe(0)
  })
  it('a per_person tip is the rate × the group size given', () => {
    expect(buildRatesObject(rows, { pax: 4 }).getRate('guide', 'day_tour')).toBe(20)
  })
})

describe('the Pricing Grid charges a per-person tip per traveller', () => {
  const item = (rate: number, extra: Partial<SelectedItem> = {}): SelectedItem =>
    ({ rateId: `t${rate}`, name: `Tip ${rate}`, rateEur: rate, rateNonEur: rate, ...extra })
  const slot = (items: SelectedItem[]): SlotValue => ({ slotId: 'tipping', selectedItems: items, customAmount: 0 })
  const day = (s: SlotValue) => ({ id: 'd', dayNumber: 1, title: '', city: 'Luxor', description: '', isExpanded: false, slots: [s] } as GridDay)
  const config = (pax: number, withGuide = true) => ({ pax, passport: 'eu', withGuide, marginPercent: 0, startDate: '2026-12-01' } as unknown as GridConfig)

  it('per_person 5 × 4 pax = 20 (it used to be 5 for the group)', () => {
    const basis = tipGridOption('per_person')
    const d = day(slot([item(5, { pricingBasis: basis.pricing_basis })]))
    expect(calculateDay(d, config(4))).toMatchObject({ groupTotal: 0, perPersonTotal: 5, dailyTotal: 20 })
  })

  it('a per-day tip stays once for the group', () => {
    const d = day(slot([item(10, { pricingBasis: tipGridOption('per_day').pricing_basis })]))
    expect(calculateDay(d, config(4)).dailyTotal).toBe(10)
  })

  it('guide off still drops the guide’s tips', () => {
    const d = day(slot([item(5, { pricingBasis: 'per_person', tipRole: 'guide' }), item(10, { tipRole: 'driver' })]))
    expect(calculateDay(d, config(4, false)).dailyTotal).toBe(10)
  })

  it('a per-cruise tip says to pick it on one day', () => {
    expect(tipGridOption('per_cruise').unitLabel).toMatch(/one day of the cruise/)
  })
})

describe('auto-pricing prices tips by their unit', () => {
  it('reads getTip + priceTip, not the per_day-only getRate', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    const block = src.slice(src.indexOf('// ----- TIPPING'), src.indexOf('// ----- AIRPORT SERVICES'))
    expect(block).toContain('tippingRates.getTip(')
    expect(block).toContain('priceTip(')
    expect(block).not.toContain('tippingRates.getRate(')
  })
})

describe('a blank Service Code includes the city', () => {
  it('two cities, two codes', () => {
    expect(tipServiceCode('guide', 'day_tour', 'Cairo')).toBe('TIP-GUIDE-DAY-TOUR-CAIRO')
    expect(tipServiceCode('guide', 'day_tour', 'Aswan')).not.toBe(tipServiceCode('guide', 'day_tour', 'Cairo'))
  })
  it('no city, no context', () => {
    expect(tipServiceCode('driver', '', '')).toBe('TIP-DRIVER-GEN')
  })
})
