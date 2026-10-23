import { describe, it, expect } from 'vitest'
import { isWebsitePriced, websiteOrderPriceJpy, linesInWebsiteCurrency, websitePricedTotals, withoutCostGaps } from '@/lib/pricing/website-price'
import { serviceLineForItinerary } from '@/lib/itineraries/template-days'

// Operator, 2026-10-23: a website order's price is the website's, final and in
// yen; the engine's run is the office's cost estimate (admins and managers).

describe('website-priced orders', () => {
  it('only a web-form record held in yen is website-priced', () => {
    expect(isWebsitePriced({ source: 'web_form', currency: 'JPY' })).toBe(true)
    expect(isWebsitePriced({ source: 'web_form', currency: 'USD' })).toBe(false)
    expect(isWebsitePriced({ source: 'b2b_template', currency: 'JPY' })).toBe(false)
    expect(isWebsitePriced(null)).toBe(false)
  })

  it('the price: the 小計, else the base fare × the party; never a child at the adult fare', () => {
    expect(websiteOrderPriceJpy({ adults: 2, children: 1, websiteSubtotalJpy: 1250000, websiteBaseFare1: { adultJpy: 1 } })).toBe(1250000)
    expect(websiteOrderPriceJpy({ adults: 2, children: 0, websiteBaseFare1: { adultJpy: 489000 } })).toBe(978000)
    expect(websiteOrderPriceJpy({ adults: 2, children: 1, websiteBaseFare1: { adultJpy: 489000, childJpy: 400000 } })).toBe(1378000)
    expect(websiteOrderPriceJpy({ adults: 2, children: 1, websiteBaseFare1: { adultJpy: 489000 } })).toBeNull()
    expect(websiteOrderPriceJpy({ adults: 2, children: 0 })).toBeNull()
  })

  it('lines go to yen and keep their rate-currency cost', () => {
    const [line] = linesInWebsiteCurrency([{ unit_cost: 12.66, line_total: 25.32, unpriced: undefined }], 'USD', 150)
    expect(line).toMatchObject({ unit_cost: 1899, line_total: 3798, cost_currency: 'USD', cost_unit_original: 12.66, cost_total_original: 25.32, cost_exchange_rate: 150 })
  })

  it('the totals: selling = the website price, cost converted, margin what is left', () => {
    expect(websitePricedTotals({ priceJpy: 978000, costInRateCurrency: 4465.04, singleSupplementInRateCurrency: 1045, rate: 150, pax: 2 })).toEqual({
      selling_price: 978000, total_cost: 669756, margin_amount: 308244, margin_percent: 46.02,
      price_per_person: 489000, single_supplement: 156750, currency: 'JPY',
    })
  })

  it('cost gaps drop out of a website-priced record only', () => {
    const lines = [{ unpriced: true }, { unpriced: undefined }]
    expect(withoutCostGaps({ source: 'web_form', currency: 'JPY' }, lines)).toHaveLength(1)
    expect(withoutCostGaps({ source: 'web_form', currency: 'USD' }, lines)).toHaveLength(2)
  })

  it('the itinerary line is in yen, paid to the supplier in its own currency', () => {
    const row = serviceLineForItinerary(
      { service_name: 'Guide', quantity: 1, quantity_mode: 'per_pax', unit_cost: 1500, line_total: 1500, cost_currency: 'USD', cost_total_original: 10, cost_exchange_rate: 150 },
      { dayId: 'd1', pax: 2, marginPercent: 0, currency: 'JPY' },
    )
    expect(row).toMatchObject({ quantity: 2, total_cost: 3000, supplier_currency: 'USD', supplier_cost_original: 20, exchange_rate_used: 150 })
  })
})

describe('applications and questions', () => {
  it('an application (or a form with no type) becomes a trip; a question does not', async () => {
    const { isApplicationOrder } = await import('@/lib/intake/tour-up-order')
    expect(isApplicationOrder({ inquiryType: '申込み' })).toBe(true)
    expect(isApplicationOrder({ inquiryType: 'お申し込み' })).toBe(true)
    expect(isApplicationOrder({ inquiryType: '' })).toBe(true)
    expect(isApplicationOrder({ inquiryType: 'お問合せ' })).toBe(false)
    expect(isApplicationOrder({ inquiryType: '資料請求' })).toBe(false)
  })

  it("a website trip's gap reads without the before-sending instruction", async () => {
    const { costGapReason } = await import('@/lib/pricing/itinerary-completeness')
    expect(costGapReason('No cost entered. Fill it in on the itinerary before sending. No rate: No 4D cruise transport package.')).toBe('No 4D cruise transport package.')
    expect(costGapReason('No cost entered. Fill it in on the itinerary before sending.')).toBe('No cost entered. Fill it in on the itinerary before sending.')
  })
})
