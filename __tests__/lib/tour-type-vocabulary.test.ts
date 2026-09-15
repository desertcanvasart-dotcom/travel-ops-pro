// The tour form's duration auto-suggest, once tour types are the agency's own.
//
// Typing a duration suggests a tour type. That used to be two hardcoded rules
// ("1 day → day_tour, 2+ → multi_day") over a frozen list of four types, so an
// agency could not add one — and the rule could not know what its day range
// meant. Each type now carries {min_days, max_days} in its vocabulary meta,
// exactly as a vehicle type carries {min_pax, max_pax}, and the suggestion is
// "the first type, in the agency's own order, whose range admits this
// duration".
//
// The subtle half is when NOT to suggest. A duration of 1 is admitted by a
// half day, a day tour and a stopover alike, so overwriting a deliberate pick
// with the first match would silently retype somebody's tour as they edited
// its length. suggestTourType returns null whenever the current choice already
// fits.
import { describe, it, expect } from 'vitest'
import { tourTypeDays, suggestTourType, vocabOptionsFor, validateVocabularyItem, VOCABULARY_KINDS, VOCABULARY_KIND_INFO } from '@/lib/vocabulary'

/** The seeded preset list, in rank order (migration 20261010). */
const PRESETS = [
  { key: 'half_day', meta: { min_days: 1, max_days: 1 } },
  { key: 'day_tour', meta: { min_days: 1, max_days: 1 } },
  { key: 'multi_day', meta: { min_days: 2, max_days: 99 } },
  { key: 'stopover', meta: { min_days: 1, max_days: 1 } },
]

describe('tourTypeDays', () => {
  it('reads the range an agency set', () => {
    expect(tourTypeDays(PRESETS, 'multi_day')).toEqual({ min: 2, max: 99 })
    expect(tourTypeDays(PRESETS, 'half_day')).toEqual({ min: 1, max: 1 })
  })

  it('is permissive where no range is set, so a type never blocks a save', () => {
    // An agency adding a type through the API without meta must not end up
    // with a type that admits no duration at all.
    expect(tourTypeDays([{ key: 'expedition', meta: {} }], 'expedition')).toEqual({ min: 1, max: 99 })
    expect(tourTypeDays(PRESETS, 'not_a_type')).toEqual({ min: 1, max: 99 })
    expect(tourTypeDays(PRESETS, null)).toEqual({ min: 1, max: 99 })
  })

  it('ignores a nonsense range rather than trusting it', () => {
    const junk = [{ key: 'x', meta: { min_days: 0, max_days: -3 } }]
    expect(tourTypeDays(junk, 'x')).toEqual({ min: 1, max: 99 })
  })
})

describe('suggestTourType', () => {
  it('suggests the first type whose range admits the duration', () => {
    expect(suggestTourType(PRESETS, 5, null)).toBe('multi_day')
    expect(suggestTourType(PRESETS, 1, null)).toBe('half_day')
  })

  it('leaves a choice that already fits alone', () => {
    // THE regression this protects: 1 day is ambiguous between half_day,
    // day_tour and stopover. Someone who picked "Stopover" and then typed the
    // duration must still have a stopover.
    expect(suggestTourType(PRESETS, 1, 'stopover')).toBeNull()
    expect(suggestTourType(PRESETS, 1, 'day_tour')).toBeNull()
    expect(suggestTourType(PRESETS, 40, 'multi_day')).toBeNull()
  })

  it('replaces a choice the duration has outgrown', () => {
    expect(suggestTourType(PRESETS, 6, 'half_day')).toBe('multi_day')
    expect(suggestTourType(PRESETS, 1, 'multi_day')).toBe('half_day')
  })

  it('suggests a type the AGENCY added, in their order', () => {
    // The whole point: a 7-day tour should land on the agency's own
    // "Expedition" when they put it before the generic multi-day entry.
    const agency = [
      { key: 'half_day', meta: { min_days: 1, max_days: 1 } },
      { key: 'expedition', meta: { min_days: 5, max_days: 21 } },
      { key: 'multi_day', meta: { min_days: 2, max_days: 99 } },
    ]
    expect(suggestTourType(agency, 7, null)).toBe('expedition')
    expect(suggestTourType(agency, 3, null)).toBe('multi_day')
  })

  it('suggests nothing rather than guessing when no type fits', () => {
    const narrow = [{ key: 'day_tour', meta: { min_days: 1, max_days: 1 } }]
    expect(suggestTourType(narrow, 9, null)).toBeNull()
  })

  it('ignores a duration that is not a real number of days', () => {
    for (const d of [0, -1, NaN]) expect(suggestTourType(PRESETS, d, null)).toBeNull()
  })
})

describe('the three kinds are registered', () => {
  it('each is a kind with settings-screen copy', () => {
    for (const kind of ['tour_type', 'physical_level', 'tour_audience'] as const) {
      expect(VOCABULARY_KINDS).toContain(kind)
      const info = VOCABULARY_KIND_INFO[kind]
      expect(info, `${kind} needs an entry so Settings can render it`).toBeDefined()
      expect(info.group).toBe('Tours')
      expect(info.description.length).toBeGreaterThan(40)
    }
  })

  it('says out loud that Best for keeps the words, not a key', () => {
    // The one kind that breaks the repo-wide "stored values are KEYS" rule.
    // If that reason is not on the settings screen, the next person to meet it
    // will assume it is a bug and "fix" it.
    expect(VOCABULARY_KIND_INFO.tour_audience.description).toMatch(/WORDS|words/)
  })
})

