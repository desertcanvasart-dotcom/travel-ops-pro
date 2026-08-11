import { describe, it, expect } from 'vitest'
import {
  buildFxIndex,
  resolveRateOnDate,
  convertOnDate,
  roundMoney,
  emptyFxSummary,
  tallyFx,
  mergeFxSummary,
  describeConversion,
  type FxSnapshotRow,
} from '@/lib/fx-conversion'
import {
  addToTotals,
  sumByCurrency,
  formatTotals,
  formatMoney,
  currencyDecimals,
} from '@/lib/currency-totals'
import { buildSnapshotRows } from '@/lib/currency-service'

// ============================================
// The invariant under test: a conversion that cannot be backed by a real rate
// is NEVER guessed and NEVER passed through at face value. Everything else here
// is about picking the RIGHT rate — the one from the transaction's own date.
// ============================================

const snap = (
  base: string,
  target: string,
  rate: number,
  capturedAt: string,
  source = 'er-api'
): FxSnapshotRow => ({
  base_currency: base,
  target_currency: target,
  rate,
  captured_at: capturedAt,
  source,
})

// EGP weakened against EUR through 2026 — the whole point of dated rates.
const HISTORY: FxSnapshotRow[] = [
  snap('EUR', 'EGP', 50, '2026-01-15T01:00:00Z'),
  snap('EUR', 'EGP', 53, '2026-03-15T01:00:00Z'),
  snap('EUR', 'EGP', 56, '2026-06-15T01:00:00Z'),
  snap('EUR', 'USD', 1.1, '2026-01-15T01:00:00Z'),
  snap('EUR', 'USD', 1.18, '2026-06-15T01:00:00Z'),
  snap('EUR', 'JPY', 170, '2026-01-15T01:00:00Z'),
  snap('EUR', 'JPY', 178.5, '2026-06-15T01:00:00Z'),
]

describe('buildFxIndex', () => {
  it('drops rows that cannot be trusted', () => {
    const index = buildFxIndex([
      snap('EUR', 'EGP', 56, '2026-06-15T01:00:00Z'),
      snap('EUR', 'EGP', 0, '2026-06-16T01:00:00Z'),          // zero rate
      snap('EUR', 'EGP', -5, '2026-06-17T01:00:00Z'),         // negative
      snap('EUR', 'EGP', NaN, '2026-06-18T01:00:00Z'),        // not a number
      snap('EUR', 'EGP', 56, 'not-a-date'),                   // bad timestamp
      snap('EUR', 'EUR', 1, '2026-06-15T01:00:00Z'),          // same currency
      snap('', 'EGP', 56, '2026-06-15T01:00:00Z'),            // missing base
    ])
    // Only the one good row survived, so the newest usable rate is still 56.
    const resolved = resolveRateOnDate(index, 'EUR', 'EGP', '2026-12-31')
    expect(resolved?.rate).toBe(56)
  })

  it('accepts postgres numeric strings', () => {
    const index = buildFxIndex([
      { base_currency: 'EUR', target_currency: 'EGP', rate: '56.25', captured_at: '2026-06-15T01:00:00Z' },
    ])
    expect(resolveRateOnDate(index, 'EUR', 'EGP', '2026-07-01')?.rate).toBe(56.25)
  })
})

