// ============================================
// Analytics reads columns that actually exist
// ============================================
// This route has now been wrong about the schema three separate times, and each
// time it failed SILENTLY because the query errors were discarded behind
// `|| []`: `itineraries.total_price` (it is total_cost) reported revenue as 0
// forever, `itineraries.cities` (it is destinations, and TEXT not an array)
// left top-destinations permanently empty, and `follow_ups` (it is
// client_followups) held the pipeline count at 0.
//
// The route fails loudly now, so a bad column is a visible 500 rather than a
// confident zero. But the rename that fixed total_price initially missed
// groupByWeek at the bottom of the same file — the headline figure was right
// while the trend chart underneath it silently summed `undefined` — and no
// amount of fail-loud helps when the value merely reads as absent.
//
// So: pin the dead names. Cheap, and it catches exactly the mistake that keeps
// being made here.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'app/api/analytics/route.ts'), 'utf8')

// Comments explain the history and legitimately name the dead columns.
const code = source
  .split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n')

describe('analytics route column names', () => {
  // Matched as a COLUMN reference — a property access or a name inside a
  // select()/from() string — not as any occurrence of the word. A local
  // variable may legitimately be called `cities`; a query may not.
  it.each([
    ['total_price', 'total_cost', /[.'"\s,]total_price\b/],
    ['cities', 'destinations', /\.cities\b|['"][^'"]*\bcities\b[^'"]*['"]/],
    ['follow_ups', 'client_followups', /from\(['"]follow_ups['"]\)/],
  ])('never queries the non-existent %s (use %s)', (dead, live, pattern) => {
    expect(code, `analytics still reads "${dead}" — the column/table is "${live}"`).not.toMatch(pattern)
  })

  it('actually reads the live names', () => {
    expect(code).toContain('total_cost')
    expect(code).toContain('destinations')
    expect(code).toContain('client_followups')
  })

  it('scopes every itineraries and clients query by org_id', () => {
    const queries = code.match(/\.from\('(itineraries|clients|client_followups)'\)[\s\S]{0,400}?(?=\n\n|\n\s*\/\/|$)/g) ?? []
    expect(queries.length, 'expected to find the analytics queries').toBeGreaterThan(0)
    for (const q of queries) {
      expect(q, `an analytics query is missing its org filter:\n${q}`).toMatch(/org_id/)
    }
  })
})
