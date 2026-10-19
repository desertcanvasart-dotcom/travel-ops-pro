import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  extraPicksFromServices, extraServiceRows, gridExtraOptions, priceGridExtras, sanitizeExtraPicks,
  EXTRA_LINE_TAG, type GridExtraOption,
} from '@/app/pricing-grid/lib/extras'
import { calculateGrandTotals, sellingFromCost } from '@/app/pricing-grid/lib/calculator'
import type { GridConfig } from '@/app/pricing-grid/types'

// The Quote Builder (Pricing Grid) extras picker: Sell → Extras offered on
// the trip, priced by the one rule — a set price IS the price, a blank one is
// cost + the quote's margin, neither is a hole (never 0).

const ID = {
  fastTrack: '11111111-1111-4111-8111-111111111111',
  dinner: '22222222-2222-4222-8222-222222222222',
  mystery: '33333333-3333-4333-8333-333333333333',
  balloon: '44444444-4444-4444-8444-444444444444',
  gone: '55555555-5555-4555-8555-555555555555',
}

const extra = (over: Partial<GridExtraOption> & { id: string; name: string }): GridExtraOption => ({
  supplier_cost: null, selling_price: null, unit: 'per_person', programme_price: false, ...over,
})

const OPTIONS: GridExtraOption[] = [
  extra({ id: ID.fastTrack, name: 'Airport fast-track', supplier_cost: 20, selling_price: 35, unit: 'per_person', supplier_id: 'sup-1' }),
  extra({ id: ID.dinner, name: 'Dinner cruise', supplier_cost: 100, unit: 'per_booking' }),
  extra({ id: ID.mystery, name: 'Mystery add-on' }),
]

describe('priceGridExtras', () => {
  it('a set price is the price — never marked up; a blank one takes the margin', () => {
    const p = priceGridExtras(OPTIONS, [{ id: ID.fastTrack }, { id: ID.dinner }], 4, 25)
    expect(p.cost_total).toBe(20 * 4 + 100)
    expect(p.pinned_sell).toBe(35 * 4)
    expect(p.margined_cost).toBe(100)
    expect(p.sell_total).toBe(140 + 125)
    expect(p.holes).toEqual([])
  })

  it('no cost and no price is a hole that adds nothing — not a free line', () => {
    const p = priceGridExtras(OPTIONS, [{ id: ID.mystery }], 2, 25)
    expect(p.sell_total).toBe(0)
    expect(p.cost_total).toBe(0)
    expect(p.holes).toHaveLength(1)
    expect(p.holes[0].message).toContain('Mystery add-on')
  })

  it('a pick the trip is no longer offered is named and left out', () => {
    const p = priceGridExtras(OPTIONS, [{ id: ID.gone, name: 'Old programme extra' }], 2, 25)
    expect(p.lines).toEqual([])
    expect(p.holes[0].message).toBe('"Old programme extra" is no longer offered on this trip, so it was left out.')
  })

  it('an activity-linked extra costs what the Activities rate costs for the group', () => {
    const options = gridExtraOptions(
      [extra({ id: ID.balloon, name: 'Balloon', unit: 'per_person', activity_rate_id: 'act-1' })],
      [{ id: 'act-1', pricing_type: 'flat', base_rate_non_eur: 300, base_rate_eur: 280 }],
      3, false
    )
    expect(options[0].supplier_cost).toBe(100)
    const eu = gridExtraOptions(
      [extra({ id: ID.balloon, name: 'Balloon', unit: 'per_booking', activity_rate_id: 'act-1' })],
      [{ id: 'act-1', pricing_type: 'flat', base_rate_non_eur: 300, base_rate_eur: 280 }],
      3, true
    )
    expect(eu[0].supplier_cost).toBe(280)
  })
})

