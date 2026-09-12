// "Missing tiers" on a content item is measured against the agency's own
// ladder. It used to be measured against the four presets, so a library
// could never report that the 5-star variation was missing — and a 5-star
// variation that DID exist counted as nothing.
import { describe, it, expect } from 'vitest'
import { getMissingTiers, TIERS, type ContentVariation } from '@/app/types/content-library'

const v = (tier: string) => ({ tier } as ContentVariation)

describe('getMissingTiers', () => {
  it('defaults to the four presets, as before', () => {
    expect(getMissingTiers([v('budget'), v('luxury')])).toEqual(['standard', 'deluxe'])
    expect(getMissingTiers([...TIERS].map(v))).toEqual([])
  })
  it('against a five-tier ladder, the fifth tier can be missing', () => {
    const ladder = [...TIERS, '5_star']
    expect(getMissingTiers([...TIERS].map(v), ladder)).toEqual(['5_star'])
    expect(getMissingTiers([...ladder].map(v), ladder)).toEqual([])
  })
  it('a variation whose tier is not on the ladder is neither missing nor counted', () => {
    expect(getMissingTiers([v('5_star')], ['budget', 'standard'])).toEqual(['budget', 'standard'])
  })
})
