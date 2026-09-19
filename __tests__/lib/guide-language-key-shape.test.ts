// guide_rates held the same language twice: a row written before the guide
// language vocabulary stored the WORD ("Japanese"), a row written after it
// stored the KEY ("japanese"). The engine compares by key, so both priced
// correctly and nothing was ever mispriced — which is exactly why it went
// unnoticed until the operator saw the calculator's language list, which is
// built from the rate rows.
//
// The two rows are NOT duplicates: Alexandria throughout from one supplier,
// Cairo spot from another. Only the spelling was wrong.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { slugifyKey } from '@/lib/vocabulary'
import { guideLanguageKey, sameGuideLanguage } from '@/lib/guides/guide-language'
import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const migration = read('migrations/20261026_guide_language_keys.sql')

describe('both spellings were always the same language', () => {
  it('matches by key, which is why nothing was mispriced', () => {
    expect(sameGuideLanguage('Japanese', 'japanese')).toBe(true)
    expect(guideLanguageKey('Japanese')).toBe('japanese')
  })

  it('and still are not the same as another language', () => {
    expect(sameGuideLanguage('Japanese', 'portuguese')).toBe(false)
  })
})

describe('the CSV importer can no longer create the second spelling', () => {
  const language = RATE_TABLE_CONFIGS.guide_rates.columns.find(c => c.name === 'guide_language')

  it('marks the language as an open-vocabulary KEY column', () => {
    // Not an enum: the agency coins its own languages, so there is no list to
    // match against — but the stored shape is still a key.
    expect(language?.slugify).toBe(true)
    expect(language?.allowedValues).toBeUndefined()
  })

  it('slugifies on import, the way the API write paths already do', () => {
    const src = read('lib/bulk-rate-service.ts')
    expect(src).toContain('if (colDef.slugify) return { parsed: slugifyKey(raw), error: null }')
    // Both API paths were already correct — the sheet was the leak.
    expect(read('app/api/rates/guides/route.ts')).toContain('guide_language: guideLanguageKey(body.guide_language)')
    expect(read('app/api/rates/guides/[id]/route.ts')).toContain('guideLanguageKey(body.guide_language)')
  })

  it('turns a sheet written in words into keys', () => {
    for (const [word, key] of [['Japanese', 'japanese'], ['Brazilian Portuguese', 'brazilian_portuguese'], ['  Arabic  ', 'arabic']] as const) {
      expect(slugifyKey(word)).toBe(key)
    }
  })
})

describe('the migration normalises without deleting', () => {
  it('updates the spelling and touches nothing else', () => {
    expect(migration).toContain('UPDATE public.guide_rates')
    expect(migration).not.toMatch(/DELETE\s+FROM/i)
  })

  it('constrains the SHAPE, not which languages exist', () => {
    // A value list here is the mistake 20261007 unpicked on suppliers.
    expect(migration).toContain("guide_language ~ '^[a-z0-9][a-z0-9_]*$'")
    expect(migration).not.toMatch(/IN \('japanese'/i)
  })

  it('its regex agrees with slugifyKey on the values that exist', () => {
    // The SQL cannot call slugifyKey, so the two must be checked against each
    // other by hand — these are the rows the migration actually rewrites.
    const sqlSlug = (v: string) =>
      v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    for (const v of ['Japanese', 'Portuguese', 'Brazilian Portuguese', 'japanese']) {
      expect(sqlSlug(v)).toBe(slugifyKey(v))
    }
  })
})
