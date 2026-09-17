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
  // 2026-09-15: the tour TEMPLATE form was never converted, and it was the one
  // that mattered most — an agency could add a tier, watch it appear on the
  // hotel and meal rate pages, and then find no way to build a tour variation
  // for it. The variation modal rendered its own TIER_CONFIG and merely
  // relabelled the four built-ins.
  'app/tours/manage/TourManagerContent.tsx',
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
  // The Refresh prices route, the nightly job and the save-time refresh all
  // price every tier through this one function (org ladder by id: the nightly
  // job has no session).
  'lib/tours/starting-price.ts',
  'app/api/pricing/coverage/route.ts',
]

describe('tier routes read the org ladder', () => {
  for (const rel of TIER_ROUTES) {
    it(`${rel} validates or iterates tiers from tierLadderForCurrentOrg, not a frozen list`, () => {
      const src = read(rel)
      expect(src.includes('tierLadderForCurrentOrg(') || src.includes('tierLadderForOrg('), `${rel} must read the org ladder`).toBe(true)
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

// The other vocabulary kinds: every picker that listed a built-in copy of a
// kind now reads the agency's list through useVocabOptions(kind, builtIn).
// (Class B — forms that stored the LABEL as the value: meals, restaurants,
// trains, sleeper, seasons, guide languages, activities — and Class C — the
// per-vehicle columns on transportation rates — are separate changes.)
const VOCAB_PICKERS: Record<string, string[]> = {
  'app/rates/tipping/page.tsx': ['tipping_role', 'tipping_context', 'tipping_unit'],
  'app/rates/airport-services/page.tsx': ['airport_service_type', 'airport_direction'],
  'app/rates/hotel-services/page.tsx': ['hotel_service_type'],
  'app/rates/cruises/page.tsx': ['cruise_cabin'],
  'app/rates/guides/guide-rates-content.tsx': ['guide_grade', 'guide_duration'],
  'app/rates/attractions/attractions-content.tsx': ['attraction_category', 'attraction_fee_type', 'rate_season'],
  'app/rates/hotels/hotels-content.tsx': ['board_basis', 'hotel_property_type'],
  'app/rates/transportation/transportation-content.tsx': ['transport_service_type', 'vehicle_type'],
  // Class B — these stored the WORD; the pickers now store the vocabulary key.
  'app/rates/meals/meal-rates-content.tsx': ['meal_type', 'cuisine_type', 'restaurant_type', 'dietary_option'],
  'app/rates/trains/train-rates-content.tsx': ['train_class'],
  'app/rates/sleeping-train/sleeping-train-rates-content.tsx': ['sleeper_cabin', 'rate_season'],
  'app/rates/activities/activity-rates-content.tsx': ['activity_category', 'activity_type', 'activity_duration', 'activity_unit'],
  'app/restaurants/restaurants-content.tsx': ['dietary_option'],
  // 2026-09-13: the flights pickers were never converted — a type removed in
  // Settings stayed on the form.
  'app/rates/flights/flights-content.tsx': ['flight_type', 'flight_cabin', 'flight_frequency'],
  // 2026-09-15: the tour template form's own three lists (migration 20261010).
  // tour_audience is label-valued by design — best_for is translated with the
  // rest of the tour copy — but WHICH words are offered still comes from here.
  'app/tours/manage/TourManagerContent.tsx': ['tour_type', 'physical_level', 'tour_audience', 'tour_theme'],
  // 2026-09-15: themes were left out of 20261010 on the mistaken reasoning
  // that living in a table made them customizable. /api/tours/categories has a
  // POST nothing ever called and no screen could add, rename or remove one.
  'app/tours/tours-browser-page.tsx': ['tour_theme'],
}

// Calling useVocabOptions somewhere in a file is not enough: the transportation
// FORM's service-type <select> kept iterating the built-in SERVICE_TYPES (only
// relabelling them) while the page's filter read the vocabulary, so a type the
// operator deleted in Settings was still offered on every new rate
// (2026-09-13). These built-in lists must never reach an <option> again.
// The leading brace is the JSX expression that renders options; the same
// constants may still be passed to useVocabOptions as the built-in fallback.
const RETIRED_FORM_LISTS: Record<string, string[]> = {
  'app/rates/transportation/transportation-content.tsx': ['{SERVICE_TYPES.map('],
  // The tour form's constants survive only as the useVocabOptions fallback;
  // rendering one again would put the built-ins back on screen. TIER_CONFIG is
  // still read for a preset's icon and colours, but never iterated to build
  // the picker — that is what Object.entries(TIER_CONFIG) did.
  'app/tours/manage/TourManagerContent.tsx': [
    '{TOUR_TYPES.map(', '{PHYSICAL_LEVELS.map(', '{BEST_FOR_OPTIONS.map(',
    'Object.entries(TIER_CONFIG)',
    // The theme picker must not go back to the install-local UUID table.
    "fetch('/api/tours/categories')", '{themes.map(',
  ],
  // POPULAR_ROUTES was an Egypt city-pair list; the quick-select chips come from the agency's own rates now.
  'app/rates/flights/flights-content.tsx': ['{FLIGHT_TYPES.map(', '{CABIN_CLASSES.map(', '{FREQUENCIES.map(', 'POPULAR_ROUTES'],
}
// attractions' season picker is in TIER_PICKERS' sibling list above (rate_season).

describe('vocabulary pickers read the agency list', () => {
  for (const [rel, kinds] of Object.entries(VOCAB_PICKERS)) {
    it(`${rel} lists ${kinds.join(', ')} from useVocabOptions`, () => {
      const src = read(rel)
      for (const kind of kinds) {
        expect(src.includes(`useVocabOptions('${kind}'`), `${rel} must list ${kind} from the vocabulary`).toBe(true)
      }
    })
  }
  for (const [rel, lists] of Object.entries(RETIRED_FORM_LISTS)) {
    it(`${rel} renders no <option> from its built-in lists`, () => {
      const src = read(rel)
      for (const list of lists) {
        expect(src.includes(list), `${rel} still iterates ${list} — the vocabulary is the list`).toBe(false)
      }
    })
  }
  it('the transportation route learns which service types need a destination from the vocabulary', () => {
    const src = read('app/api/rates/transportation/route.ts')
    expect(src.includes("vocabularyItemsForCurrentOrg('transport_service_type')")).toBe(true)
    expect(src.includes('needsDestination(')).toBe(true)
  })
  it('the frozen service_type CHECK on transportation_rates is dropped by a later migration', () => {
    const migrations = readdirSync(join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).sort()
    const baseline = migrations.find(f => f.includes('baseline'))!
    expect(read(join('migrations', baseline))).toMatch(/CONSTRAINT transportation_rates_service_type_check CHECK/)
    const later = migrations.filter(f => f > baseline).map(f => read(join('migrations', f))).join('\n')
    expect(later).toMatch(/DROP CONSTRAINT IF EXISTS transportation_rates_service_type_check\b/)
  })
})

// Class C: the routes that write a transportation rate's vehicles resolve
// them through one helper (a list, or the legacy fields, validated against
// the agency's vehicle types) — none keeps its own five-name list.
const VEHICLE_ROUTES = [
  'app/api/rates/transportation/route.ts',
  'app/api/rates/transportation/[id]/route.ts',
  'app/api/resources/transportation/route.ts',
  'app/api/resources/transportation/[id]/route.ts',
]

describe('transportation routes write vehicles through the one helper', () => {
  for (const rel of VEHICLE_ROUTES) {
    it(`${rel} resolves vehicles with resolveVehicleWrite and carries no five-vehicle list`, () => {
      const src = read(rel)
      expect(src.includes('resolveVehicleWrite(')).toBe(true)
      expect(
        /\[\s*'sedan',\s*'minivan',\s*'van',\s*'minibus',\s*'bus'\s*\]/.test(src),
        `${rel} carries a five-vehicle list — an agency-added vehicle can never be priced`
      ).toBe(false)
    })
  }
  // P3: the readers that used to fan a row out over the five columns read the
  // list through the one reader, so an agency-added vehicle shows where it
  // is priced.
  for (const rel of [
    'app/api/pricing-grid/rates/route.ts',
    'app/api/rates/available/route.ts',
    'app/api/tours/variations/[id]/services/route.ts',
    'app/rates/page.tsx',
  ]) {
    it(`${rel} reads a rate's vehicles through vehicleBands`, () => {
      const src = read(rel)
      expect(src.includes('vehicleBands(')).toBe(true)
      expect(/key:\s*'sedan',\s*label:\s*'Sedan'/.test(src), `${rel} still carries its own five-vehicle table`).toBe(false)
    })
  }
  // P4a: the transportation sheet is built from the agency's vehicle types.
  for (const rel of ['app/api/rates/bulk/import/route.ts', 'app/api/rates/bulk/export/route.ts']) {
    it(`${rel} builds the transportation sheet from the vocabulary`, () => {
      const src = read(rel)
      expect(src.includes("vehicleColumnSpecsFor(await vocabularyItemsForCurrentOrg('vehicle_type'))")).toBe(true)
      expect(src.includes('transportationConfigFor(')).toBe(true)
    })
  }
  // Supplier types (20261007): the role picker and every supplier-type
  // picker read the agency's list; the API widens a type filter by
  // behaviour; the two word-list CHECKs on suppliers are dropped.
  for (const rel of [
    'app/suppliers/suppliers-content.tsx',
    'app/components/SupplierPropertiesPanel.tsx',
    'app/itineraries/[id]/edit/page.tsx',
    'app/expenses/page.tsx',
    'app/rates/commissions/page.tsx',
    'app/bookings/[id]/page.tsx',
  ]) {
    it(`${rel} reads the agency's supplier types`, () => {
      expect(read(rel).includes('useSupplierTypes()')).toBe(true)
    })
  }
  it('the suppliers API widens a type filter by behaviour and validates roles against the vocabulary', () => {
    const list = read('app/api/suppliers/route.ts')
    expect(list.includes('supplierTypeKeysMatching(')).toBe(true)
    expect(list.includes('allowedSupplierTypeKeys(')).toBe(true)
    expect(read('app/api/suppliers/[id]/route.ts').includes('allowedSupplierTypeKeys(')).toBe(true)
    expect(read('app/api/suppliers/import/route.ts').includes('allowedSupplierTypeKeys(')).toBe(true)
  })
  it('the suppliers word-list CHECKs are dropped for key-shape CHECKs', () => {
    const sql = read('migrations/20261007_supplier_type_vocabulary_check.sql')
    expect(sql.includes('DROP CONSTRAINT IF EXISTS suppliers_type_check')).toBe(true)
    expect(sql.includes('DROP CONSTRAINT IF EXISTS suppliers_types_vocab_check')).toBe(true)
    expect(sql.includes('ADD CONSTRAINT suppliers_type_key_check')).toBe(true)
  })
  // P4b: the twenty per-vehicle columns are gone (20261006). No app or lib
  // source may name one — a select naming a dropped column fails outright,
  // a write into one fails the upsert. The sheet's <key>_* cells are built
  // from template strings and fold into the list before any upsert.
  it('no app/lib source names a dropped per-vehicle column', () => {
    const walk = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(d => {
      const rel = join(dir, d.name)
      if (d.isDirectory()) return d.name === 'node_modules' || d.name === '.next' ? [] : walk(rel)
      return /\.(ts|tsx)$/.test(d.name) ? [rel] : []
    })
    const legacy = /\b(sedan|minivan|van|minibus|bus)_(rate_eur|rate_non_eur|capacity_min|capacity_max)\b/
    const offenders = [...walk('app'), ...walk('lib')].filter(rel => legacy.test(read(rel)))
    expect(offenders).toEqual([])
  })
  it('the pricing engine has no city-to-vehicle table (Edfu → horse carriage was Egypt in a white-label engine)', () => {
    expect(/SPECIAL_VEHICLE_CITIES\s*[:=]/.test(read('lib/auto-pricing-service.ts'))).toBe(false)
  })
})

describe('the WhatsApp parser offers and resolves the agency tiers', () => {
  it('the extraction prompt lists tierPromptChoices, not a frozen budget|standard|deluxe|luxury', () => {
    const src = read('app/api/ai/parse-whatsapp/route.ts')
    expect(src.includes('tierItemsForCurrentOrg(')).toBe(true)
    expect(src.includes('tierPromptChoices(tierItems)')).toBe(true)
    expect(src.includes('"budget|standard|deluxe|luxury"'), 'a frozen choice list is back in the prompt').toBe(false)
    expect(src.includes('resolveRequestedTier('), 'the model answer must be resolved to a ladder key').toBe(true)
  })
  it('the parser UI resolves the answer against the vocabulary, not a four-preset map', () => {
    const src = read('app/whatsapp-parser/whatsapp-parser-content.tsx')
    expect(src.includes('normalizeTierKey(')).toBe(true)
    expect(/mapBudgetToTier/.test(src), 'the four-preset map is back').toBe(false)
  })
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
