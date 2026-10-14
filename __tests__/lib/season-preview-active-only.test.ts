// The Pricing Grid previewed every season's premium, inactive ones included,
// while the save (and every other engine) charges active seasons only: a
// switched-off "Golden Week +15%" showed a total the saved trip did not carry.
import { describe, it, expect } from 'vitest'
import { activeSeasonWindows, seasonForDate } from '@/lib/pricing/season-uplift'

const API = [
  { id: 's1', name: 'Golden Week', uplift_percent: '15.00', is_active: false,
    pricing_season_dates: [{ start_date: '2027-04-29', end_date: '2027-05-05' }] },
  { id: 's2', name: 'Obon', uplift_percent: 10, is_active: true,
    pricing_season_dates: [{ start_date: '2027-08-13', end_date: '2027-08-16' }] },
]

describe('activeSeasonWindows', () => {
  it('leaves inactive seasons out, so a departure inside one gets no premium', () => {
    const windows = activeSeasonWindows(API)
    expect(windows.map(w => w.seasonId)).toEqual(['s2'])
    expect(seasonForDate(windows, '2027-05-01')).toBeNull()
  })
  it('keeps active seasons with their premium', () => {
    expect(seasonForDate(activeSeasonWindows(API), '2027-08-14')).toEqual({ seasonId: 's2', name: 'Obon', upliftPercent: 10 })
  })
  it('the Pricing Grid page builds its windows with it', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('app/pricing-grid/page.tsx', 'utf8')
    expect(src).toContain('setSeasonWindows(activeSeasonWindows(data.data || []))')
  })
})
