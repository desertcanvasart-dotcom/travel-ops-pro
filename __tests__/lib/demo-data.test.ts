// The 29 August QA audit's headline Critical (AUT-C01/C02) was
// "Total Revenue ¥1,099,897 + €5,953.88 + $3,000.00". Checked against
// production, two of those three numbers are seeded fixtures and one is real:
//
//   ¥1,099,897  DEMO-PORTAL-001   fixture  (= INV-DEMO-0001 219,980 + INV-DEMO-0002 879,917)
//   $3,000      DEMO-EXT-2026-001 fixture
//   €5,953.88   ITN-S-2026-4801   REAL — "S = from pricing grid", a real trip
//
// These tests exist to keep that distinction exact. Getting it wrong in either
// direction is bad: counting fixtures as revenue is what produced the audit,
// and excluding ITN-S-* would erase real trading.
import { describe, it, expect } from 'vitest'
import {
  DEMO_CODE_PREFIXES,
  excludeDemoLinked,
  isDemoCode,
  partitionDemoRows,
} from '@/lib/demo-data'

describe('isDemoCode', () => {
  it('recognises the fixture families that actually exist in production', () => {
    expect(isDemoCode('DEMO-EXT-2026-001')).toBe(true)
    expect(isDemoCode('DEMO-PORTAL-001')).toBe(true)
    expect(isDemoCode('DEMO-2026-0001')).toBe(true)
  })

  it('does NOT match E2E-SMOKE-*, which lives in another org and is asserted on', () => {
    // Org scoping already keeps it out of the operator's totals, and
    // e2e/smoke.authed.spec.ts asserts the P&L still returns it — that
    // assertion is the regression guard for "P&L lost its org filter".
    expect(isDemoCode('E2E-SMOKE-001')).toBe(false)
  })

  it('does NOT match ITN-S-*, which is a real trip from the pricing grid', () => {
    // €5,953.88 of the audit's headline figure is one of these. Excluding it
    // would delete real revenue from every report.
    expect(isDemoCode('ITN-S-2026-4801')).toBe(false)
    expect(isDemoCode('ITN-S-2026-680')).toBe(false)
  })

  it('does not match ordinary trip codes', () => {
    expect(isDemoCode('ITN-2026-3438')).toBe(false)
    expect(isDemoCode('B2C-MTDIZV4J')).toBe(false)
  })

  it('does not match a code that merely contains DEMO', () => {
    // INV-DEMO-0001 belongs to the portal fixture, but it is an INVOICE
    // number, not an itinerary code — invoice numbers are matched by
    // itinerary linkage, never by their own text.
    expect(isDemoCode('INV-DEMO-0001')).toBe(false)
  })

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(isDemoCode('  demo-ext-1  ')).toBe(true)
  })

  it('survives a non-string', () => {
    for (const v of [null, undefined, 42, {}, []]) expect(isDemoCode(v)).toBe(false)
  })

  it('every declared prefix is actually matched', () => {
    for (const p of DEMO_CODE_PREFIXES) expect(isDemoCode(`${p}something`)).toBe(true)
  })
})

describe('partitionDemoRows', () => {
  const rows = [
    { itinerary_code: 'DEMO-PORTAL-001', total: 1099897 },
    { itinerary_code: 'DEMO-EXT-2026-001', total: 3000 },
    { itinerary_code: 'ITN-S-2026-4801', total: 5953.88 },
  ]

  it('keeps the real trip and holds back the two fixtures', () => {
    const { real, exclusion } = partitionDemoRows(rows, r => r.itinerary_code)
    expect(real.map(r => r.itinerary_code)).toEqual(['ITN-S-2026-4801'])
    expect(exclusion.excluded).toBe(2)
    expect(exclusion.codes).toContain('DEMO-PORTAL-001')
  })

  it('the surviving total is the real one — the audit figure minus the fixtures', () => {
    const { real } = partitionDemoRows(rows, r => r.itinerary_code)
    expect(real.reduce((sum, r) => sum + r.total, 0)).toBeCloseTo(5953.88, 2)
  })

  it('reports the exclusion so a changed total can be explained', () => {
    // A total that quietly changed is how the contradictory-figures problem
    // started. Silence is the bug.
    const { exclusion } = partitionDemoRows(rows, r => r.itinerary_code)
    expect(exclusion.codes).toHaveLength(exclusion.excluded)
  })

  it('an unfiltered set reports zero exclusions, not a missing field', () => {
    const { real, exclusion } = partitionDemoRows(
      [{ itinerary_code: 'ITN-2026-1' }],
      r => r.itinerary_code,
    )
    expect(real).toHaveLength(1)
    expect(exclusion).toEqual({ excluded: 0, codes: [] })
  })

  it('handles null and undefined input', () => {
    expect(partitionDemoRows(null, () => 'x').real).toEqual([])
    expect(partitionDemoRows(undefined, () => 'x').exclusion.excluded).toBe(0)
  })
})

describe('excludeDemoLinked', () => {
  const demoIds = new Set(['demo-itin-1'])

  it('drops an invoice belonging to a fixture trip', () => {
    // INV-DEMO-0001 is ¥219,980 marked paid with no payment behind it — the
    // "invoice says paid, payments says zero" contradiction in AUT-C01.
    const { real, exclusion } = excludeDemoLinked(
      [
        { itinerary_id: 'demo-itin-1', balance_due: 219980 },
        { itinerary_id: 'real-itin-9', balance_due: 500 },
      ],
      demoIds,
    )
    expect(real).toHaveLength(1)
    expect(real[0].balance_due).toBe(500)
    expect(exclusion.excluded).toBe(1)
  })

  it('KEEPS a row with no itinerary — an unlinked expense is still real money', () => {
    const { real } = excludeDemoLinked([{ itinerary_id: null, amount: 10 }], demoIds)
    expect(real).toHaveLength(1)
  })

  it('an empty fixture set changes nothing', () => {
    const rows = [{ itinerary_id: 'demo-itin-1' }, { itinerary_id: 'x' }]
    expect(excludeDemoLinked(rows, new Set()).real).toHaveLength(2)
  })
})
