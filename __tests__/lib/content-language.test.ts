// The itinerary's language layer: which language is the source, what state a
// translated day is in, and the client-copy checks (redesign of the itinerary
// detail page — ITN-26-009 / NMS803-CR-ABS was the reference record).
import { describe, it, expect } from 'vitest'
import {
  dayTextHash,
  dayTranslationStatus,
  detectContentLanguage,
  findPlaceholders,
  mergeDayText,
  normalizeClientLanguage,
  splitTourCode,
  summarizeLanguage,
  targetLanguages,
  tipsConflict,
  type DayText,
} from '@/lib/itineraries/content-language'

const day = (over: Partial<DayText> = {}): DayText => ({
  title: 'Nile Cruise',
  description: 'Sail to Edfu and visit the Temple of Horus.',
  city: 'Luxor',
  overnight_city: 'Nile Cruise',
  ...over,
})

describe('detectContentLanguage', () => {
  it('English text with a Japanese bracket and the client name stays English', () => {
    expect(detectContentLanguage([
      '8 days: Nile Cruise, Abu Simbel, Cairo',
      '【00:00】 At Narita International Airport, Terminal 1 South Wing, at the EgyptAir counter',
    ])).toBe('en')
  })

  it('Japanese text with hotel names and flight numbers in Latin is Japanese', () => {
    expect(detectContentLanguage([
      'ナイル川クルーズ',
      '成田空港よりエジプト航空MS965便にてカイロへ。Steigenberger Nile Palace泊。',
    ])).toBe('ja')
  })

  it('no text is no answer', () => {
    expect(detectContentLanguage([null, '', '12:30'])).toBeNull()
  })
})

describe('normalizeClientLanguage', () => {
  it.each([
    ['Japanese', 'ja'], ['ja', 'ja'], ['日本語', 'ja'], ['JP', 'ja'],
    ['English', 'en'], ['en', 'en'], ['英語', 'en'],
  ])('%s → %s', (input, out) => expect(normalizeClientLanguage(input)).toBe(out))

  it('a language the app cannot write in is unknown, not a guess', () => {
    expect(normalizeClientLanguage('Spanish')).toBeNull()
    expect(normalizeClientLanguage(null)).toBeNull()
  })
})

it('targets are every supported language but the source', () => {
  expect(targetLanguages('en')).toEqual(['ja'])
  expect(targetLanguages('ja')).toEqual(['en'])
})

describe('day status and staleness', () => {
  const source = day()

  it('mergeDayText lays a version over the canonical day field by field', () => {
    expect(mergeDayText(source, { title: 'Day on the Nile', description: null })).toEqual({ ...source, title: 'Day on the Nile' })
  })

  it('no row, or a row with no prose, is missing', () => {
    expect(dayTranslationStatus(source, null)).toBe('missing')
    expect(dayTranslationStatus(source, { title: null, description: '' })).toBe('missing')
  })

  it('a machine row made from the current source is machine; a person\'s is reviewed', () => {
    const hash = dayTextHash(source)
    expect(dayTranslationStatus(source, { title: 'ナイル川クルーズ', status: 'machine', source_hash: hash })).toBe('machine')
    expect(dayTranslationStatus(source, { title: 'ナイル川クルーズ', status: 'reviewed', source_hash: hash })).toBe('reviewed')
  })

  it('editing the source after translating makes the row outdated, whoever wrote it', () => {
    const hash = dayTextHash(source)
    const edited = day({ description: 'Sail to Kom Ombo instead.' })
    expect(dayTranslationStatus(edited, { title: 'x', status: 'reviewed', source_hash: hash })).toBe('outdated')
  })

  it('whitespace at the ends is not an edit', () => {
    expect(dayTextHash(day({ title: '  Nile Cruise ' }))).toBe(dayTextHash(source))
  })

  it('a row from before tracking has no claim either way', () => {
    expect(dayTranslationStatus(day({ title: 'changed' }), { title: 'x', status: null, source_hash: null })).toBe('translated')
  })
})

describe('summarizeLanguage', () => {
  it('worst first: one outdated day makes the language outdated', () => {
    expect(summarizeLanguage('ja', ['reviewed', 'outdated', 'missing']).status).toBe('outdated')
  })
  it('some days present, some missing, is partial', () => {
    const s = summarizeLanguage('ja', ['machine', 'missing'])
    expect(s.status).toBe('partial')
    expect(s.counts.missing).toBe(1)
  })
  it('all missing, or no days, is missing', () => {
    expect(summarizeLanguage('ja', ['missing', 'missing']).status).toBe('missing')
    expect(summarizeLanguage('ja', []).status).toBe('missing')
  })
  it('legacy rows read as reviewed for the language, machine rows as machine', () => {
    expect(summarizeLanguage('ja', ['translated', 'reviewed']).status).toBe('reviewed')
    expect(summarizeLanguage('ja', ['translated', 'machine']).status).toBe('machine')
  })
})

describe('findPlaceholders', () => {
  it('finds the unfilled time and flight number on the reference record', () => {
    const found = findPlaceholders('【00:00】 At Narita… 【00:00】 Departing on EgyptAir flight XX to Cairo')
    expect(found.map(f => f.kind)).toEqual(['time', 'time', 'xx'])
  })

  it('leaves real times, real flight numbers and words alone', () => {
    expect(findPlaceholders('【09:30】 EgyptAir MS965, Luxor. Excellent.')).toEqual([])
  })

  it('TBD, 未定 and empty brackets', () => {
    expect(findPlaceholders('Hotel TBD').map(f => f.kind)).toEqual(['tbd'])
    expect(findPlaceholders('ホテル未定').map(f => f.kind)).toEqual(['tbd'])
    expect(findPlaceholders('Pick-up at [...]').map(f => f.kind)).toEqual(['bracket'])
  })
})

describe('tipsConflict', () => {
  it('flags tips included on one list and gratuities excluded on the other', () => {
    const c = tipsConflict(
      ['Tips for drivers, porters, and hotel concierge', 'All taxes'],
      ['Gratuities for your guide (appreciated but not obligatory)']
    )
    expect(c?.included).toHaveLength(1)
    expect(c?.excluded).toHaveLength(1)
  })
  it('tips only on one side is no conflict', () => {
    expect(tipsConflict(['All tips'], ['International flights'])).toBeNull()
  })
  it('reads Japanese lists', () => {
    expect(tipsConflict(['ドライバーへのチップ'], ['ガイドへのチップ'])).not.toBeNull()
  })
})

describe('splitTourCode', () => {
  it('takes the programme code out of the title', () => {
    expect(splitTourCode('NMS803-CR-ABS — 8 days: Nile Cruise, Abu Simbel, Cairo'))
      .toEqual({ code: 'NMS803-CR-ABS', title: '8 days: Nile Cruise, Abu Simbel, Cairo' })
  })
  it('a title is not a code', () => {
    expect(splitTourCode('Cairo — 3 days')).toEqual({ code: null, title: 'Cairo — 3 days' })
    expect(splitTourCode('VIP-TOUR - Cairo')).toEqual({ code: null, title: 'VIP-TOUR - Cairo' })
  })
})
