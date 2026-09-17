import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { fullRateTables } from '../fixtures/sample-templates'
import { BUILT_IN_GUIDE_LANGUAGES, guideLanguageKey, guideLanguageWord, sameGuideLanguage } from '@/lib/guides/guide-language'

// Operator, 2026-09-17: Settings → Vocabulary listed 12 guide languages, the
// guide rate form its own 11 (no Arabic), and the calculator only what the
// rate rows said. The vocabulary is now the one list, and a language is
// matched by key — never by substring.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { getGuideRate } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('one language, whether stored as a word or a key', () => {
  it('matches by key', () => {
    expect(sameGuideLanguage('Japanese', 'japanese')).toBe(true)
    expect(sameGuideLanguage('Brazilian Portuguese', 'brazilian_portuguese')).toBe(true)
    expect(sameGuideLanguage('Portuguese', 'Brazilian Portuguese')).toBe(false)
    expect(sameGuideLanguage('', '')).toBe(false)
    expect(guideLanguageKey(' English ')).toBe('english')
  })

  it('reads a key as a word on a price line, and keeps a word', () => {
    expect(guideLanguageWord('japanese')).toBe('Japanese')
    expect(guideLanguageWord('brazilian_portuguese')).toBe('Brazilian Portuguese')
    expect(guideLanguageWord('Japanese')).toBe('Japanese')
  })

  it('the built-in list carries Arabic, like the vocabulary preset', () => {
    expect(BUILT_IN_GUIDE_LANGUAGES).toContain('Arabic')
    expect(BUILT_IN_GUIDE_LANGUAGES).toHaveLength(12)
  })
})

describe('pricing finds the guide by exact language', () => {
  const rows = [
    { id: 'g-br', guide_language: 'Brazilian Portuguese', guide_type: 'egyptologist', tour_duration: 'full_day', base_rate_eur: 999, is_active: true },
    { id: 'g-pt', guide_language: 'portuguese', guide_type: 'senior', tour_duration: 'full_day', base_rate_eur: 120, is_active: true },
    { id: 'g-ja', guide_language: 'Japanese', guide_type: 'egyptologist', tour_duration: 'full_day', base_rate_eur: 100, is_active: true },
  ]
  const install = () => { const t = fullRateTables() as any; t.guide_rates = rows; setMockTables(t) }

  it('a word asks for a key-stored row and a key asks for a word-stored row', async () => {
    install()
    expect(await getGuideRate('Portuguese', 'standard', undefined, { grade: 'senior' })).toMatchObject({ id: 'g-pt', name: 'Portuguese Speaking Guide' })
    expect(await getGuideRate('japanese', 'standard')).toMatchObject({ id: 'g-ja', name: 'Japanese Speaking Guide' })
  })

  it('"Portuguese" never prices the Brazilian Portuguese guide (the old substring match did)', async () => {
    install()
    const r = await getGuideRate('Portuguese', 'standard')
    // Egyptologist asked: falls back to the first Portuguese row (senior), not Brazilian's 999.
    expect(r?.id).toBe('g-pt')
  })
})

describe('the three places read the vocabulary', () => {
  it('the guide rate form has no hard-coded language list', () => {
    const src = readFileSync('app/rates/guides/guide-rates-content.tsx', 'utf8')
    expect(src).not.toContain('const LANGUAGES')
    expect(src).toContain("useVocabOptions('guide_language'")
  })

  it('the calculator and the tour page offer the vocabulary list and grey languages with no rate', () => {
    const src = readFileSync('components/pricing/GuideLanguageSelect.tsx', 'utf8')
    expect(src).toContain("useVocabOptions('guide_language'")
    expect(src).toContain('disabled={!withRate.includes(o.value)}')
    for (const page of ['app/b2b/calculator/[id]/page.tsx', 'app/tours/[code]/page.tsx']) {
      const p = readFileSync(page, 'utf8')
      expect(p).toContain('<GuideLanguageSelect')
      expect(p).toContain('language: guideLanguage')
    }
  })

  it('the guide rate API stores the key and finds duplicates by key', () => {
    const src = readFileSync('app/api/rates/guides/route.ts', 'utf8')
    expect(src).toContain('guide_language: guideLanguageKey(body.guide_language)')
    expect(src).not.toContain(".eq('guide_language'")
    expect(readFileSync('app/api/rates/guides/[id]/route.ts', 'utf8')).toContain('guideLanguageKey(body.guide_language)')
  })
})
