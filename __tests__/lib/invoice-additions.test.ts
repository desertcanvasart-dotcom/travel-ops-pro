import { describe, it, expect } from 'vitest'
import {
  includeAdditions,
  partitionAdditions,
  toLineItems,
  type Addition,
} from '@/lib/invoice-additions'

const premium = (over: Partial<Addition> = {}): Addition => ({
  id: null,
  source: 'insurance',
  description: '海外旅行傷害保障 HC',
  quantity: 1,
  unit_price: 12200,
  currency: 'JPY',
  ...over,
})

const extra = (over: Partial<Addition> = {}): Addition => ({
  id: 'x-1',
  source: 'extra',
  description: 'Extra day at Abu Simbel',
  quantity: 1,
  unit_price: 340,
  currency: 'EUR',
  ...over,
})

describe('includeAdditions', () => {
  it('keeps additions off a deposit invoice', () => {
    // Taking a percentage of a fixed pass-through under-bills it; listing it on
    // the deposit AND the final bills it twice.
    expect(includeAdditions('deposit')).toBe(false)
  })

  it('puts them on a final or a standard invoice', () => {
    expect(includeAdditions('final')).toBe(true)
    expect(includeAdditions('standard')).toBe(true)
  })
})

describe('partitionAdditions', () => {
  it('totals what is in the invoice currency', () => {
    const p = partitionAdditions([extra({ id: 'a' }), extra({ id: 'b', unit_price: 60 })], 'EUR')
    expect(p.total).toBe(400)
    expect(p.billable).toHaveLength(2)
    expect(p.otherCurrency).toHaveLength(0)
  })

  it('multiplies by quantity', () => {
    expect(partitionAdditions([extra({ unit_price: 120, quantity: 3 })], 'EUR').total).toBe(360)
  })

  it('sets anything in another currency aside instead of converting it', () => {
    const p = partitionAdditions([extra(), premium()], 'EUR')
    expect(p.total).toBe(340)
    expect(p.otherCurrency.map(a => a.source)).toEqual(['insurance'])
  })

  it('is currency-blind about which side is which — a JPY invoice keeps the premium', () => {
    const p = partitionAdditions([extra(), premium()], 'JPY')
    expect(p.total).toBe(12200)
    expect(p.otherCurrency.map(a => a.source)).toEqual(['extra'])
  })

  it('rounds the total to the invoice currency', () => {
    // ¥ has no minor unit; a yen with a decimal place is not money.
    expect(partitionAdditions([premium({ unit_price: 12200.4 })], 'JPY').total).toBe(12200)
  })

  it('is empty and zero when there is nothing to add', () => {
    const p = partitionAdditions([], 'EUR')
    expect(p).toEqual({ billable: [], total: 0, otherCurrency: [] })
  })
})

describe('toLineItems', () => {
  it('produces the invoice line shape, amount = unit price × quantity', () => {
    expect(toLineItems([extra({ unit_price: 120, quantity: 2 })], 'EUR')).toEqual([
      { description: 'Extra day at Abu Simbel', quantity: 2, unit_price: 120, amount: 240 },
    ])
  })

  it('treats a nonsense quantity as one rather than zero', () => {
    expect(toLineItems([extra({ quantity: 0 })], 'EUR')[0].amount).toBe(340)
  })
})
