// A tier picker reads the agency's ladder, not a form-local list.
//
// Settings → Vocabulary → Service tiers lets the agency ADD a tier. The
// operator added "5 star" (12 Sep 2026) and it appeared nowhere: both the
// hotel and the cruise form mapped over their own TIER_OPTIONS_CONFIG — the
// four preset keys — and accommodation_rates carried a CHECK freezing the
// column to those same four, so even a hand-built request would have been
// refused. The vocabulary screen promises "every dropdown in the app
// follows"; these pin the two forms it names (hotel and cruise rates) and the
// schema to that promise.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const TIER_FORMS = [
  'app/rates/hotels/hotels-content.tsx',
  'app/rates/cruises/page.tsx',
]

describe('tier pickers read the vocabulary', () => {
  for (const rel of TIER_FORMS) {
    it(`${rel} builds its tier buttons from useTierOptions, not a form-local list`, () => {
      const src = read(rel)
      expect(src.includes('useTierOptions('), `${rel} must build its tier buttons from useTierOptions`).toBe(true)
      expect(
        /TIER_OPTIONS_CONFIG\.map\(/.test(src),
        `${rel} maps over TIER_OPTIONS_CONFIG — an agency-added tier can never appear`
      ).toBe(false)
    })
  }
})

describe('the schema does not freeze the tier list', () => {
  const migrations = readdirSync(join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).sort()
  const baseline = migrations.find(f => f.includes('baseline'))!
  const later = migrations.filter(f => f > baseline)
  // `CONSTRAINT x_tier_check CHECK ((tier = ANY (ARRAY[...` and the varchar
  // form `CHECK (((tier)::text = ANY ((ARRAY[...` — a fixed list either way.
  const FROZEN = /CONSTRAINT\s+(\w+_tier_check)\s+CHECK\s*\(+tier\)?(?:::text)?\s*=\s*ANY/

  it('every preset-only tier CHECK in the baseline is dropped by a later migration', () => {
    const frozen = [...read(join('migrations', baseline)).matchAll(new RegExp(FROZEN.source, 'g'))].map(m => m[1])
    expect(frozen.length, 'the baseline is a pg_dump of the old, frozen shape').toBeGreaterThan(0)
    const afterBaseline = later.map(f => read(join('migrations', f))).join('\n')
    for (const name of frozen) {
      expect(
        afterBaseline,
        `${name} is still in force — nothing after the baseline drops it, so a vocabulary tier cannot be saved`
      ).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${name}\\b`))
    }
  })

  it('no later migration reintroduces a preset-only tier CHECK', () => {
    for (const f of later) {
      expect(FROZEN.test(read(join('migrations', f))), `${f} freezes tier to a fixed list`).toBe(false)
    }
  })
})
