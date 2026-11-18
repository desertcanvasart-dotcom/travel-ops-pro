import { describe, it, expect, vi } from 'vitest'
import { setMockTables } from '../_mock-supabase'

// A guide's languages belong to the guide (owner 2026-11-18), as its cities
// do since #691: one rate per guide serves every language the guide speaks
// (suppliers.languages), instead of a copy of the rate per language.
//
//   OLD: a rate served only its own guide_language. A French trip with only
//        an English rate of a French-speaking guide had no guide rate.
//   NEW: it is priced from that guide's rate. A rate written for French
//        still comes first, after the day's city and the chosen guide.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { pickGuideRate, type GuideAsk } from '@/lib/pricing/service-rates'
import { guideLanguageRank } from '@/lib/guides/guide-language'
import { fetchGuideRows } from '@/lib/auto-pricing-service'

const rate = (id: string, over: Record<string, unknown> = {}) => ({
  id, guide_language: 'English', guide_type: 'egyptologist', tour_duration: 'full_day', guide_mode: 'spot',
  is_active: true, base_rate_eur: 50, rate_valid_from: '2026-01-01', guide_cities: [], guide_languages: [], ...over,
})
const ask = (language: string, over: Partial<GuideAsk> = {}): GuideAsk =>
  ({ language, grade: 'egyptologist', duration: 'full_day', mode: 'spot', city: 'Cairo', ...over })

describe('guideLanguageRank', () => {
  it('own language 0, the guide speaks it 1, neither 2 — by vocabulary key', () => {
    expect(guideLanguageRank({ guide_language: 'French' }, 'french')).toBe(0)
    expect(guideLanguageRank({ guide_language: 'English', guide_languages: ['French', 'German'] }, 'french')).toBe(1)
    expect(guideLanguageRank({ guide_language: 'English', guide_languages: ['German'] }, 'French')).toBe(2)
    expect(guideLanguageRank({ guide_language: 'English' }, 'French')).toBe(2)
  })
})

describe('pickGuideRate', () => {
  it('OLD: no French rate, no guide. NEW: the rate of a guide who speaks French', () => {
    const ahmed = rate('ahmed', { supplier_id: 'g-ahmed', guide_languages: ['English', 'French'] })
    expect(pickGuideRate([{ ...ahmed, guide_languages: [] }], ask('French'))).toBeNull() // the old world: no list
    expect(pickGuideRate([ahmed], ask('French'))?.id).toBe('ahmed')
  })

  it('a rate written for the language comes before one whose guide merely speaks it', () => {
    const ahmed = rate('ahmed', { supplier_id: 'g-ahmed', guide_languages: ['French'], base_rate_eur: 40 })
    const sara = rate('sara', { supplier_id: 'g-sara', guide_language: 'French', base_rate_eur: 60, rate_valid_from: '2025-01-01' })
    expect(pickGuideRate([ahmed, sara], ask('French'))?.id).toBe('sara')
  })

  it('the day’s city still comes first; then the chosen guide', () => {
    const local = rate('local', { supplier_id: 'g-local', guide_languages: ['French'], guide_cities: ['Cairo'] })
    const away = rate('away', { supplier_id: 'g-away', guide_language: 'French', guide_cities: ['Luxor'] })
    expect(pickGuideRate([away, local], ask('French'))?.id).toBe('local')
    const other = rate('other', { supplier_id: 'g-other', guide_language: 'French', guide_cities: ['Cairo'] })
    expect(pickGuideRate([other, local], ask('French', { supplierId: 'g-local' }))?.id).toBe('local')
  })

  it('unchanged: a guide with no languages on file serves its rates’ own language only', () => {
    const r = rate('r', { supplier_id: 'g' })
    expect(pickGuideRate([r], ask('English'))?.id).toBe('r')
    expect(pickGuideRate([r], ask('German'))).toBeNull()
  })
})

describe('the engine reads the guide’s languages', () => {
  it('fetchGuideRows attaches this company’s guide languages to each rate', async () => {
    setMockTables({
      guide_rates: [
        { id: 'gr1', org_id: 'org-1', supplier_id: 'g1', guide_language: 'English', is_active: true },
        { id: 'gr2', org_id: 'org-1', supplier_id: null, guide_language: 'English', is_active: true },
      ],
      suppliers: [
        { id: 'g1', org_id: 'org-1', languages: ['English', 'French'] },
        { id: 'g1', org_id: 'org-2', languages: ['Japanese'] },
      ],
      supplier_cities: [],
    })
    const rows = await fetchGuideRows('org-1')
    expect(rows.find(r => r.id === 'gr1')?.guide_languages).toEqual(['English', 'French'])
    expect(rows.find(r => r.id === 'gr2')?.guide_languages).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The Quote Builder's guide list agrees with pricing.
// ---------------------------------------------------------------------------
import { guideLanguages, preferLanguage, counterpart, servesLanguage } from '@/app/pricing-grid/lib/guide-language'

describe('Quote Builder guide options', () => {
  const opt = (id: string, language: string, languages: string[], over: Record<string, unknown> = {}) =>
    ({ id, name: id, rateEur: 50, rateNonEur: 50, city: 'Cairo', category: 'Egyptologist', language, languages, ...over }) as any

  const ahmed = opt('ahmed', 'English', ['English', 'French'])
  const sara = opt('sara', 'French', ['French'])
  const omar = opt('omar', 'English', ['English'])

  it('offers every language a guide speaks', () => {
    expect(guideLanguages([ahmed, omar])).toEqual(['English', 'French'])
  })
  it('a guide serves the languages they speak', () => {
    expect(servesLanguage(ahmed, 'french')).toBe(true)
    expect(servesLanguage(omar, 'French')).toBe(false)
  })
  it('in the language: a rate written for it first, then guides who speak it', () => {
    expect(preferLanguage([ahmed, omar, sara], 'French').map(g => g.id)).toEqual(['sara', 'ahmed'])
  })
  it('switching the trip to French keeps a guide who speaks it, and finds one for a guide who does not', () => {
    expect(counterpart(omar, 'French', [ahmed, omar])?.id).toBe('ahmed')
  })
})