describe('resolveRateOnDate — the rate on the day the money moved', () => {
  const index = buildFxIndex(HISTORY)

  it('uses the rate in force on the transaction date, not the newest', () => {
    expect(resolveRateOnDate(index, 'EUR', 'EGP', '2026-02-01')?.rate).toBe(50)
    expect(resolveRateOnDate(index, 'EUR', 'EGP', '2026-04-01')?.rate).toBe(53)
    expect(resolveRateOnDate(index, 'EUR', 'EGP', '2026-08-01')?.rate).toBe(56)
  })

  it('returns null before any rate was ever captured', () => {
    // A cost predating the rate history is a hole, not the oldest rate.
    expect(resolveRateOnDate(index, 'EUR', 'EGP', '2025-12-01')).toBeNull()
  })

  it('uses the newest rate when no date is given', () => {
    expect(resolveRateOnDate(index, 'EUR', 'EGP', null)?.rate).toBe(56)
  })

  it('inverts a stored pair exactly rather than calling it missing', () => {
    const resolved = resolveRateOnDate(index, 'EGP', 'EUR', '2026-04-01')
    expect(resolved?.rate).toBeCloseTo(1 / 53, 12)
  })

  it('crosses through a pivot when no direct pair exists (USD→EGP via EUR)', () => {
    const resolved = resolveRateOnDate(index, 'USD', 'EGP', '2026-08-01')
    // 1 USD = (1/1.18) EUR = 56/1.18 EGP
    expect(resolved?.rate).toBeCloseTo(56 / 1.18, 8)
    expect(resolved?.via).toBe('EUR')
  })

  it('crosses JPY→EGP through EUR', () => {
    const resolved = resolveRateOnDate(index, 'JPY', 'EGP', '2026-08-01')
    expect(resolved?.rate).toBeCloseTo(56 / 178.5, 8)
  })

  it('reports a cross rate as only as fresh as its staler leg', () => {
    // At 2026-04-01 the EGP leg is March's but the USD leg is January's.
    const resolved = resolveRateOnDate(index, 'USD', 'EGP', '2026-04-01')
    expect(resolved?.asOf).toBe('2026-01-15T01:00:00Z')
  })

  it('is 1 for identical currencies', () => {
    expect(resolveRateOnDate(index, 'EUR', 'EUR', '2026-04-01')?.rate).toBe(1)
  })

  it('returns null for a currency it has never seen', () => {
    expect(resolveRateOnDate(index, 'EUR', 'CHF', '2026-08-01')).toBeNull()
  })
})

describe('convertOnDate — never guesses', () => {
  const index = buildFxIndex(HISTORY)

  it('converts at the historical rate and says so', () => {
    const result = convertOnDate(index, 1000, 'EGP', 'EUR', '2026-04-01')
    expect(result.basis).toBe('historical')
    expect(result.amount).toBeCloseTo(18.87, 2) // 1000/53
  })

  it('returns basis none and a NULL amount when no rate exists', () => {
    const result = convertOnDate(index, 1000, 'EGP', 'EUR', '2025-01-01')
    expect(result.basis).toBe('none')
    // The bug this prevents: 1000 EGP silently becoming "1000 EUR".
    expect(result.amount).toBeNull()
    expect(result.amount).not.toBe(1000)
  })

  it('falls back to a live rate only when no snapshot is old enough', () => {
    const result = convertOnDate(index, 1000, 'EGP', 'EUR', '2025-01-01', () => 1 / 60)
    expect(result.basis).toBe('live')
    expect(result.amount).toBeCloseTo(16.67, 2)
  })

  it('ignores a live resolver that returns nothing usable', () => {
    for (const bad of [null, 0, -1, NaN, Infinity]) {
      const result = convertOnDate(index, 1000, 'EGP', 'EUR', '2025-01-01', () => bad as number)
      expect(result.basis).toBe('none')
      expect(result.amount).toBeNull()
    }
  })

  it('needs no rate for a same-currency amount', () => {
    const result = convertOnDate(index, 1000, 'EUR', 'EUR', '2025-01-01')
    expect(result.basis).toBe('same-currency')
    expect(result.amount).toBe(1000)
  })

  it('treats a non-finite amount as unconvertible, not as zero', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const result = convertOnDate(index, bad, 'EGP', 'EUR', '2026-04-01')
      expect(result.basis).toBe('none')
      expect(result.amount).toBeNull()
    }
  })

  it('is case- and whitespace-insensitive about currency codes', () => {
    const result = convertOnDate(index, 100, ' egp ', 'eur', '2026-04-01')
    expect(result.basis).toBe('historical')
    expect(result.amount).toBeCloseTo(1.89, 2)
  })

  it('shows the real cost of using the wrong date', () => {
    // Same 56,000 EGP hotel bill, paid in January vs June.
    const jan = convertOnDate(index, 56000, 'EGP', 'EUR', '2026-02-01')
    const jun = convertOnDate(index, 56000, 'EGP', 'EUR', '2026-08-01')
    expect(jan.amount).toBe(1120) // at 50
    expect(jun.amount).toBe(1000) // at 56
    // €120 of margin difference on one line — the reason dated rates matter.
    expect(jan.amount! - jun.amount!).toBe(120)
  })
})

describe('roundMoney', () => {
  it('rounds a true half away from zero, symmetrically', () => {
    // 1.125 and 2.5 cents are exactly representable, so this really does
    // exercise the tie-breaking rule. (1.005 would not: it is stored as
    // slightly less than 1.005, so any correct implementation yields 1.00.)
    expect(roundMoney(1.125)).toBe(1.13)
    expect(roundMoney(-1.125)).toBe(-1.13)
    expect(roundMoney(0.025)).toBe(0.03)
    expect(roundMoney(-0.025)).toBe(-0.03)
  })

  it('never produces negative zero, which renders as "-0.00"', () => {
    expect(roundMoney(-0.001)).toBe(0)
    expect(Object.is(roundMoney(-0.001), -0)).toBe(false)
  })
})

