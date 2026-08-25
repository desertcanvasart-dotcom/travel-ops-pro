// ============================================
// Analytics states one currency, or says what it left out
// ============================================
// The dashboard is org-wide and this org holds JPY, EUR and USD trips. It used
// to SUM total_cost raw across all of them, and the page then stamped the org's
// billing symbol on the result — ¥ on a number that was part euros. That was
// invisible for as long as revenue read 0 (it selected a column that does not
// exist); the moment revenue became real, so did the mis-addition.
//
// /api/financial-reports already had the answer — convert every line at the
// rate on its own date, and EXCLUDE what cannot be converted rather than adding
// it at face value — so analytics uses the same lib/fx-report layer. These tests
// pin the behaviour that layer must give it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFxIndex, convertOnDate, emptyFxSummary } from '@/lib/fx-conversion'
import { convertLine, buildFxMeta } from '@/lib/fx-report'

// Shaped like the real exchange_rate_snapshots rows (EUR-based, daily capture).
const SNAPSHOTS = [
  { base_currency: 'EUR', target_currency: 'JPY', rate: 185.603384, captured_at: '2026-08-24T01:00:01Z', source: 'ecb' },
  { base_currency: 'EUR', target_currency: 'USD', rate: 1.16798, captured_at: '2026-08-24T01:00:01Z', source: 'ecb' },
]
const index = buildFxIndex(SNAPSHOTS)

describe('analytics FX — mixed currencies become one number', () => {
  it('leaves an amount already in the reporting currency untouched', () => {
    const fx = emptyFxSummary()
    const r = convertLine(index, fx, {
      amount: 1_099_897, fromCurrency: 'JPY', toCurrency: 'JPY',
      date: '2026-08-24', kind: 'trip', reference: 'DEMO-PORTAL-001',
    })
    expect(r.hole).toBeNull()
    expect(r.amount).toBe(1_099_897)
  })

  it('converts a EUR trip into JPY instead of adding 5,953 to a yen total', () => {
    const fx = emptyFxSummary()
    const r = convertLine(index, fx, {
      amount: 5953.88, fromCurrency: 'EUR', toCurrency: 'JPY',
      date: '2026-08-25', kind: 'trip', reference: 'ITN-S-2026-4801',
    })
    expect(r.hole).toBeNull()
    // The bug being prevented: the raw number is ~185x too small in yen.
    expect(r.amount).toBeGreaterThan(1_000_000)
    expect(r.amount).toBeCloseTo(5953.88 * 185.603384, 0)
  })

  it('EXCLUDES a trip it cannot convert, rather than summing it at face value', () => {
    const fx = emptyFxSummary()
    const r = convertLine(index, fx, {
      amount: 5000, fromCurrency: 'EGP', toCurrency: 'JPY',
      date: '2026-08-24', kind: 'trip', reference: 'ITN-NO-RATE',
    })
    expect(r.amount).toBeNull()
    expect(r.hole).toMatchObject({ kind: 'trip', reference: 'ITN-NO-RATE' })
    // 5,000 EGP added to a yen total as "5,000" would be a ~12x understatement
    // of that trip; silently dropping it would overstate nothing but hide it.
    expect(r.hole?.message).toContain('excluded')
  })

  it('marks the report incomplete when anything was excluded', () => {
    const fx = emptyFxSummary()
    const clean = buildFxMeta('JPY', fx, [])
    expect(clean.complete).toBe(true)
    expect(clean.reporting_currency).toBe('JPY')

    const holed = buildFxMeta('JPY', fx, [{
      kind: 'trip', reference: 'X', amount: 1, fromCurrency: 'EGP',
      toCurrency: 'JPY', date: null, message: 'no rate',
    }])
    expect(holed.complete).toBe(false)
  })

  it('refuses to invent a rate for a date with no history behind it', () => {
    // A trip predating the first snapshot must not borrow a later rate.
    expect(convertOnDate(index, 100, 'EUR', 'JPY', '2020-01-01').amount).toBeNull()
  })

  it('will not reach FORWARD to a rate captured after the trip date', () => {
    // The snapshot lands at 01:00:01Z; a bare date parses to midnight, so the
    // rate is not yet in existence as far as that trip is concerned. Strict on
    // purpose — the alternative is back-dating today's rate onto old money.
    expect(convertOnDate(index, 100, 'EUR', 'JPY', '2026-08-24').amount).toBeNull()
    expect(convertOnDate(index, 100, 'EUR', 'JPY', '2026-08-24T02:00:00Z').amount).not.toBeNull()
  })

  it('is an identity for a trip already in the reporting currency, whatever the date', () => {
    // Why the live dashboard does not change today: its one confirmed trip is
    // JPY and the org reports in JPY, so no rate is consulted at all.
    expect(convertOnDate(index, 1_099_897, 'JPY', 'JPY', '2020-01-01').amount).toBe(1_099_897)
  })
})

describe('analytics route wiring', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/analytics/route.ts'), 'utf8')
  const code = source.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

  it('converts through lib/fx-report rather than summing raw', () => {
    expect(code).toContain('loadFxIndex')
    expect(code).toContain('convertLine')
    expect(code).toContain('buildFxMeta')
  })

  it('selects the currency of every itinerary it puts a number on', () => {
    for (const sel of code.match(/\.select\('[^']*total_cost[^']*'\)/g) ?? []) {
      expect(sel, `a money query omits currency, so it cannot be converted:\n${sel}`).toContain('currency')
    }
  })

  it('never folds a raw total_cost into a sum again', () => {
    expect(code).not.toMatch(/parseFloat\(\s*i(tinerary)?\.total_cost\s*\)/)
  })
})
