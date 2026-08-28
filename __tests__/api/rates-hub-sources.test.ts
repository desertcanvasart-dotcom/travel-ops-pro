import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// The rates hub must read RATE tables, never the supplier CONTACT directory.
//
// /api/rates?type=accommodation used to select from `hotel_contacts`, and
// ?type=meal from `restaurant_contacts` — the agency's directory of hotels
// and restaurants with their phone numbers — and hand each row back as a rate
// with base_rate_eur: 0. So the hub advertised 13 hotels and 26 meals that
// were contact cards priced at zero, while the hotels and meals rate pages,
// which read the real tables, correctly showed nothing. The operator read
// that as phantom data and asked for it to be deleted; deleting it would
// have destroyed live supplier contacts that tour day-plans reference by
// foreign key.
// ============================================================================

const raw = fs.readFileSync(
  path.join(process.cwd(), 'app/api/rates/route.ts'),
  'utf8'
)

/** Code only. A substring check on the whole file flags the comments that
 *  explain why the old source was abandoned — the documentation would fail
 *  the test it exists to describe. */
const source = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(line => !line.trim().startsWith('//'))
  .join('\n')

/** The block handling one `case '<type>':` in the route's switch. */
function caseBlock(type: string): string {
  const start = source.indexOf(`case '${type}':`)
  expect(start, `case '${type}' must exist`).toBeGreaterThan(-1)
  const next = source.indexOf('case ', start + 10)
  return source.slice(start, next === -1 ? source.length : next)
}

describe('rates hub data sources', () => {
  it('accommodation reads accommodation_rates, never hotel_contacts', () => {
    const block = caseBlock('accommodation')
    expect(block).toContain("from('accommodation_rates')")
    expect(block).not.toContain("from('hotel_contacts')")
  })

  it('meals read meal_rates, never restaurant_contacts', () => {
    const block = caseBlock('meal')
    expect(block).toContain("from('meal_rates')")
    expect(block).not.toContain("from('restaurant_contacts')")
  })

  it('no rate type fabricates a zero price for a row that carries none', () => {
    // A literal `base_rate_eur: 0` in this route means a record with no price
    // is being presented as one that costs nothing.
    expect(source).not.toMatch(/base_rate_eur:\s*0\b/)
    expect(source).not.toMatch(/eur_rate:\s*0\b/)
  })

  it('the contact tables are not read by this route at all', () => {
    expect(source).not.toContain('hotel_contacts')
    expect(source).not.toContain('restaurant_contacts')
  })
})
