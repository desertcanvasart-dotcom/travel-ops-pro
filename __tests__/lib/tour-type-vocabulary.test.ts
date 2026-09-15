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
import { tourTypeDays, suggestTourType, vocabOptionsFor, VOCABULARY_KINDS, VOCABULARY_KIND_INFO } from '@/lib/vocabulary'

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
  // production is in the moment this merges. An empty vocabulary must leave
  // the form exactly as it was, or shipping the two in either order breaks it.
  const builtInTourTypes = [
    { value: 'half_day', label: 'Half Day Tour' },
    { value: 'day_tour', label: 'Day Tour' },
    { value: 'multi_day', label: 'Multi-Day Tour' },
    { value: 'stopover', label: 'Stopover Tour' },
  ]

  it('an empty vocabulary falls back to the built-in list, unchanged', () => {
    const opts = vocabOptionsFor([], 'en', builtInTourTypes)
    expect(opts.map(o => o.value)).toEqual(['half_day', 'day_tour', 'multi_day', 'stopover'])
    expect(opts.map(o => o.label)).toEqual(['Half Day Tour', 'Day Tour', 'Multi-Day Tour', 'Stopover Tour'])
  })

  it('and the duration suggestion degrades to something usable, not to nothing', () => {
    // With no vocabulary there is no meta, so every type reads as 1–99 and the
    // first one wins. A tour still gets a type; it is simply not a clever one.
    const noMeta = builtInTourTypes.map(o => ({ key: o.value, meta: {} }))
    expect(suggestTourType(noMeta, 5, null)).toBe('half_day')
    expect(suggestTourType(noMeta, 5, 'multi_day')).toBeNull()
  })
})
