// Loading a saved itinerary into the pricing grid (Sell › Pricing Grid): a
// line with no current rate — saved before rate ids were stored, typed in,
// or whose rate was since removed — keeps the unit price stored on its row,
// in the grid's rate currency, and is marked as a saved price. It showed "no
// price" and was re-saved at 0. A line whose rate is current is still priced
// from the rate; a brand-new line with no rate still has no price.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mapServicesToSlots } from '@/app/pricing-grid/lib/slot-mapping'
import { hydrateDays } from '@/app/pricing-grid/lib/hydrate-items'
import { storedUnitPrice, applyStoredPrices } from '@/app/pricing-grid/lib/saved-price'
import type { ExchangeRates } from '@/lib/currency-service'

// EUR-based, as the run rates are: 1 EUR = 1.08 USD = 162 JPY.
const RATES: ExchangeRates = { base: 'EUR', date: '2026-10-01', rates: { EUR: 1, USD: 1.08, JPY: 162 } } as ExchangeRates
const USD = { itineraryCurrency: 'USD', rateCurrency: 'USD', fxRates: RATES }

const row = (over: Record<string, unknown> = {}) => ({
  id: 'svc-1', service_type: 'accommodation', service_name: 'Old Nile Hotel', quantity: 2,
  rate_eur: 120, rate_non_eur: 130, total_cost: 260, notes: null, ...over,
})
const RATE_LIST = { accommodation: [{ id: 'h1', name: 'Mena House', rateEur: 100, rateNonEur: 100 }] }
const loadDay = (services: any[], ctx = USD) => [{ dayNumber: 1, slots: mapServicesToSlots(services, 2, ctx) }]
const accItems = (days: any[]) => days[0].slots.find((s: any) => s.slotId === 'accommodation').selectedItems

describe('loading a saved line with no current rate', () => {
  it('keeps its stored price, marked, and is not reported as unpriced', () => {
    const { days, unpriced, saved } = hydrateDays(loadDay([row()]), RATE_LIST as never, 2)
    expect(accItems(days)[0]).toMatchObject({ rateId: 'svc-1', serviceId: 'svc-1', rateEur: 120, rateNonEur: 130, savedPrice: true })
    expect(unpriced).toEqual([])
    expect(saved).toEqual([{ dayNumber: 1, slotId: 'accommodation', rateId: 'svc-1', name: 'Old Nile Hotel' }])
  })

  it('a line whose rate was removed keeps its stored price too', () => {
    const { days, saved } = hydrateDays(loadDay([row({ notes: '__grid:slot:accommodation|rate_id:gone' })]), RATE_LIST as never, 2)
    expect(accItems(days)[0]).toMatchObject({ rateId: 'gone', rateNonEur: 130, savedPrice: true })
    expect(saved).toHaveLength(1)
  })

  it('a line whose rate is current is priced from the rate, unmarked', () => {
    const { days, saved } = hydrateDays(loadDay([row({ notes: '__grid:slot:accommodation|rate_id:h1' })]), RATE_LIST as never, 2)
    expect(accItems(days)[0]).toMatchObject({ rateId: 'h1', rateNonEur: 100, serviceId: 'svc-1' })
    expect(accItems(days)[0].savedPrice).toBeUndefined()
    expect(saved).toEqual([])
  })

  it('a brand-new pick whose rate is gone has no price and is not marked', () => {
    const fresh = [{ dayNumber: 1, slots: [{ slotId: 'accommodation', selectedItems: [{ rateId: 'gone', name: 'New Pick', rateEur: 99, rateNonEur: 99 }], customAmount: 0 }] }]
    const { days, unpriced, saved } = hydrateDays(fresh, RATE_LIST as never, 2)
    expect(accItems(days)[0]).toMatchObject({ rateEur: 0, rateNonEur: 0 })
    expect(accItems(days)[0].savedPrice).toBeUndefined()
    expect(unpriced).toHaveLength(1)
    expect(saved).toEqual([])
  })

  it('the hydration is stable: a kept line is the same days on the next pass', () => {
    const once = hydrateDays(loadDay([row()]), RATE_LIST as never, 2).days
    expect(hydrateDays(once, RATE_LIST as never, 2).days).toBe(once)
  })
})

