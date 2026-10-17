// ============================================
// Analytics arithmetic adds up to the numbers beside it
// ============================================
// Each block pins one way the dashboard used to contradict itself: status
// buckets that did not sum to Total Bookings, a weekly chart that did not sum
// to Total Revenue, FX holes reported twice and for trips that are not
// revenue, a conversion rate that ignored completed trips, an average that
// divided by trips it had dropped, and "+100%" growth from nothing.

import { describe, it, expect, vi } from 'vitest'
import {
  bookingBuckets,
  conversionRate,
  avgDealSize,
  revenueGrowth,
  groupByWeek,
  utcWeekStart,
  summariseItineraries,
} from '@/lib/analytics-metrics'

const trip = (id: string, status: string | null, created_at: string, amount = 100) =>
  ({ id, status, created_at, amount })

describe('bookingBuckets', () => {
  it('counts draft and sent as pending, so the buckets add up to the total', () => {
    const b = bookingBuckets([
      { status: 'draft' }, { status: 'sent' }, { status: 'confirmed' },
      { status: 'completed' }, { status: 'cancelled' }, { status: null },
    ])
    expect(b).toEqual({ total: 6, confirmed: 1, completed: 1, cancelled: 1, pending: 3 })
    expect(b.confirmed + b.completed + b.cancelled + b.pending).toBe(b.total)
  })
})

describe('conversionRate', () => {
  it('counts completed trips as won, not only confirmed ones', () => {
    expect(conversionRate({ total: 4, confirmed: 1, completed: 1, cancelled: 1, pending: 1 })).toBe(50)
  })
  it('is 0 with no trips', () => {
    expect(conversionRate({ total: 0, confirmed: 0, completed: 0, cancelled: 0, pending: 0 })).toBe(0)
  })
})

describe('avgDealSize', () => {
  it('divides by trips that have a converted amount, not by those dropped as FX holes', () => {
    expect(avgDealSize([100, 300, null])).toBe(200)
  })
  it('is 0 when nothing converted', () => {
    expect(avgDealSize([null])).toBe(0)
  })
})

describe('revenueGrowth', () => {
  it('is null when the previous period had no revenue', () => {
    expect(revenueGrowth(500, 0)).toBeNull()
    expect(revenueGrowth(0, 0)).toBeNull()
  })
  it('is a percentage otherwise', () => {
    expect(revenueGrowth(150, 100)).toBe(50)
    expect(revenueGrowth(50, 100)).toBe(-50)
  })
})

describe('groupByWeek', () => {
  it('uses UTC Monday as the week start, whatever the server timezone', () => {
    // Sunday 23:30 UTC is still the week that began on the Monday before.
    expect(utcWeekStart(new Date('2026-09-13T23:30:00Z'))).toBe('2026-09-07')
    expect(utcWeekStart(new Date('2026-09-14T00:00:00Z'))).toBe('2026-09-14')
  })

  it('emits every week in the range, zero-filled and labelled by start date', () => {
    const weeks = groupByWeek(
      [{ created_at: '2026-09-15T10:00:00Z', amount: 40 }],
      new Date('2026-08-31T12:00:00Z'),
      new Date('2026-09-29T12:00:00Z')
    )
    expect(weeks.map(w => w.month)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
    expect(weeks.map(w => w.revenue)).toEqual([0, 0, 40, 0, 0])
  })

  it('keeps more than five weeks and sums to the revenue it was given', () => {
    const start = new Date('2025-10-12T00:00:00Z')
    const end = new Date('2026-10-12T00:00:00Z')
    const rows = Array.from({ length: 12 }, (_, i) => ({
      created_at: new Date(start.getTime() + i * 30 * 86400000).toISOString(),
      amount: 10 * (i + 1),
    }))
    const weeks = groupByWeek(rows, start, end)
    expect(weeks.length).toBeGreaterThanOrEqual(52)
    expect(weeks.every(w => /^\d{4}-\d{2}-\d{2}$/.test(w.month))).toBe(true)
    expect(weeks.reduce((s, w) => s + w.revenue, 0)).toBe(rows.reduce((s, r) => s + r.amount, 0))
  })
})

describe('summariseItineraries', () => {
  const range = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-30T00:00:00Z') }
  const rows = [
    trip('a', 'confirmed', '2026-09-02T00:00:00Z', 100),
    trip('b', 'completed', '2026-09-20T00:00:00Z', 300),
    trip('c', 'confirmed', '2026-09-21T00:00:00Z', -1), // -1 = no exchange rate
    trip('d', 'draft', '2026-09-03T00:00:00Z', 999),
    trip('e', 'cancelled', '2026-09-04T00:00:00Z', 999),
    trip('f', 'sent', '2026-09-05T00:00:00Z', 999),
  ]

  it('converts only won trips, each exactly once', () => {
    const convert = vi.fn((r: (typeof rows)[number]) => (r.amount < 0 ? null : r.amount))
    summariseItineraries(rows, convert, range)
    expect(convert.mock.calls.map(c => c[0].id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('makes the weekly chart sum to Total Revenue', () => {
    const s = summariseItineraries(rows, r => (r.amount < 0 ? null : r.amount), range)
    expect(s.totalRevenue).toBe(400)
    expect(s.weekly.reduce((sum, w) => sum + w.revenue, 0)).toBe(s.totalRevenue)
    expect(s.avgDealSize).toBe(200)
    expect(s.conversionRate).toBe(50)
    expect(s.bookings).toEqual({ total: 6, confirmed: 2, completed: 1, cancelled: 1, pending: 2 })
  })

  it('names a real week as the busiest one', () => {
    const s = summariseItineraries(rows, r => (r.amount < 0 ? null : r.amount), range)
    const busiest = s.weekly.reduce((a, b) => (b.revenue > a.revenue ? b : a))
    expect(busiest).toEqual({ month: '2026-09-14', revenue: 300 })
  })
})
