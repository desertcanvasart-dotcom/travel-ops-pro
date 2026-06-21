import { describe, it, expect } from 'vitest'
import { gridCompleteness } from '@/app/pricing-grid/lib/grid-completeness'

const pricedSlot = (slotId: string) => ({
  slotId,
  selectedItems: [{ rateId: 'r1', name: 'X', rateEur: 50, rateNonEur: 60 }],
  customAmount: 0,
})
const emptySlot = (slotId: string) => ({ slotId, selectedItems: [], customAmount: 0 })

const day = (n: number, slots: any[]) => ({ id: `d${n}`, dayNumber: n, title: `Day ${n}`, city: 'Cairo', description: '', isExpanded: false, slots })

describe('gridCompleteness (Phase B)', () => {
  it('is ok when days have priced services and guide (if enabled) is selected', () => {
    const r = gridCompleteness(
      [day(1, [pricedSlot('accommodation'), pricedSlot('guide')])],
      { withGuide: true }
    )
    expect(r.ok).toBe(true)
    expect(r.blocking).toEqual([])
  })

  it('blocks when nothing is priced anywhere', () => {
    const r = gridCompleteness([day(1, [emptySlot('accommodation')])], { withGuide: false })
    expect(r.ok).toBe(false)
    expect(r.blocking.some((b) => /nothing to quote/i.test(b))).toBe(true)
  })

  it('blocks when guide is enabled but never selected', () => {
    const r = gridCompleteness([day(1, [pricedSlot('accommodation')])], { withGuide: true })
    expect(r.ok).toBe(false)
    expect(r.blocking.some((b) => /guide is enabled/i.test(b))).toBe(true)
  })

  it('warns (not blocks) for a day with no priced services', () => {
    const r = gridCompleteness(
      [day(1, [pricedSlot('accommodation')]), day(2, [emptySlot('meals')])],
      { withGuide: false }
    )
    expect(r.ok).toBe(true) // day-2 emptiness is a warning, not blocking
    expect(r.warnings.some((w) => /Day 2/.test(w))).toBe(true)
  })

  it('counts a custom amount as priced', () => {
    const r = gridCompleteness(
      [day(1, [{ slotId: 'other_group', selectedItems: [], customAmount: 120 }])],
      { withGuide: false }
    )
    expect(r.ok).toBe(true)
  })
})