describe('FxSummary tallies', () => {
  it('marks a report non-authoritative on live or unconverted lines', () => {
    const fx = emptyFxSummary()
    tallyFx(fx, 'historical')
    tallyFx(fx, 'same-currency')
    expect(fx.all_historical).toBe(true)

    tallyFx(fx, 'live')
    expect(fx.all_historical).toBe(false)
    expect(fx.live).toBe(1)

    const other = emptyFxSummary()
    tallyFx(other, 'none')
    mergeFxSummary(fx, other)
    expect(fx.unconverted).toBe(1)
    expect(fx.all_historical).toBe(false)
  })
})

describe('describeConversion', () => {
  const index = buildFxIndex(HISTORY)

  it('names the date of the rate it used', () => {
    const conversion = convertOnDate(index, 1000, 'EGP', 'EUR', '2026-04-01')
    expect(describeConversion(conversion, 'EGP', 'EUR')).toContain('2026-03-15')
  })

  it('says plainly when an amount was excluded', () => {
    const conversion = convertOnDate(index, 1000, 'EGP', 'EUR', '2025-01-01')
    expect(describeConversion(conversion, 'EGP', 'EUR')).toContain('excluded from totals')
  })
})

describe('per-currency totals', () => {
  it('keeps currencies separate instead of inventing a merged number', () => {
    const totals = sumByCurrency(
      [
        { amount: 10000, currency: 'USD' },
        { amount: 5000, currency: 'GBP' },
        { amount: 2400, currency: 'EUR' },
        { amount: 100, currency: 'EUR' },
      ],
      i => i.amount,
      i => i.currency
    )
    expect(totals).toEqual({ USD: 10000, GBP: 5000, EUR: 2500 })
    // Not "$15,000" — the figure that is true in no currency.
    expect(formatTotals(totals)).toBe('$10,000.00 + £5,000.00 + €2,500.00')
  })

  it('rounds JPY to whole yen and others to cents', () => {
    expect(currencyDecimals('JPY')).toBe(0)
    expect(currencyDecimals('EUR')).toBe(2)
    expect(formatMoney(1200, 'JPY')).toBe('¥1,200')
    expect(formatMoney(1200, 'EUR')).toBe('€1,200.00')

    const totals = {}
    addToTotals(totals, 1200.4, 'JPY')
    addToTotals(totals, 0.6, 'JPY')
    expect(totals).toEqual({ JPY: 1201 })
  })

  it('falls back to EUR for a blank or malformed currency', () => {
    const totals = {}
    addToTotals(totals, 100, null)
    addToTotals(totals, 50, 'not-a-code')
    expect(totals).toEqual({ EUR: 150 })
  })

  it('shows a single zero rather than a blank tile', () => {
    expect(formatTotals({})).toBe('€0.00')
    expect(formatTotals({ EUR: 0, USD: 0 })).toBe('€0.00')
    expect(formatTotals({}, { defaultCurrency: 'JPY' })).toBe('¥0')
  })
})

describe('buildSnapshotRows', () => {
  it('dedupes by pair so one batch cannot violate the unique index', () => {
    const rows = buildSnapshotRows(
      [
        { base_currency: 'EUR', target_currency: 'EGP', rate: 56 },
        { base_currency: 'eur', target_currency: 'egp', rate: 56.1 },
        { base_currency: 'EUR', target_currency: 'USD', rate: 1.18 },
      ],
      '2026-08-11T01:00:00Z'
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ base_currency: 'EUR', target_currency: 'EGP', rate: 56 })
  })

  it('refuses to store a rate that would poison future conversions', () => {
    const rows = buildSnapshotRows(
      [
        { base_currency: 'EUR', target_currency: 'EGP', rate: 0 },
        { base_currency: 'EUR', target_currency: 'USD', rate: -1 },
        { base_currency: 'EUR', target_currency: 'GBP', rate: NaN },
        { base_currency: 'EUR', target_currency: 'EUR', rate: 1 },
        { base_currency: 'EUR', target_currency: 'JPY', rate: 178.5 },
      ],
      '2026-08-11T01:00:00Z'
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].target_currency).toBe('JPY')
  })
})
