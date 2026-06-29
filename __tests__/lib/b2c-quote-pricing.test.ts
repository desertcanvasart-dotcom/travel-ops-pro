import { describe, it, expect } from 'vitest'

// The B2C offer is derived from an itinerary's total_cost + a margin, split per
// traveller. This mirrors the pure arithmetic in app/api/b2c/quotes (create) and
// [id] (re-price) to lock the formula.
// margin_amount = total_cost × margin%/100 ; selling = total_cost + margin ;
// per_person = selling / max(1, travelers)   (margin is additive, not ×(1+rate))

function priceOffer(totalCost: number, marginPercent: number, numTravelers: number) {
  const travelers = Math.max(1, Number(numTravelers) || 1)
  const total = Number(totalCost) || 0
  const pct = Number(marginPercent) || 0
  const marginAmount = total * (pct / 100)
  const sellingPrice = total + marginAmount
  return { marginAmount, sellingPrice, pricePerPerson: sellingPrice / travelers }
}

describe('b2c offer pricing', () => {
  it('applies additive margin and splits per traveller', () => {
    const r = priceOffer(1000, 25, 2)
    expect(r.marginAmount).toBe(250)
    expect(r.sellingPrice).toBe(1250)
    expect(r.pricePerPerson).toBe(625)
  })

  it('treats 0 travellers as 1 (no divide-by-zero)', () => {
    expect(priceOffer(900, 0, 0).pricePerPerson).toBe(900)
  })

  it('zero cost or margin degrades gracefully', () => {
    expect(priceOffer(0, 25, 2)).toEqual({ marginAmount: 0, sellingPrice: 0, pricePerPerson: 0 })
    expect(priceOffer(500, 0, 5)).toMatchObject({ marginAmount: 0, sellingPrice: 500, pricePerPerson: 100 })
  })

  it('margin is additive — NOT total×(1+rate) applied twice', () => {
    // 20% on 1000 = 1200, per-person /4 = 300 (not 1000×1.2×1.2).
    const r = priceOffer(1000, 20, 4)
    expect(r.sellingPrice).toBe(1200)
    expect(r.pricePerPerson).toBe(300)
  })
})
