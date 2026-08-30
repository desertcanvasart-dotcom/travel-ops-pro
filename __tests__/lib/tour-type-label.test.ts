// next-intl returns the KEY PATH for a missing message, and a key path is
// truthy — so the old `t(key) || raw` fallback never fired, and a template
// carrying a tour_type outside the app's own list rendered literally as
// "tours.tourTypes.cultural" in the Type column. Seen in production on
// 2026-08-30. This pins the fallback's shape.
import { describe, it, expect } from 'vitest'

/** The component's helper, extracted verbatim for testing. */
const makeLabel = (t: (k: string) => string) => (raw: string | null | undefined): string => {
  if (!raw) return ''
  const key = `tourTypes.${raw}`
  const translated = t(key)
  if (!translated || translated.endsWith(key)) {
    return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  return translated
}

describe('tourTypeLabel', () => {
  const translations: Record<string, string> = { 'tourTypes.day_tour': 'Day Tour' }
  // next-intl's real behaviour: echo the full path when the key is missing.
  const t = (k: string) => translations[k] ?? `tours.${k}`
  const label = makeLabel(t)

  it('uses the translation when one exists', () => {
    expect(label('day_tour')).toBe('Day Tour')
  })

  it('humanises an unmapped value instead of showing the key path', () => {
    expect(label('cultural')).toBe('Cultural')
    expect(label('multi_city_cruise')).toBe('Multi City Cruise')
  })

  it('is blank for a missing value rather than "tours.tourTypes.undefined"', () => {
    expect(label(null)).toBe('')
    expect(label(undefined)).toBe('')
    expect(label('')).toBe('')
  })
})
