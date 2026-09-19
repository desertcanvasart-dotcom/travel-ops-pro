// Operator, 2026-09-19, looking at the B2B calculator: "why there in the
// screenshot still we have hard coded guide language despite the vocabulary
// section only has one which is Japanese."
//
// It was not hardcoded. The built-in list of twelve is a FALLBACK for an
// agency with no vocabulary yet, and vocabOptionsFor ignores it entirely once
// the vocabulary has any entry. The second word in that dropdown came from a
// GUIDE RATE ROW in a language the vocabulary does not list — shown on purpose,
// because hiding it would make a contract the agency holds unreachable.
//
// What made it look hardcoded was that it rendered the raw stored key:
// "portuguese", lowercase, with nothing to say where it came from.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vocabOptionsFor, optionsFromLabels } from '@/lib/vocabulary'
import { BUILT_IN_GUIDE_LANGUAGES, guideLanguageWord } from '@/lib/guides/guide-language'

const builtIn = optionsFromLabels(BUILT_IN_GUIDE_LANGUAGES)

describe('the built-in list is a fallback, not a floor', () => {
  it('serves the twelve only when the agency has no vocabulary', () => {
    expect(vocabOptionsFor([], 'en', builtIn)).toHaveLength(BUILT_IN_GUIDE_LANGUAGES.length)
  })

  it('and is ignored completely once the vocabulary has ONE entry', () => {
    // This is the answer to "why is there a hardcoded language": there is not.
    const items = [{ key: 'japanese', label: 'Japanese', label_ja: '日本語' }]
    const options = vocabOptionsFor(items, 'en', builtIn)
    expect(options.map(o => o.value)).toEqual(['japanese'])
    expect(options.some(o => o.value === 'portuguese')).toBe(false)
  })
})

describe('a language that comes from a rate says so', () => {
  const src = readFileSync(join(process.cwd(), 'components/pricing/GuideLanguageSelect.tsx'), 'utf8')

  it('still offers it — a held contract must stay reachable', () => {
    expect(src).toContain('withRate.filter(k => !options.some(o => o.value === k))')
  })

  it('reads as a word, not as the stored key', () => {
    // "portuguese" lowercase was the giveaway that nothing had labelled it.
    expect(guideLanguageWord('portuguese')).toBe('Portuguese')
    expect(guideLanguageWord('brazilian_portuguese')).toBe('Brazilian Portuguese')
    expect(src).toContain('label(k, guideLanguageWord(k))')
    expect(src).not.toMatch(/<option key=\{k\} value=\{k\}>\{label\(k, k\)\}</)
  })

  it('names its source, so the fix is visible from the dropdown', () => {
    const en = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8'))
    const ja = JSON.parse(readFileSync(join(process.cwd(), 'messages/ja.json'), 'utf8'))
    expect(en.b2bCalculator.guideLanguageFromRate).toMatch(/guide rate/)
    expect(en.b2bCalculator.guideLanguageFromRate).toMatch(/not in your list/)
    expect(ja.b2bCalculator.guideLanguageFromRate).toBeTruthy()
    expect(src).toContain("t('guideLanguageFromRate'")
  })
})
