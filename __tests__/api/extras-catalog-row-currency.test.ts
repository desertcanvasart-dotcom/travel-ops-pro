// A rate row that names its own currency must be PRICED in that currency.
//
// "Step Pyramid of Zoser" is stored as EGP 150. The booking extras picker
// showed "¥31,159 · converted from USD · we pay $150" — it had priced the 150
// as if it were the ORG's rate currency (USD), inflating the offer roughly
// 50× and telling the office a supplier cost that was never true (operator,
// 1 Sep). Same class as the transport-package display bug the day before:
// per-row currency exists in the data and gets overwritten by the org's.
//
// This pins the CHOICE OF CURRENCY the catalog route makes per item, which is
// the part that was wrong — priceCatalogItem itself was always correct once
// told the right currency.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { priceCatalogItem, type Converter } from '@/lib/extras-catalog'

const ROOT = join(__dirname, '..', '..')
const ROUTE = readFileSync(
  join(ROOT, 'app', 'api', 'bookings', '[id]', 'extras', 'catalog', 'route.ts'),
  'utf8'
)

// The rate the office actually holds for EGP→JPY at the time of writing is
// irrelevant; what matters is that the EGP number is converted FROM EGP.
const fx: Converter = (amount, from, to) => {
  if (from === to) return amount
  if (from === 'EGP' && to === 'JPY') return amount * 3
  if (from === 'USD' && to === 'JPY') return amount * 150
  return null
}

describe('extras catalog currency selection', () => {
  it('the route passes the row currency, falling back to the org', () => {
    // The bug was a hardcoded `rateCurrency` for every item.
    expect(ROUTE).toMatch(/rateCurrency:\s*row\?\.rate_currency\s*\|\|\s*rateCurrency/)
  })

  it('selects rate_currency for the entrance-fee item', () => {
    // The row object must reach price() — passing only the cost is how the
    // currency got lost.
    expect(ROUTE).toMatch(/price\(cost,\s*null,\s*a\)/)
    expect(ROUTE).toMatch(/select\('[^']*rate_currency[^']*'\)[\s\S]{0,200}entrance_fees|from\('entrance_fees'\)[\s\S]{0,300}rate_currency/)
  })

  it('an EGP row prices from EGP, not from the org currency', () => {
    const asEgp = priceCatalogItem({
      cost: 150, marginPercent: 30, rateCurrency: 'EGP', bookingCurrency: 'JPY', convert: fx,
    })
    const asOrgUsd = priceCatalogItem({
      cost: 150, marginPercent: 30, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: fx,
    })
    expect(asEgp.supplier_currency).toBe('EGP')
    expect(asEgp.unit_price).toBe(585)        // 150 × 1.3 × 3
    expect(asOrgUsd.unit_price).toBe(29250)   // what the picker was showing
    expect(asEgp.unit_price).toBeLessThan(asOrgUsd.unit_price)
    expect(asEgp.price_note).toMatch(/converted from EGP/)
  })

  it('a row with no currency still uses the org rate currency', () => {
    const r = priceCatalogItem({
      cost: 100, marginPercent: 30, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: fx,
    })
    expect(r.supplier_currency).toBe('USD')
  })
})
