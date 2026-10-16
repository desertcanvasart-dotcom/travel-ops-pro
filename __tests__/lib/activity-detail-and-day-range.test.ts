// The Activity Log's two pure pieces: the before/after detail routes record,
// and the From/To filter read as the viewer's local days.
import { describe, it, expect } from 'vitest'
import { diffChanges, dateRange, readDetail } from '@/lib/activity-detail'
import { dayRangeIn, startOfDayIn } from '@/lib/activity-day-range'

describe('diffChanges', () => {
  it('keeps only the fields that changed, with both values', () => {
    expect(diffChanges({ role: 'agent', is_active: true }, { role: 'admin', is_active: true }, ['role', 'is_active']))
      .toEqual([{ field: 'role', from: 'agent', to: 'admin' }])
  })
  it('reads a numeric column that PostgREST returns as text as a number', () => {
    expect(diffChanges({ uplift_percent: '15.00' }, { uplift_percent: 18 }, ['uplift_percent']))
      .toEqual([{ field: 'uplift_percent', from: 15, to: 18 }])
    expect(diffChanges({ uplift_percent: '15.00' }, { uplift_percent: 15 }, ['uplift_percent'])).toEqual([])
  })
  it('a missing before is null', () => {
    expect(diffChanges(null, { name: 'Obon' }, ['name'])).toEqual([{ field: 'name', from: null, to: 'Obon' }])
  })
})

describe('dateRange / readDetail', () => {
  it('formats a window and nothing for no window', () => {
    expect(dateRange('2027-04-29', '2027-05-05T00:00:00')).toBe('2027-04-29 – 2027-05-05')
    expect(dateRange(null, '2027-05-05')).toBeNull()
  })
  it('reads a stored detail and ignores older rows and junk', () => {
    expect(readDetail({ target: 'a@b', changes: [{ field: 'role', from: 'agent', to: 'admin' }, { nope: 1 }] }))
      .toEqual({ target: 'a@b', changes: [{ field: 'role', from: 'agent', to: 'admin' }] })
    expect(readDetail(null)).toBeNull()
    expect(readDetail({ target: 'x' })).toBeNull()
  })
})

describe('From/To in the viewer’s time zone', () => {
  it('Tokyo: 14 October runs from 13 Oct 15:00Z to 14 Oct 15:00Z', () => {
    expect(dayRangeIn('2026-10-14', '2026-10-14', 'Asia/Tokyo')).toEqual({
      gte: '2026-10-13T15:00:00.000Z',
      lt: '2026-10-14T15:00:00.000Z',
    })
  })
  it('Cairo in summer time (+3) and New York (-4)', () => {
    expect(startOfDayIn('2026-07-01', 'Africa/Cairo')).toBe('2026-06-30T21:00:00.000Z')
    expect(startOfDayIn('2026-07-01', 'America/New_York')).toBe('2026-07-01T04:00:00.000Z')
  })
  it('a daylight-saving changeover day starts at the local midnight', () => {
    // New York leaves summer time at 02:00 on 1 Nov 2026; midnight is still -4.
    expect(startOfDayIn('2026-11-01', 'America/New_York')).toBe('2026-11-01T04:00:00.000Z')
    expect(startOfDayIn('2026-11-02', 'America/New_York')).toBe('2026-11-02T05:00:00.000Z')
  })
  it('no zone or an unknown one is UTC days, as before', () => {
    expect(dayRangeIn('2026-10-14', '2026-10-14', null)).toEqual({
      gte: '2026-10-14T00:00:00.000Z',
      lt: '2026-10-15T00:00:00.000Z',
    })
    expect(dayRangeIn('2026-10-14', null, 'Not/AZone')).toEqual({ gte: '2026-10-14T00:00:00.000Z', lt: null })
  })
  it('ignores a date that is not YYYY-MM-DD', () => {
    expect(dayRangeIn('14/10/2026', 'x', 'Asia/Tokyo')).toEqual({ gte: null, lt: null })
  })
})
