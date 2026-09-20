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

// Operator, 2026-09-20, looking at the GUIDE RATE FORM: "the language already
// in the vocabulary section only one language which is Japanese ... and here
// you see English in small letters."
//
// Different cause from the calculator above, same symptom. This form OPENED on
// a hardcoded `guide_language: 'english'`. The vocabulary lists only Japanese,
// so 'english' fell through to the "a language since removed still shows"
// escape hatch, which rendered the raw key. Lowercase because no vocabulary
// entry supplies a word for a language the agency does not have.
//
// The cosmetic half is the lesser one: it was the DEFAULT, so a rate saved
// without touching the dropdown was written in a language this office holds no
// contract in, and the engine — which matches guide languages by exact key —
// priced every guide day as No rate.
describe('the guide rate form never proposes a language of its own', () => {
  const src = readFileSync(join(process.cwd(), 'app/rates/guides/guide-rates-content.tsx'), 'utf8')

  it('has no hardcoded language anywhere in it', () => {
    expect(src).not.toMatch(/guide_language:\s*'english'/)
    expect(src).not.toMatch(/guide_language:\s*'[a-z_]+'/)
  })

  it('opens a new rate on the vocabulary first language instead', () => {
    expect(src).toContain("const defaultLanguage = languageOptions[0]?.value ?? ''")
    expect(src).toContain('guide_language: defaultLanguage,')
  })

  it('fills a blank choice once the vocabulary loads, without overwriting a pick', () => {
    expect(src).toContain('prev.guide_language ? prev : { ...prev, guide_language: defaultLanguage }')
  })

  it('keeps the language of a row being edited, whatever it is', () => {
    // A rate already written in a retired language must still open on it —
    // the default only fills a genuinely empty choice.
    expect(src).toContain('guideLanguageKey(rate.guide_language) || defaultLanguage')
  })

  it('never renders a stored key raw, in the form or the list', () => {
    expect(src).not.toMatch(/guideLanguageLabel\((\w+)\.guide_language,\s*\1\.guide_language\)/)
    expect(src).toContain('guideLanguageWord(rate.guide_language)')
    expect(src).toContain('guideLanguageWord(formData.guide_language)')
  })
})

describe('the languages a guide speaks come from the same list', () => {
  const src = readFileSync(join(process.cwd(), 'components/rates/GuideLanguagesEditor.tsx'), 'utf8')

  it('no longer keeps its own hardcoded eleven', () => {
    // This editor sits on the guide rates page and missed the 2026-09-15
    // vocabulary sweep, so one page offered one language above and eleven
    // different ones below.
    expect(src).not.toContain('GUIDE_LANGUAGE_OPTIONS')
    expect(src).not.toMatch(/'English',\s*'Japanese',\s*'French'/)
  })

  it('reads Settings → Vocabulary, like every other guide-language picker', () => {
    expect(src).toContain("useVocabOptions('guide_language'")
  })

  it('still shows a language already saved that the vocabulary does not list', () => {
    // Dropping it from the list would silently drop it on the next save.
    expect(src).toContain('!languageOptions.some(o => o.value === k)')
  })

  it('compares by key, so a word written before the vocabulary still matches', () => {
    expect(src).toContain('guideLanguageKey(l) === key')
  })
})