describe('the grid total with extras', () => {
  it('sellingFromCost: trip and cost-only extras take the margin once, a set price is added as is', () => {
    const r = sellingFromCost({
      totalCost: 1000, marginPercent: 25, season: null, currency: 'USD',
      extras: { margined_cost: 100, pinned_sell: 140 },
    })
    expect(r.baseSellingPriceTotal).toBe(1100 * 1.25 + 140)
    expect(r.sellingPriceTotal).toBe(1515)
  })

  it('the season premium is on the whole trip, extras included', () => {
    const r = sellingFromCost({
      totalCost: 1000, marginPercent: 0, season: { seasonId: 's', name: 'Peak', upliftPercent: 10 } as never, currency: 'USD',
      extras: { margined_cost: 0, pinned_sell: 100 },
    })
    expect(r.baseSellingPriceTotal).toBe(1100)
    expect(r.seasonUplift).toBe(110)
  })

  it('calculateGrandTotals: the extras cost joins the total cost, the margin is what is left', () => {
    const config = { pax: 4, marginPercent: 25, startDate: '2026-11-01', rateCurrency: 'USD' } as GridConfig
    const p = priceGridExtras(OPTIONS, [{ id: ID.fastTrack }, { id: ID.dinner }], 4, 25)
    const t = calculateGrandTotals([], config, [], p)
    expect(t.totalCost).toBe(180)
    expect(t.sellingPriceTotal).toBe(265)
    expect(t.marginAmount).toBe(85)
    expect(t.sellingPricePerPerson).toBe(66.25)
  })

  it('no extras = the grid exactly as before', () => {
    const config = { pax: 2, marginPercent: 25, startDate: '2026-11-01', rateCurrency: 'USD' } as GridConfig
    expect(calculateGrandTotals([], config, [], null)).toEqual(calculateGrandTotals([], config, []))
  })
})

describe('saving and restoring the extras', () => {
  const p = priceGridExtras(OPTIONS, [{ id: ID.fastTrack }, { id: ID.dinner }, { id: ID.mystery }], 4, 25)
  const rows = extraServiceRows(p, OPTIONS, 25, 'USD')

  it('one tagged line per extra: cost as cost, client price = set price or cost at margin', () => {
    expect(rows).toEqual([
      expect.objectContaining({
        service_type: 'extra', service_name: 'Airport fast-track', quantity: 4,
        rate_eur: 20, total_cost: 80, client_price: 140, supplier_id: 'sup-1',
        notes: `${EXTRA_LINE_TAG}${ID.fastTrack}`,
      }),
      expect.objectContaining({ service_name: 'Dinner cruise', quantity: 1, total_cost: 100, client_price: 125, supplier_id: null }),
      // Unpriced: saved with no price (the save says so), never as a priced 0.
      expect.objectContaining({ service_name: 'Mystery add-on', total_cost: 0, client_price: 0 }),
    ])
  })

  it('a yen trip rounds to whole yen', () => {
    const yen = priceGridExtras([extra({ id: ID.dinner, name: 'Dinner', supplier_cost: 1001, unit: 'per_booking' })], [{ id: ID.dinner }], 2, 25)
    expect(extraServiceRows(yen, [], 25, 'JPY')[0].client_price).toBe(1251)
  })

  it('a reload reads the picks back from the lines; the slot mapping skips them', () => {
    const services = [
      { service_name: 'Hotel X', notes: '__grid:slot:accommodation|rate_id:abc' },
      ...rows,
      { ...rows[0] }, // the same extra twice is one pick
    ]
    expect(extraPicksFromServices(services)).toEqual([
      { id: ID.fastTrack, name: 'Airport fast-track' },
      { id: ID.dinner, name: 'Dinner cruise' },
      { id: ID.mystery, name: 'Mystery add-on' },
    ])
    // "extra" is no grid slot, so mapServicesToSlots drops the line.
    expect(rows[0].notes).toMatch(/slot:extra\|/)
  })

  it('sanitizeExtraPicks keeps uuids only, once each', () => {
    expect(sanitizeExtraPicks([ID.dinner, { id: ID.dinner }, { id: 'nope' }, 7, { id: ID.fastTrack, name: ' Fast ' }]))
      .toEqual([{ id: ID.dinner }, { id: ID.fastTrack, name: 'Fast' }])
    expect(sanitizeExtraPicks(undefined)).toEqual([])
  })
})

describe('the save route prices the extras itself', () => {
  const src = readFileSync(join(__dirname, '../../app/api/pricing-grid/save/route.ts'), 'utf8')
  it('reads the rows server-side for the trip\'s own programme and folds them into the stored total', () => {
    expect(src).toContain('sanitizeExtraPicks(config.extras)')
    expect(src).toContain('gridTripProgramme(supabase, callerOrgId')
    expect(src).toContain('loadGridExtraRows(supabase, callerOrgId, templateId')
    expect(src).toMatch(/sellingFromCost\(\{ totalCost: supplierTotal,[^}]*extras: extrasPricing/)
    // The margined total is summed BEFORE the extras lines are pushed.
    expect(src.indexOf('const supplierTotal')).toBeLessThan(src.indexOf('extraServiceRows(extrasPricing'))
  })
})
