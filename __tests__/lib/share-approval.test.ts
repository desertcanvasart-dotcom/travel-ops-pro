// A share link records which gaps the operator approved; the public page shows
// the price only while every current gap is one of them.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sharePriceDecision, toApprovedGaps, unapprovedGaps } from '@/lib/itineraries/share-approval'
import { itineraryServiceLines } from '@/lib/pricing/itinerary-completeness'

const lines = (days: Parameters<typeof itineraryServiceLines>[0]) => ({ ok: true as const, lines: itineraryServiceLines(days) })

const TWO_GAPS = lines([
  { day_number: 1, services: [{ service_name: 'Hotel', rate_eur: 80, total_cost: 160 }, { service_name: 'Airport transfer', rate_eur: 0, total_cost: 0 }] },
  { day_number: 2, services: [{ service_name: 'Lunch', rate_eur: 0, total_cost: 0 }] },
])
const base = { status: 'sent', totalCost: 1200, currency: 'EUR' }

describe('unapprovedGaps', () => {
  const gaps = [{ day: 1, name: 'Airport transfer', issue: 'x' }, { day: 2, name: 'Lunch', issue: 'x' }]

  it('nothing approved covers nothing', () => {
    expect(unapprovedGaps(gaps, null)).toHaveLength(2)
    expect(unapprovedGaps(gaps, 'garbage')).toHaveLength(2)
  })

  it('matches by day and name, ignoring case and the reason', () => {
    expect(unapprovedGaps(gaps, [{ day: 1, name: 'airport transfer' }, { day: 2, name: 'Lunch' }])).toEqual([])
  })

  it('the same service on another day is a new gap', () => {
    expect(unapprovedGaps(gaps, [{ day: 1, name: 'Airport transfer' }, { day: 3, name: 'Lunch' }]).map(g => g.day)).toEqual([2])
  })

  it('round-trips the stored record', () => {
    expect(unapprovedGaps(gaps, JSON.parse(JSON.stringify(toApprovedGaps(gaps))))).toEqual([])
  })
})

describe('sharePriceDecision', () => {
  it('shows the price for a complete itinerary without any approval', () => {
    const complete = lines([{ day_number: 1, services: [{ service_name: 'Hotel', rate_eur: 80, total_cost: 160 }] }])
    expect(sharePriceDecision({ ...base, lines: complete, approvedGaps: null })).toEqual({ show: true })
  })

  it('shows the price when every gap was approved', () => {
    const approved = [{ day: 1, name: 'Airport transfer' }, { day: 2, name: 'Lunch' }]
    expect(sharePriceDecision({ ...base, lines: TWO_GAPS, approvedGaps: approved })).toEqual({ show: true })
  })

  it('withholds the price when a gap appeared after approval, naming it', () => {
    const d = sharePriceDecision({ ...base, lines: TWO_GAPS, approvedGaps: [{ day: 1, name: 'Airport transfer' }] })
    expect(d).toMatchObject({ show: false, reason: 'new_gaps' })
    expect(d.show === false && d.gaps?.map(g => g.name)).toEqual(['Lunch'])
  })

  it('withholds the price on a link shared before approvals were recorded, once a gap exists', () => {
    expect(sharePriceDecision({ ...base, lines: TWO_GAPS, approvedGaps: undefined })).toMatchObject({ show: false, reason: 'new_gaps' })
  })

  it('fails closed when the services could not be read', () => {
    expect(sharePriceDecision({ ...base, lines: { ok: false, status: 503, error: 'x' }, approvedGaps: null }))
      .toEqual({ show: false, reason: 'unchecked' })
  })

  it('withholds the price for a draft and for a broken amount', () => {
    const complete = lines([])
    expect(sharePriceDecision({ ...base, status: 'draft', lines: complete, approvedGaps: null })).toMatchObject({ reason: 'draft' })
    expect(sharePriceDecision({ ...base, totalCost: 0, lines: complete, approvedGaps: null })).toMatchObject({ reason: 'amount' })
    expect(sharePriceDecision({ ...base, totalCost: '950.00', lines: complete, approvedGaps: null })).toEqual({ show: true })
  })
})

describe('wiring', () => {
  const route = readFileSync('app/api/itineraries/[id]/share/route.ts', 'utf8')
  const page = readFileSync('app/share/[token]/page.tsx', 'utf8')
  const migration = readFileSync('migrations/20261014_share_incomplete_approval.sql', 'utf8')

  it('the share route records the approval on new and existing links', () => {
    expect(route).toContain('toApprovedGaps(gaps)')
    expect(route).toMatch(/\.update\(approval\)\s*\.eq\('id', existing\.id\)/)
    expect(route).toContain('...approval,')
  })

  it('the public page re-checks on every view and renders no total when withheld', () => {
    expect(page).toContain('sharePriceDecision(')
    expect(page).toContain('approvedGaps: share.incomplete_approved_gaps')
    expect(page).toContain('!priceWithheld && it.totalPrice !== null')
    // A column list would 404 every link if the migration lagged the deploy.
    expect(page).toMatch(/from\('itinerary_shares'\)[\s\S]*?\.select\('\*'\)/)
  })

  it('the migration adds the three columns idempotently', () => {
    for (const col of ['incomplete_approved_gaps jsonb', 'incomplete_approved_at timestamptz', 'incomplete_approved_by uuid']) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${col}`)
    }
  })
})
