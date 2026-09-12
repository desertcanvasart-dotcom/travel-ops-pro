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

// Where a tier is FILED (rate forms) and where one is ASKED FOR (the quote
// side: the itinerary editor, the B2B calculator, the pricing grid, the
// WhatsApp brief, and the user's default in Settings). Each of these carried
// its own four-entry copy.
const TIER_PICKERS = [
  'app/rates/hotels/hotels-content.tsx',
  'app/rates/cruises/page.tsx',
  'app/rates/meals/meal-rates-content.tsx',
  'app/restaurants/restaurants-content.tsx',
  'app/itineraries/[id]/edit/page.tsx',
  'app/b2b/calculator/[id]/page.tsx',
  'app/b2b/import/import-content.tsx',
  'app/pricing-grid/components/GridHeader.tsx',
  'app/whatsapp-parser/whatsapp-parser-content.tsx',
  'app/settings/page.tsx',
  'app/tours/tours-browser-page.tsx',
  'app/content-library/page.tsx',
  'app/content-library/[id]/page.tsx',
]

// Routes that validate a tier or iterate "all tiers" — each carried a frozen
// copy of the presets, so an agency-added tier was refused or skipped.
const TIER_ROUTES = [
  'app/api/content-library/route.ts',
  'app/api/content-library/[id]/route.ts',
  'app/api/content-library/[id]/variations/route.ts',
  'app/api/tours/templates/[id]/auto-price/route.ts',
  'app/api/tours/variations/route.ts',
  'app/api/tours/recalculate-prices/route.ts',
  'app/api/pricing/coverage/route.ts',
]

describe('tier routes read the org ladder', () => {
  for (const rel of TIER_ROUTES) {
    it(`${rel} validates or iterates tiers from tierLadderForCurrentOrg, not a frozen list`, () => {
      const src = read(rel)
      expect(src.includes('tierLadderForCurrentOrg('), `${rel} must read the org ladder`).toBe(true)
      expect(
        /\[\s*'budget',\s*'standard',\s*'deluxe',\s*'luxury'\s*\]/.test(src),
        `${rel} carries a four-entry tier list — an agency-added tier is refused or skipped`
      ).toBe(false)
    })
  }
})

describe('tier pickers read the vocabulary', () => {
  for (const rel of TIER_PICKERS) {
    it(`${rel} builds its tier choices from useTierOptions, not a form-local list`, () => {
      const src = read(rel)
      expect(src.includes('useTierOptions('), `${rel} must build its tier choices from useTierOptions`).toBe(true)
      expect(
        /TIER_OPTIONS_CONFIG\.map\(/.test(src),
        `${rel} maps over TIER_OPTIONS_CONFIG — an agency-added tier can never appear`
      ).toBe(false)
      // SHIP_CATEGORIES on the cruises page is the VESSEL's class
      // (ship_category, its own column, its own i18n words), not the service
      // tier — a separate list, tracked here rather than hidden. Every other
      // four-entry literal in these files is a tier picker in disguise.
      const withoutShipCategory = src.split('\n').filter(l => !l.includes('SHIP_CATEGORIES')).join('\n')
      expect(
        /\[\s*'budget',\s*'standard',\s*'deluxe',\s*'luxury'\s*\]/.test(withoutShipCategory),
        `${rel} carries a four-entry tier list — an agency-added tier can never appear`
      ).toBe(false)
    })
  }
})

describe('a requested tier survives the quote path', () => {
  it('generate-itinerary resolves the tier against the org vocabulary, not normalizeTier alone', () => {
    const src = read('app/api/ai/generate-itinerary/route.ts')
    expect(src.includes('resolveRequestedTier(')).toBe(true)
    expect(src.includes("loadVocabularyForOrg(supabaseAdmin, orgId, 'tier')")).toBe(true)
    expect(/const tier: ServiceTier = raw_tier\s*\?\s*normalizeTier/.test(src), 'the collapsing ternary is back').toBe(false)
  })
  it('the engine tier types are open keys, not the four-preset union', () => {
    for (const rel of ['lib/auto-pricing-service.ts', 'lib/ai/parsing-utils.ts', 'app/pricing-grid/types.ts']) {
      const src = read(rel)
      expect(
        /export type (ServiceTier|Tier) = 'budget' \| 'standard' \| 'deluxe' \| 'luxury'/.test(src),
        `${rel} closes the tier type to the presets — a vocabulary tier cannot be priced`
      ).toBe(false)
    }
  })
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
