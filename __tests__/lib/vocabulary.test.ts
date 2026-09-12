// The white-label vocabulary lets an agency RELABEL and REMAP terminology, but
// the engine still reasons in fixed preset positions. These pin the two halves:
// the frozen keys (the 4 tier positions, the 35 kinds) and the ladder mapping
// that lets a custom tier label resolve onto one of those positions — plus the
// bilingual label lookup that keeps the Japanese UI first-class.
import { describe, it, expect } from 'vitest'
import {
  PRESET_TIERS, VOCABULARY_KINDS, presetTierFor, tierFromPreset,
  localizedLabelFor, slugifyKey, KEY_PATTERN, vehicleForPax, tierMultiplier,
  tierOptionsFor, isPresetTier,
} from '@/lib/vocabulary'

describe('frozen keys (the skeleton under the custom words)', () => {
  it('the 4 preset tier positions never change', () => {
    expect([...PRESET_TIERS]).toEqual(['budget', 'standard', 'deluxe', 'luxury'])
  })
  it('exactly 35 vocabulary kinds, incl. tier + supplier_type', () => {
    expect(VOCABULARY_KINDS.length).toBe(35)
    expect(VOCABULARY_KINDS).toContain('tier')
    expect(VOCABULARY_KINDS).toContain('supplier_type')
  })
})

describe('presetTierFor — custom labels map onto the preset ladder', () => {
  const three = ['economy', 'comfort', 'premium']
  it('a 3-tier agency ladder maps to low / mid / high positions', () => {
    expect(presetTierFor(three, 'economy')).toBe('budget')
    expect(presetTierFor(three, 'comfort')).toBe('standard')
    expect(presetTierFor(three, 'premium')).toBe('luxury')
  })
  it('the default 4-tier ladder is identity', () => {
    const four = [...PRESET_TIERS]
    for (const t of four) expect(presetTierFor(four, t)).toBe(t)
  })
  it('unknown / missing tier reads as standard', () => {
    expect(presetTierFor(three, 'gold')).toBe('standard')
    expect(presetTierFor(three, null)).toBe('standard')
  })
  it('tierFromPreset returns the agency word at the preset position', () => {
    expect(tierFromPreset(three, 'budget')).toBe('economy')
    expect(tierFromPreset(three, 'luxury')).toBe('premium')
  })
})

describe('localizedLabelFor — bilingual, JA falls back to the default label', () => {
  const items = [
    { key: 'deluxe', label: 'Deluxe', label_ja: 'デラックス' },
    { key: 'suite', label: 'Suite', label_ja: null },
  ]
  it('returns the Japanese label for ja when set', () => {
    expect(localizedLabelFor(items, 'deluxe', 'ja')).toBe('デラックス')
  })
  it('falls back to the default label when label_ja is null', () => {
    expect(localizedLabelFor(items, 'suite', 'ja')).toBe('Suite')
  })
  it('returns the default label for en, and the key when unknown', () => {
    expect(localizedLabelFor(items, 'deluxe', 'en')).toBe('Deluxe')
    expect(localizedLabelFor(items, 'mystery', 'ja')).toBe('mystery')
    expect(localizedLabelFor(items, '', 'ja')).toBe('')
  })
})

describe('helpers', () => {
  it('slugifyKey produces a valid key', () => {
    const k = slugifyKey('5★ Deluxe Suite!')
    expect(KEY_PATTERN.test(k)).toBe(true)
  })
  it('vehicleForPax picks the smallest band that fits', () => {
    const bands = [
      { key: 'sedan', min_pax: 1, max_pax: 2 },
      { key: 'minivan', min_pax: 3, max_pax: 8 },
    ]
    expect(vehicleForPax(bands, 2)).toBe('sedan')
    expect(vehicleForPax(bands, 5)).toBe('minivan')
  })
  it('tierMultiplier climbs with position', () => {
    const four = [...PRESET_TIERS]
    expect(tierMultiplier(four, 'budget')).toBeLessThan(tierMultiplier(four, 'luxury'))
  })
})

describe('tierOptionsFor — the picker offers the agency ladder, presets only as fallback', () => {
  // The operator added a fifth tier in Settings → Vocabulary and it appeared
  // in no rate form: the pickers mapped over their own four-entry list.
  const i18n = (k: string) => `i18n:${k}`
  const seeded = [
    { key: 'budget', label: 'Budget', label_ja: null },
    { key: 'standard', label: 'Standard', label_ja: 'スタンダード' },
    { key: 'deluxe', label: 'Deluxe', label_ja: null },
    { key: 'luxury', label: 'Luxury', label_ja: null },
    { key: '5_star', label: '5 star', label_ja: null },
  ]

  it('an agency-added tier is offered, in ladder order, under its own label', () => {
    const opts = tierOptionsFor(seeded, 'en', i18n)
    expect(opts.map(o => o.value)).toEqual(['budget', 'standard', 'deluxe', 'luxury', '5_star'])
    expect(opts[4]).toEqual({ value: '5_star', label: '5 star', preset: null, description: null })
  })

  it('a preset key is still recognised as one, so it keeps its colour', () => {
    const opts = tierOptionsFor(seeded, 'en', i18n)
    expect(opts.slice(0, 4).map(o => o.preset)).toEqual(['budget', 'standard', 'deluxe', 'luxury'])
    expect(isPresetTier('luxury')).toBe(true)
    expect(isPresetTier('5_star')).toBe(false)
  })

  it('ja uses the Japanese label where set, else the built-in word for a preset, else the default label', () => {
    const opts = tierOptionsFor(seeded, 'ja', i18n)
    expect(opts.find(o => o.value === 'standard')!.label).toBe('スタンダード')
    expect(opts.find(o => o.value === 'deluxe')!.label).toBe('i18n:deluxe')
    expect(opts.find(o => o.value === '5_star')!.label).toBe('5 star')
  })

  it('an agency relabel of a preset wins over the built-in word', () => {
    const relabelled = [{ key: 'budget', label: '3★', label_ja: null }]
    expect(tierOptionsFor(relabelled, 'en', i18n)[0].label).toBe('3★')
  })

  it('with no vocabulary (migration unapplied, fetch failed) the four presets stand', () => {
    const opts = tierOptionsFor([], 'en', i18n)
    expect(opts.map(o => o.value)).toEqual([...PRESET_TIERS])
    expect(opts.map(o => o.label)).toEqual(['i18n:budget', 'i18n:standard', 'i18n:deluxe', 'i18n:luxury'])
  })
})
