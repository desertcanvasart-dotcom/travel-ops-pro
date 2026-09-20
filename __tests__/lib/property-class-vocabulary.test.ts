// Operator, 2026-09-20, opening Add property: "why does this drop down menu
// have these categories which do not exist in the vocabulary section… is this
// hard coded or is something wrong?"
//
// Hardcoded. And it had already failed at the job it was written for — it
// existed to stop the class being free text, and the live data holds
// "4 Stars" and "5 Stars" beside the "5★ deluxe" the list offered. A list
// nobody can edit is a list people write around.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROPERTY_CLASS_KIND, PROPERTY_CATEGORIES } from '@/lib/supplier-properties'
import { VOCABULARY_KINDS, optionsFromLabels, slugifyKey } from '@/lib/vocabulary'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const panel = read('app/components/SupplierPropertiesPanel.tsx')
const migration = read('migrations/20261028_property_class_vocabulary.sql')

describe('every property type takes its class from a vocabulary', () => {
  it('maps all three types to a kind', () => {
    expect(PROPERTY_CLASS_KIND).toEqual({
      hotel: 'hotel_class',
      ship: 'ship_category',
      train: 'train_class',
    })
  })

  it('reuses the kind trains ALREADY had', () => {
    // train_class has held the agency's words since the word lists were
    // unpicked, while the constant offered standard/express/VIP/sleeper beside
    // it. Two lists for one thing, disagreeing, is how "4 Stars" gets typed.
    expect(PROPERTY_CLASS_KIND.train).toBe('train_class')
    expect(VOCABULARY_KINDS).toContain('train_class')
  })

  it('registers the two new kinds', () => {
    expect(VOCABULARY_KINDS).toContain('hotel_class')
    expect(VOCABULARY_KINDS).toContain('ship_category')
  })

  it('and the database allows them', () => {
    expect(migration).toContain("'airport', 'hotel_class', 'ship_category'")
  })
})

describe('the picker reads Settings, not a constant', () => {
  it('asks the vocabulary for the draft type’s list', () => {
    expect(panel).toContain('useVocabOptions(PROPERTY_CLASS_KIND.hotel')
    expect(panel).toContain('useVocabOptions(PROPERTY_CLASS_KIND.ship')
    expect(panel).toContain('useVocabOptions(PROPERTY_CLASS_KIND.train')
    expect(panel).toContain('{classOptions.map(')
  })

  it('keeps a value the list does not know', () => {
    // "4 Stars" must not vanish off a page nobody was editing.
    expect(panel).toContain('!classOptions.some(o => o.value === draft.category)')
  })

  it('falls back to the words the constant held', () => {
    // An install with no vocabulary yet sees exactly what it saw before.
    expect(PROPERTY_CATEGORIES.hotel).toContain('5★ deluxe')
    expect(optionsFromLabels(PROPERTY_CATEGORIES.hotel).map(o => o.value))
      .toEqual(['3_standard', '4_superior', '4_deluxe', '5_deluxe', '5_luxury'])
  })

  it('the seeded keys are the ones the form will store', () => {
    for (const label of PROPERTY_CATEGORIES.hotel) {
      expect(migration).toContain(`'${slugifyKey(label)}'`)
      expect(migration).toContain(`'${label}'`)
    }
  })
})

describe('the class is not the tier', () => {
  it('says so where somebody would otherwise assume it', () => {
    // A five-star hotel can be sold in any tier, and the tier is what a rate
    // row is filed under. Nothing prices from the class.
    const src = read('lib/supplier-properties.ts')
    expect(src).toMatch(/NOT the pricing tier/)
    expect(migration).toMatch(/THIS IS NOT THE PRICING TIER/)
  })

  it('and the migration changes no existing value', () => {
    expect(migration).not.toMatch(/UPDATE public\.supplier_properties/i)
    expect(migration).not.toMatch(/DELETE\s+FROM/i)
  })
})