describe('before the migration lands', () => {
  // The code ships ahead of the migration, so for a while every install has
  // these kinds in the app and NOT in the database — which is the state
  // production is in the moment this merges, and the state the E2E project is
  // in permanently. An empty vocabulary must leave the form exactly as it was.
  //
  // The first version of this file got that wrong and SAID SO CONFIDENTLY: it
  // asserted that with no vocabulary the suggestion "degrades to something
  // usable". It does not. With no meta anywhere, every type reads as 1–99
  // days, so the current pick always fits and suggestTourType returns null
  // forever — the duration silently stops suggesting anything at all. The E2E
  // caught it (half-day-tour.spec.ts: fill 3 days, expected multi_day, got
  // half_day). The fix is that the BUILT-IN list carries the ranges too, in
  // the same `meta` shape, so the fallback is behaviour-identical and not
  // merely non-crashing.
  //
  // This is the built-in list as app/tours/manage/TourManagerContent.tsx
  // declares it. If those two drift, the fallback silently loses its ranges
  // again, which is precisely the failure being pinned here.
  const builtInTourTypes = [
    { value: 'half_day', label: 'Half Day Tour', meta: { min_days: 1, max_days: 1 } },
    { value: 'day_tour', label: 'Day Tour', meta: { min_days: 1, max_days: 1 } },
    { value: 'multi_day', label: 'Multi-Day Tour', meta: { min_days: 2, max_days: 99 } },
    { value: 'stopover', label: 'Stopover Tour', meta: { min_days: 1, max_days: 1 } },
  ]
  /** What the form feeds suggestTourType: the options it is already showing. */
  const rangesFrom = (items: Parameters<typeof vocabOptionsFor>[0]) =>
    vocabOptionsFor(items, 'en', builtInTourTypes).map(o => ({ key: o.value, meta: o.meta }))

  it('an empty vocabulary falls back to the built-in list, unchanged', () => {
    const opts = vocabOptionsFor([], 'en', builtInTourTypes)
    expect(opts.map(o => o.value)).toEqual(['half_day', 'day_tour', 'multi_day', 'stopover'])
    expect(opts.map(o => o.label)).toEqual(['Half Day Tour', 'Day Tour', 'Multi-Day Tour', 'Stopover Tour'])
  })

  it('reproduces the E2E: 3 days moves Half Day on to Multi-Day', () => {
    // e2e/half-day-tour.spec.ts, without a browser or a database.
    expect(suggestTourType(rangesFrom([]), 3, 'half_day')).toBe('multi_day')
  })

  it('and 1 day still leaves Half Day alone', () => {
    // The other half of that spec, and the older bug it was written for:
    // duration used to force day_tour and silently undo the choice just made.
    expect(suggestTourType(rangesFrom([]), 1, 'half_day')).toBeNull()
  })

  it('the agency\'s own ranges win once the vocabulary exists', () => {
    // The built-in meta is a FALLBACK, not a floor: an agency that redefines
    // half_day as a 1–2 day type must get its own answer.
    const agency = [
      { key: 'half_day', label: 'Half Day', label_ja: null, meta: { min_days: 1, max_days: 2 } },
    ]
    expect(suggestTourType(rangesFrom(agency), 2, 'half_day')).toBeNull()
    expect(suggestTourType(rangesFrom([]), 2, 'half_day')).toBe('multi_day')
  })
})

describe('validateVocabularyItem — a tour type needs a usable day range', () => {
  // The vocabulary screen's inputs carry min attributes, but those are
  // advisory: an inverted range such as 10–5 saved fine, and a type whose
  // bounds can never both admit a duration is one suggestTourType can never
  // suggest. Validated server-side for POST and PATCH alike, as the vehicle
  // pax range already was.
  const item = (meta: Record<string, unknown> | undefined) =>
    validateVocabularyItem({ kind: 'tour_type', key: 'expedition', label: 'Expedition', meta })

  it('accepts an ordered range', () => {
    expect(item({ min_days: 5, max_days: 21 })).toEqual({ ok: true })
    expect(item({ min_days: 1, max_days: 1 })).toEqual({ ok: true })
  })

  it('refuses an inverted range', () => {
    expect(item({ min_days: 10, max_days: 5 }).ok).toBe(false)
  })

  it('refuses a zero, negative, fractional or missing bound', () => {
    expect(item({ min_days: 0, max_days: 5 }).ok).toBe(false)
    expect(item({ min_days: -1, max_days: 5 }).ok).toBe(false)
    expect(item({ min_days: 1.5, max_days: 5 }).ok).toBe(false)
    expect(item({ min_days: 1 }).ok).toBe(false)
    expect(item(undefined).ok).toBe(false)
  })

  it('leaves other kinds alone', () => {
    expect(validateVocabularyItem({ kind: 'tour_theme', key: 'diving', label: 'Diving', meta: {} })).toEqual({ ok: true })
  })
})