describe('the stored price in the rate currency (storedUnitPrice)', () => {
  it('a grid-saved line (no supplier currency) is in the trip currency; the same as the rate currency is kept', () => {
    expect(storedUnitPrice(row(), USD)).toEqual({ rateEur: 120, rateNonEur: 130 })
  })

  it('a line in its supplier currency, which is the rate currency, is kept as is', () => {
    expect(storedUnitPrice(row({ supplier_currency: 'USD', exchange_rate_used: 150 }), { ...USD, itineraryCurrency: 'JPY' })).toEqual({ rateEur: 120, rateNonEur: 130 })
  })

  it('a line converted into the trip’s (rate) currency at its own rate is converted by that rate', () => {
    expect(storedUnitPrice(row({ supplier_currency: 'EUR', exchange_rate_used: 1.1 }), USD)).toEqual({ rateEur: 132, rateNonEur: 143 })
  })

  it('a trip in another currency, entered by hand, is converted at today’s rates', () => {
    // JPY 16,200 → USD 108.
    expect(storedUnitPrice(row({ rate_eur: 16200, rate_non_eur: 16200 }), { ...USD, itineraryCurrency: 'JPY' })).toEqual({ rateEur: 108, rateNonEur: 108 })
  })

  it('with no rate to convert it, there is no stored price — and the loaded line has none', () => {
    const ctx = { itineraryCurrency: 'EGP', rateCurrency: 'USD', fxRates: RATES }
    expect(storedUnitPrice(row(), ctx)).toBeNull()
    const { days, unpriced } = hydrateDays(loadDay([row()], ctx), RATE_LIST as never, 2)
    expect(accItems(days)[0]).toMatchObject({ rateEur: 0, rateNonEur: 0 })
    expect(unpriced).toHaveLength(1)
  })
})

describe('the save’s own copy (applyStoredPrices)', () => {
  it('drops the browser’s mark and price; only a row it read gives the price back', () => {
    const posted = [{ slots: [{ slotId: 'accommodation', customAmount: 0, selectedItems: [
      { rateId: 'x', name: 'A', rateEur: 999, rateNonEur: 999, serviceId: 'svc-1', savedPrice: true },
      { rateId: 'y', name: 'B', rateEur: 999, rateNonEur: 999, serviceId: 'svc-elsewhere', savedPrice: true },
    ] }] }]
    const [d] = applyStoredPrices(posted as never, new Map([['svc-1', { rateEur: 120, rateNonEur: 130 }]]))
    expect(d.slots[0].selectedItems[0]).toMatchObject({ rateNonEur: 130, savedPrice: true })
    expect(d.slots[0].selectedItems[1].savedPrice).toBeUndefined()
  })
})

describe('the screen marks it', () => {
  it('SlotRow shows the saved-price mark from the i18n messages, in both languages', () => {
    const src = readFileSync(join(process.cwd(), 'app/pricing-grid/components/SlotRow.tsx'), 'utf8')
    expect(src).toContain("useTranslations('pricingGrid')")
    expect(src.match(/<SavedPriceMark item=/g) ?? []).toHaveLength(3)
    for (const l of ['en', 'ja']) {
      const m = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8'))
      expect(m.pricingGrid.savedPrice).toBeTruthy()
      expect(m.pricingGrid.savedPriceHint).toBeTruthy()
    }
  })

  it('the page loads an itinerary with the currencies to keep its stored prices', () => {
    const page = readFileSync(join(process.cwd(), 'app/pricing-grid/page.tsx'), 'utf8')
    expect(page).toContain('mapServicesToSlots(services, itn.num_adults || 2, savedPrices)')
  })
})
