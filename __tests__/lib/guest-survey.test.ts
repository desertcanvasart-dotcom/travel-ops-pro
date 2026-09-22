import { describe, it, expect } from 'vitest'
import {
  RATING_ITEM_IDS,
  isRatingValue,
  sanitizeResponses,
  SURVEY_SECTIONS,
} from '@/lib/surveys/guest-survey'

describe('guest survey definition', () => {
  it('has the service and overall sections with the expected items', () => {
    expect(SURVEY_SECTIONS.map(s => s.id)).toEqual(['service', 'overall'])
    expect(RATING_ITEM_IDS).toContain('guide')
    expect(RATING_ITEM_IDS).toContain('overall_satisfaction')
    // guide and hotel_room carry a name field
    const guide = SURVEY_SECTIONS[0].items.find(i => i.id === 'guide')
    expect(guide?.extra?.id).toBe('guide_name')
  })

  it('accepts 1–5 and na as ratings, nothing else', () => {
    for (const v of [1, 2, 3, 4, 5, 'na']) expect(isRatingValue(v)).toBe(true)
    for (const v of [0, 6, 2.5, '3', null, undefined, {}]) expect(isRatingValue(v)).toBe(false)
  })
})

describe('sanitizeResponses (never trust a public POST)', () => {
  it('keeps known ids and valid values, drops the rest', () => {
    const out = sanitizeResponses({
      ratings: { guide: 5, dining: 'na', vehicle: 9, not_a_field: 4 },
      comments: { guide: '  great  ', bogus: 'x' },
      extras: { guide_name: 'Nasser', hotel_name: '  Seti  ', unknown_extra: 'y' },
      optional_tours: 'yes',
      optional_tours_detail: 'Aswan — Abu Simbel',
      additional_comments: 'thanks',
      guest_name: '山田',
      injected: 'DROP TABLE',
    })
    expect(out.ratings).toEqual({ guide: 5, dining: 'na' }) // vehicle 9 dropped, not_a_field dropped
    expect(out.comments).toEqual({ guide: 'great' }) // trimmed; bogus dropped
    expect(out.extras).toEqual({ guide_name: 'Nasser', hotel_name: 'Seti' })
    expect(out.optional_tours).toBe('yes')
    expect(out.additional_comments).toBe('thanks')
    expect(out.guest_name).toBe('山田')
    expect((out as unknown as Record<string, unknown>).injected).toBeUndefined()
  })

  it('is empty-safe and caps lengths', () => {
    expect(sanitizeResponses(null)).toEqual({ ratings: {}, comments: {}, extras: {} })
    const long = sanitizeResponses({ additional_comments: 'x'.repeat(9000) })
    expect(long.additional_comments?.length).toBe(4000)
  })
})
