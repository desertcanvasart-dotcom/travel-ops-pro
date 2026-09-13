import { describe, it, expect } from 'vitest'
import { priceCatalogItem, entranceFeeBasis, type Converter } from '@/lib/extras-catalog'

// Rates are USD here and the customer is billed in JPY — A.T.S's actual shape,
// and the reason conversion is part of the catalogue rather than an afterthought.
const usdToJpy: Converter = (amount, from, to) =>
  from === 'USD' && to === 'JPY' ? amount * 150 : null

const noRates: Converter = () => null

const base = {
  marginPercent: 25,
  rateCurrency: 'EUR',
  bookingCurrency: 'EUR',
  convert: noRates,
}

describe('priceCatalogItem', () => {
  it('applies the org margin to the cost', () => {
    const r = priceCatalogItem({ ...base, cost: 100 })
    expect(r.supplier_cost).toBe(100)
    expect(r.unit_price).toBe(125)
    expect(r.price_note).toBe('cost + 25% margin')
  })

  it('prefers the selling price the operator already set', () => {
    // optional_price_override is a decision, not an input to a formula.
    const r = priceCatalogItem({ ...base, cost: 100, sellingOverride: 140 })
    expect(r.unit_price).toBe(140)
    expect(r.supplier_cost).toBe(100) // still what we pay
    expect(r.price_note).toMatch(/price set on this option/)
  })

  it('treats a blank or zero rate as a hole, never as free', () => {
    for (const cost of [null, undefined, 0, '', 'abc']) {
      const r = priceCatalogItem({ ...base, cost })
      expect(r.unit_price).toBeNull()
      expect(r.supplier_cost).toBeNull()
      expect(r.price_note).toMatch(/no rate on file/)
    }
  })

  it('converts into the booking currency and says that it did', () => {
    const r = priceCatalogItem({
      ...base, cost: 100, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: usdToJpy,
    })
    expect(r.unit_price).toBe(18750) // 100 × 1.25 × 150
    expect(r.price_note).toMatch(/converted from USD/)
    // What we pay stays in the currency we pay it in.
    expect(r.supplier_cost).toBe(100)
    expect(r.supplier_currency).toBe('USD')
  })

  it('rounds to the booking currency — a yen has no decimal place', () => {
    const r = priceCatalogItem({
      ...base, cost: 100.37, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: usdToJpy,
    })
    expect(Number.isInteger(r.unit_price)).toBe(true)
  })

  it('refuses to invent a price when there is no rate to convert with', () => {
    const r = priceCatalogItem({
      ...base, cost: 100, rateCurrency: 'USD', bookingCurrency: 'JPY', convert: noRates,
    })
    expect(r.unit_price).toBeNull()
    expect(r.price_note).toMatch(/no exchange rate for USD → JPY/)
    // The cost is still known even when the selling price is not.
    expect(r.supplier_cost).toBe(100)
  })

  it('does not convert an override it cannot convert either', () => {
    const r = priceCatalogItem({
      ...base, cost: 100, sellingOverride: 140,
      rateCurrency: 'USD', bookingCurrency: 'JPY', convert: noRates,
    })
    expect(r.unit_price).toBeNull()
    expect(r.price_note).toMatch(/no exchange rate/)
  })

  it('passes a zero margin straight through', () => {
    expect(priceCatalogItem({ ...base, cost: 100, marginPercent: 0 }).unit_price).toBe(100)
  })
})

describe('entranceFeeBasis', () => {
  it('pre-fills the non-EUR rate and names the basis', () => {
    expect(entranceFeeBasis({ non_eur_rate: 20, eur_rate: 15 })).toEqual({
      cost: 20, basis: 'non-EUR passport rate',
    })
  })

  it('falls back to the EUR rate, and says that is what it used', () => {
    expect(entranceFeeBasis({ non_eur_rate: 0, eur_rate: 15 })).toEqual({
      cost: 15, basis: 'EUR passport rate',
    })
  })

  it('reports no basis at all when neither rate is usable', () => {
    expect(entranceFeeBasis({ non_eur_rate: null, eur_rate: 0 })).toEqual({ cost: null, basis: null })
  })
})

// ── Accommodation supplements as upgrades (2026-09-13) ────────────────────
import { supplementUpgrades, type PropertyStay } from '@/lib/extras-catalog'

describe('supplementUpgrades — the trip\'s own hotels and ship, priced for the stay', () => {
  const hotel: PropertyStay = {
    entity: 'accommodation',
    name: 'Hotel A',
    dates: ['2026-09-29', '2026-09-30', '2026-10-01'],   // two low nights, one high
    row: {
      id: 'h-1', supplier_id: 'sup-1', rate_currency: 'EGP',
      supplements: [{ key: 'view_nile', name: 'Nile View' }, { key: 'half_board', name: 'Half Board' }, { key: 'upper_floor', name: 'Upper Floor' }],
      seasons: [
        { name: 'Low', from: '2026-05-01', to: '2026-09-30', rates: { pp_double_eur: 80, 'supp:view_nile:eur': 10, 'supp:view_nile:non_eur': 15, 'supp:half_board:eur': 20, 'supp:upper_floor:non_eur': 5 } },
        { name: 'High', from: '2026-10-01', to: '2026-12-19', rates: { pp_double_eur: 120, 'supp:view_nile:eur': 20, 'supp:view_nile:non_eur': 25, 'supp:half_board:eur': 30 } },
      ],
    },
  }

  it('prices each supplement per person for the stay, night by night, non-EUR rate first', () => {
    const [view] = supplementUpgrades([hotel])
    expect(view).toMatchObject({ entity: 'accommodation', rowId: 'h-1', key: 'view_nile', name: 'Nile View', propertyName: 'Hotel A', supplierId: 'sup-1', rateCurrency: 'EGP', nights: 3 })
    expect(view.costPerPerson).toBe(15 + 15 + 25)
    expect(view.basis).toContain('non-EUR passport rate')
  })

  it('falls back to the EUR rate when that is the only one entered, and says so', () => {
    const hb = supplementUpgrades([hotel]).find(u => u.key === 'half_board')!
    expect(hb.costPerPerson).toBe(20 + 20 + 30)
    expect(hb.basis).toContain('EUR passport rate')
  })

  it('a night with no price under either rate leaves the item unpriced with the reason — never a free night', () => {
    const uf = supplementUpgrades([hotel]).find(u => u.key === 'upper_floor')!
    expect(uf.costPerPerson).toBeNull()
    expect(uf.basis).toContain('no price for 1 of 3 nights')
  })

  it('a cruise stay prices the same way, and a stay with no nights offers nothing', () => {
    const ship: PropertyStay = {
      entity: 'cruise', name: 'Ship', dates: ['2026-06-01', '2026-06-02'],
      row: { id: 'c-1', supplements: [{ key: 'upper_deck', name: 'Upper Deck' }], seasons: [{ name: 'All', from: '2026-01-01', to: '2026-12-31', rates: { double_eur: 200, 'supp:upper_deck:non_eur': 30 } }] },
    }
    expect(supplementUpgrades([ship])[0]).toMatchObject({ entity: 'cruise', key: 'upper_deck', nights: 2, costPerPerson: 60, supplierId: null, rateCurrency: null })
    expect(supplementUpgrades([{ ...ship, dates: [] }])).toEqual([])
  })
})
