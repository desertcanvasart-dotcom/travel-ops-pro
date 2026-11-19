// The guides.daily_rate and first-guide fallbacks (owner 2026-11-19: a
// missing price is a gap, never a guess).
//
//   OLD: with no guide rate for the language, getGuideRate read the old
//        guides list: a guide of the tier, else the FIRST guide of the
//        language, at its generic daily_rate. The B2B quote from an itinerary
//        went further: no guide of the language → ANY guide.
//   NEW: guides are priced from Rates → Guides (guide_rates) only; none for
//        the language, city and date is a gap.
import { vi, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setMockTables } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { getGuideRate } from '@/lib/auto-pricing-service'

const legacyGuides = [
  { id: 'g-lux', org_id: 'org-1', name: 'Luxury Guide', daily_rate: 300, languages: ['English'], tier: 'luxury', is_active: true, is_preferred: false },
]

describe('getGuideRate', () => {
  it('no guide rate for the language: null (a gap), never the old guides list', async () => {
    setMockTables({ guide_rates: [], guides: legacyGuides, supplier_cities: [] })
    expect(await getGuideRate('org-1', 'English', 'standard')).toBeNull()
  })

  it('a guide rate prices as before', async () => {
    setMockTables({
      guide_rates: [{ id: 'gr-1', org_id: 'org-1', guide_language: 'english', guide_type: 'egyptologist', tour_duration: 'full_day', guide_mode: 'spot', is_active: true, base_rate_eur: 80 }],
      guides: legacyGuides, supplier_cities: [],
    })
    expect(await getGuideRate('org-1', 'English', 'standard')).toMatchObject({ id: 'gr-1', dailyRate: 80 })
  })
})

describe('B2B quote from an itinerary', () => {
  it('prices guides from Rates → Guides for the day, never any guide of the old list', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/b2b/quote-from-itinerary/route.ts'), 'utf8')
    expect(src).not.toContain("from('guides')")
    expect(src).toContain('getGuideRate(orgId, language, tier as ServiceTier, normalizer, { city, date })')
  })
})
