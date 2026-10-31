// ============================================
// Analytics route + page: wiring that cannot be exercised without a browser
// ============================================
// The arithmetic is tested in __tests__/lib/analytics-metrics.test.ts. These
// source checks pin the wiring around it: the route converts each won trip
// once and keeps the previous period's FX holes out of the banner; the page
// shows a failed load as a failure, labels growth from zero as a dash, and no
// longer carries a dead status filter or a hard-coded "best channel".

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const strip = (src: string) =>
  src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
const route = strip(readFileSync(join(process.cwd(), 'app/api/analytics/route.ts'), 'utf8'))
const page = strip(readFileSync(join(process.cwd(), 'app/reports/_views/AnalyticsView.tsx'), 'utf8'))

describe('analytics route wiring', () => {
  it('derives bookings, revenue and the weekly chart from one summariseItineraries pass', () => {
    expect(route).toContain('summariseItineraries(itineraries, makeConverter(fx, fxHoles)')
    // The second confirmed-only query re-converted every won trip.
    expect(route.match(/\.from\('itineraries'\)/g)).toHaveLength(2)
  })

  it('converts the previous period into its own accumulator, not the reported fxHoles', () => {
    expect(route).toMatch(/makeConverter\(emptyFxSummary\(\), \[\]\)/)
    expect(route.match(/makeConverter\([^)]*fxHoles\)/g)).toHaveLength(1)
  })

  it('no longer counts statuses itineraries never have', () => {
    expect(route).not.toMatch(/'quoted'/)
  })
})

describe('analytics page honesty', () => {
  it('keeps an error state instead of replacing a failed load with zeros', () => {
    expect(page).toContain('setLoadError(')
    expect(page).not.toMatch(/setAnalytics\(emptyData\)/)
    expect(page).toContain("t('error.title')")
  })

  it('shows a dash when growth is null', () => {
    expect(page).toMatch(/revenue\.growth === null \?/)
  })

  it('includes Completed in the Booking Status pie', () => {
    expect(page).toMatch(/statusSlices = \[[\s\S]*?pipeline\.completed[\s\S]*?\]/)
    expect(page).toContain('data={statusSlices}')
  })

  it('has no dead status filter and no hard-coded best channel', () => {
    expect(page).not.toContain('statusFilter')
    expect(page).not.toContain('WhatsApp')
    expect(page).not.toContain('bestChannel')
  })

  it('uses keys that exist in both locales', () => {
    const en = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8')).analytics
    const ja = JSON.parse(readFileSync(join(process.cwd(), 'messages/ja.json'), 'utf8')).analytics
    for (const key of [...page.matchAll(/\bt\('([\w.]+)'/g)].map(m => m[1])) {
      const get = (o: unknown) => key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o)
      expect(get(en), `en analytics.${key}`).toBeTypeOf('string')
      expect(get(ja), `ja analytics.${key}`).toBeTypeOf('string')
    }
    expect(en.highlights.title).not.toMatch(/month/i)
    expect(ja.highlights.title).not.toContain('今月')
  })
})
