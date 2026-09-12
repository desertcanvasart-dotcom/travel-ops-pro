// A picker offers the agency's vocabulary, not a form-local copy.
//
// Of 35 vocabulary kinds, only `tier` read the Vocabulary's ITEMS; the other
// 34 used useVocabLabel, which swaps the word for a key the form already
// knew. So an entry added in Settings never appeared in any picker, a hidden
// one never disappeared, and an agency's order was ignored — the operator saw
// eight vehicle types in Settings and five in the transportation form (12 Sep
// 2026). vocabOptionsFor is the "remap" half: the agency's list when it holds
// any, the form's built-in list until then.
import { describe, it, expect } from 'vitest'
import { vocabOptionsFor } from '@/lib/vocabulary'

const builtIn = [
  { value: 'guide', label: 'i18n:Guide' },
  { value: 'driver', label: 'i18n:Driver' },
  { value: 'porter', label: 'i18n:Porter' },
]

describe('vocabOptionsFor', () => {
  it('with no vocabulary, the built-in list stands as-is', () => {
    expect(vocabOptionsFor([], 'en', builtIn)).toEqual([
      { value: 'guide', label: 'i18n:Guide', meta: {}, description: null },
      { value: 'driver', label: 'i18n:Driver', meta: {}, description: null },
      { value: 'porter', label: 'i18n:Porter', meta: {}, description: null },
    ])
  })

  it('the agency list wins: its order, its additions, its omissions (hidden = not passed)', () => {
    const items = [
      { key: 'driver', label: 'Driver', label_ja: null },
      { key: 'guide', label: 'Guide', label_ja: null },
      { key: 'boat_crew', label: 'Boat crew', label_ja: null },
    ]
    expect(vocabOptionsFor(items, 'en', builtIn).map(o => o.value)).toEqual(['driver', 'guide', 'boat_crew'])
  })

  it('EN: the agency word wins; JA: label_ja when set, else the built-in i18n word, else the EN word', () => {
    const items = [
      { key: 'guide', label: 'Egyptologist', label_ja: 'ガイド' },
      { key: 'driver', label: 'Driver', label_ja: null },
      { key: 'boat_crew', label: 'Boat crew', label_ja: null },
    ]
    const en = vocabOptionsFor(items, 'en', builtIn)
    expect(en.map(o => o.label)).toEqual(['Egyptologist', 'Driver', 'Boat crew'])
    const ja = vocabOptionsFor(items, 'ja', builtIn)
    expect(ja.map(o => o.label)).toEqual(['ガイド', 'i18n:Driver', 'Boat crew'])
  })

  it('meta merges vocabulary over built-in, so behaviour survives and an added entry carries its own', () => {
    const flagged = [
      { value: 'intercity', label: 'Intercity', meta: { needs_destination: true } },
      { value: 'city_tour', label: 'City tour', meta: { needs_destination: false } },
    ]
    const items = [
      { key: 'intercity', label: 'Intercity', label_ja: null, meta: {} },
      { key: 'city_tour', label: 'City tour', label_ja: null, meta: { needs_destination: true } },
      { key: 'desert_run', label: 'Desert run', label_ja: null, meta: { needs_destination: true } },
    ]
    const opts = vocabOptionsFor(items, 'en', flagged)
    expect(opts.map(o => o.meta.needs_destination)).toEqual([true, true, true])
    expect(vocabOptionsFor([], 'en', flagged).map(o => o.meta.needs_destination)).toEqual([true, false])
  })

  it('the description rides along when the agency wrote one', () => {
    const items = [{ key: 'guide', label: 'Guide', label_ja: null, description: '  ' }, { key: 'porter', label: 'Porter', label_ja: null, description: 'Luggage at hotels' }]
    expect(vocabOptionsFor(items, 'en', builtIn).map(o => o.description)).toEqual([null, 'Luggage at hotels'])
  })
})
