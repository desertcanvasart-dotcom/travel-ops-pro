import { describe, it, expect } from 'vitest'
import {
  checkDeliverablePrice,
  checkAmountDeliverable,
  assertDeliverablePrice,
  PriceNotDeliverableError,
  MARGIN_MAX,
} from '@/lib/pricing-guards'

describe('checkDeliverablePrice', () => {
  it('passes a clean, complete price', () => {
    const r = checkDeliverablePrice({
      complete: true,
      holes: [],
      sellingPrice: 1000,
      totalCost: 800,
      pricePerPerson: 500,
      numPax: 2,
      marginPercent: 25,
      currency: 'EUR',
    })
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
  })

  it('blocks an incomplete result with holes', () => {
    const r = checkDeliverablePrice({
      complete: false,
      holes: [{ kind: 'hotel', reason: 'missing', tier: 'standard', lookupAttempted: 'x', message: 'y' }],
      sellingPrice: 100,
    })
    expect(r.ok).toBe(false)
    expect(r.violations.some((v) => /incomplete/i.test(v))).toBe(true)
    expect(r.violations.some((v) => /hole/i.test(v))).toBe(true)
  })

  it('blocks zero / negative / NaN amounts', () => {
    expect(checkDeliverablePrice({ sellingPrice: 0 }).ok).toBe(false)
    expect(checkDeliverablePrice({ sellingPrice: -5 }).ok).toBe(false)
    expect(checkDeliverablePrice({ sellingPrice: NaN }).ok).toBe(false)
    expect(checkDeliverablePrice({ sellingPrice: null }).ok).toBe(false)
  })

  it('blocks a margin outside [0, MAX]', () => {
    expect(checkDeliverablePrice({ sellingPrice: 100, marginPercent: -1 }).ok).toBe(false)
    expect(checkDeliverablePrice({ sellingPrice: 100, marginPercent: MARGIN_MAX + 1 }).ok).toBe(false)
    expect(checkDeliverablePrice({ sellingPrice: 100, marginPercent: 25 }).ok).toBe(true)
  })

  it('blocks per-person × pax that does not reconcile with the selling price', () => {
    const bad = checkDeliverablePrice({ sellingPrice: 1000, pricePerPerson: 100, numPax: 2 })
    expect(bad.ok).toBe(false)
    const good = checkDeliverablePrice({ sellingPrice: 1000, pricePerPerson: 500, numPax: 2 })
    expect(good.ok).toBe(true)
  })

  it('blocks a missing currency when one is expected', () => {
    expect(checkDeliverablePrice({ sellingPrice: 100, currency: '' }).ok).toBe(false)
    expect(checkDeliverablePrice({ sellingPrice: 100, currency: 'EUR' }).ok).toBe(true)
  })

  it('blocks line items not backed by a real rate', () => {
    const r = checkDeliverablePrice({
      sellingPrice: 100,
      services: [{ rateSource: 'accommodation_rates' }, { rateSource: 'default' }],
    })
    expect(r.ok).toBe(false)
    expect(r.violations.some((v) => /not backed by a real rate/i.test(v))).toBe(true)
  })
})

describe('checkAmountDeliverable', () => {
  it('passes a positive amount with currency', () => {
    expect(checkAmountDeliverable(500, { currency: 'EUR' }).ok).toBe(true)
  })
  it('blocks zero / null amounts (a non-deliverable persisted total)', () => {
    expect(checkAmountDeliverable(0, { currency: 'EUR' }).ok).toBe(false)
    expect(checkAmountDeliverable(null, { currency: 'EUR' }).ok).toBe(false)
  })
})

describe('assertDeliverablePrice', () => {
  it('throws PriceNotDeliverableError with violations on a bad price', () => {
    try {
      assertDeliverablePrice({ sellingPrice: 0 })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PriceNotDeliverableError)
      expect((e as PriceNotDeliverableError).violations.length).toBeGreaterThan(0)
    }
  })
  it('does not throw on a clean price', () => {
    expect(() => assertDeliverablePrice({ sellingPrice: 100, currency: 'EUR' })).not.toThrow()
  })
})
