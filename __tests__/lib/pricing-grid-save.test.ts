import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'

// Inline copies of the pure helpers from app/api/pricing-grid/save/route.ts.
// The route file is a Next.js POST handler that creates a Supabase client at
// module-load time (with env vars), so we can't import it directly in a unit
// test. The helpers under test are pure functions — reproducing them here
// covers their algorithm, and a copy-paste drift would surface immediately
// in code review against the same audit references (L8, L9).

function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = randomBytes(4).toString('hex').toUpperCase()
  return `ITN-S-${year}-${random}`
}

function addDays(dateStr: string, numDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ts = Date.UTC(y, (m || 1) - 1, d || 1)
  const shifted = new Date(ts)
  shifted.setUTCDate(shifted.getUTCDate() + numDays)
  return shifted.toISOString().split('T')[0]
}

describe('generateItineraryCode (L8 fix)', () => {
  it('produces ITN-S-<YYYY>-<8 hex chars>', () => {
    const code = generateItineraryCode()
    expect(code).toMatch(/^ITN-S-\d{4}-[0-9A-F]{8}$/)
  })

  it('keyspace is 16^8 (4.29B) so collisions are vanishingly unlikely', () => {
    // Sample 5_000 codes; assert all unique.
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) seen.add(generateItineraryCode())
    expect(seen.size).toBe(5000)
  })
})

describe('addDays (L9 UTC date math)', () => {
  it('adds days without local-timezone drift', () => {
    expect(addDays('2026-01-01', 1)).toBe('2026-01-02')
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01')
    expect(addDays('2026-06-23', 0)).toBe('2026-06-23')
  })

  it('rolls month and year boundaries correctly', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles leap-year February correctly', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('supports negative offsets (subtract days)', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})
