// The WhatsApp parser's prompt told the model to answer budget_level with
// "budget|standard|deluxe|luxury", so "4 star hotels" came back as 'standard'
// no matter what tiers the agency had — and the parser UI then ran the answer
// through a four-preset map that would have undone a 4-star answer anyway.
import { describe, it, expect } from 'vitest'
import { tierPromptChoices, normalizeTierKey } from '@/lib/vocabulary'

describe('tierPromptChoices — what the extraction prompt offers the model', () => {
  it('is the four presets, byte-identical to the old literal, with no vocabulary', () => {
    expect(tierPromptChoices([])).toBe('budget|standard|deluxe|luxury')
  })
  it('a seeded vocabulary whose labels match the keys reads the same', () => {
    const seeded = [
      { key: 'budget', label: 'Budget' }, { key: 'standard', label: 'Standard' },
      { key: 'deluxe', label: 'Deluxe' }, { key: 'luxury', label: 'Luxury' },
    ]
    expect(tierPromptChoices(seeded)).toBe('budget|standard|deluxe|luxury')
  })
  it('an agency-added tier is offered by key, in ladder order', () => {
    const five = [
      { key: 'budget', label: 'Budget' }, { key: 'standard', label: 'Standard' },
      { key: 'deluxe', label: 'Deluxe' }, { key: 'luxury', label: 'Luxury' }, { key: '4_star', label: '4 star' },
    ]
    expect(tierPromptChoices(five)).toBe('budget|standard|deluxe|luxury|4_star')
  })
  it('a relabelled preset shows the agency word beside the key so the model can match it', () => {
    expect(tierPromptChoices([{ key: 'budget', label: '3★' }, { key: 'luxury', label: 'Luxury' }])).toBe('budget (3★)|luxury')
  })
})

describe('the model answer resolves onto the agency ladder', () => {
  const five = [
    { key: 'budget', label: 'Budget' }, { key: 'standard', label: 'Standard' },
    { key: 'deluxe', label: 'Deluxe' }, { key: 'luxury', label: 'Luxury' }, { key: '4_star', label: '4 star' },
  ]
  it('by key, by label, or by the client\'s own words', () => {
    expect(normalizeTierKey('4_star', five)).toBe('4_star')
    expect(normalizeTierKey('4 star', five)).toBe('4_star')
    expect(normalizeTierKey('4 Star', five)).toBe('4_star')
  })
  it('a preset answer stays itself; nothing usable → the standard rung', () => {
    expect(normalizeTierKey('deluxe', five)).toBe('deluxe')
    expect(normalizeTierKey('', five)).toBe('standard')
  })
})
