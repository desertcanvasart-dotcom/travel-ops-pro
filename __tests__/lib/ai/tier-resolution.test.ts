// A quote's tier is a vocabulary KEY, and it must survive intake.
//
// After the rate forms learned to file a rate under an agency-added tier
// ("5_star"), no quote could ask for one: generate-itinerary ran every tier
// through normalizeTier, which knows only the four presets and their
// synonyms and answers 'standard' to anything else — so a 5-star request
// was silently priced as standard. getUserPreferences collapsed a 5-star
// DEFAULT the same way before any route saw it. These pin the resolvers
// that replaced that.
import { describe, it, expect } from 'vitest'
import {
  normalizeTier, resolveRequestedTier, tierKeyOrPreset, tierDescription, TIER_DESCRIPTIONS,
} from '@/lib/ai/parsing-utils'
import { PRESET_TIERS } from '@/lib/vocabulary'

const five = [
  { key: 'budget', label: 'Budget' },
  { key: 'standard', label: 'Standard' },
  { key: 'deluxe', label: 'Deluxe' },
  { key: 'luxury', label: 'Luxury' },
  { key: '5_star', label: '5 star' },
]

describe('resolveRequestedTier — explicit > budget level > user default, against the agency list', () => {
  it('an agency-added tier requested by key is kept, not collapsed to standard', () => {
    expect(resolveRequestedTier({ raw_tier: '5_star' }, five)).toBe('5_star')
    expect(normalizeTier('5_star'), 'the old path collapsed it').toBe('standard')
  })
  it('the agency label works as well as the key, case-insensitively', () => {
    expect(resolveRequestedTier({ raw_tier: '5 Star' }, five)).toBe('5_star')
  })
  it('a synonym lands by RUNG: "vip" is the top of the ladder, which on five tiers is 5_star', () => {
    // The ladder contract (lib/vocabulary tierFromPreset): a synonym names a
    // position, not a key. "vip"/"premium" mean "the best you sell".
    expect(resolveRequestedTier({ raw_tier: 'vip' }, five)).toBe('5_star')
    expect(resolveRequestedTier({ budget_level: 'economy' }, five)).toBe('budget')
    // The literal word "luxury" IS a key on this ladder, so it wins as itself.
    expect(resolveRequestedTier({ raw_tier: 'luxury' }, five)).toBe('luxury')
  })
  it('precedence: explicit tier beats budget level beats default', () => {
    expect(resolveRequestedTier({ raw_tier: 'deluxe', budget_level: 'budget', default_tier: '5_star' }, five)).toBe('deluxe')
    expect(resolveRequestedTier({ budget_level: 'budget', default_tier: '5_star' }, five)).toBe('budget')
    expect(resolveRequestedTier({ default_tier: '5_star' }, five)).toBe('5_star')
  })
  it("budget_level 'standard' is an explicit choice, not a fallback signal", () => {
    expect(resolveRequestedTier({ budget_level: 'standard', default_tier: '5_star' }, five)).toBe('standard')
  })
  it('nothing requested → the ladder\'s own standard rung', () => {
    expect(resolveRequestedTier({}, five)).toBe('standard')
  })
  it('without a vocabulary the four presets stand, exactly as before', () => {
    expect(resolveRequestedTier({ raw_tier: 'premium' })).toBe('luxury')
    expect(resolveRequestedTier({ raw_tier: '5_star' })).toBe('standard')
    expect(resolveRequestedTier({})).toBe('standard')
  })
})

describe('tierKeyOrPreset — a stored default survives when it is a well-formed key', () => {
  it('keeps an agency-added key', () => {
    expect(tierKeyOrPreset('5_star')).toBe('5_star')
  })
  it('still collapses a synonym to its preset', () => {
    expect(tierKeyOrPreset('VIP')).toBe('luxury')
    expect(tierKeyOrPreset('economy')).toBe('budget')
  })
  it('rejects anything that is not a key', () => {
    expect(tierKeyOrPreset('5 Star!')).toBe('standard')
    expect(tierKeyOrPreset('')).toBe('standard')
    expect(tierKeyOrPreset(null)).toBe('standard')
  })
})

describe('tierDescription — a custom tier is described by its rung', () => {
  it('a preset describes itself on the default ladder (prompt bytes unchanged)', () => {
    for (const p of PRESET_TIERS) expect(tierDescription(p)).toBe(TIER_DESCRIPTIONS[p])
  })
  it('a fifth, top tier reads as luxury — not as standard', () => {
    const ladder = five.map(i => i.key)
    expect(tierDescription('5_star', ladder)).toBe(TIER_DESCRIPTIONS.luxury)
    expect(tierDescription('budget', ladder)).toBe(TIER_DESCRIPTIONS.budget)
  })
  it('an unknown key never yields "undefined" in a prompt', () => {
    expect(tierDescription('mystery')).toBe(TIER_DESCRIPTIONS.standard)
  })
})
