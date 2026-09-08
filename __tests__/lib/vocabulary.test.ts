// The white-label vocabulary lets an agency RELABEL and REMAP terminology, but
// the engine still reasons in fixed preset positions. These pin the two halves:
// the frozen keys (the 4 tier positions, the 35 kinds) and the ladder mapping
// that lets a custom tier label resolve onto one of those positions — plus the
// bilingual label lookup that keeps the Japanese UI first-class.
import { describe, it, expect } from 'vitest'
import {
  PRESET_TIERS, VOCABULARY_KINDS, presetTierFor, tierFromPreset,
  localizedLabelFor, slugifyKey, KEY_PATTERN, vehicleForPax, tierMultiplier,
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
