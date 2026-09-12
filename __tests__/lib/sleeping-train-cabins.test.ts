// The operator sells two sleeping-train cabins: Single and Half Twin. The form
// used to offer Single / Double / Suite / Royal Suite and the column has no
// CHECK, so this list is the only guard. Pins the vocabulary and the
// normaliser the API and importer use.
import { describe, it, expect } from 'vitest'
import { SLEEPING_TRAIN_CABINS, SLEEPING_TRAIN_CABIN_VALUES, normaliseSleepingTrainCabin } from '@/lib/rates/sleeping-train-cabins'

describe('sleeping-train cabins', () => {
  it('is exactly Single and Half Twin — the two the operator sells', () => {
    expect(SLEEPING_TRAIN_CABIN_VALUES).toEqual(['single', 'half_twin'])
    expect(SLEEPING_TRAIN_CABINS.map(c => c.labelKey)).toEqual(['single', 'halfTwin'])
  })

  it('normalises case, spacing and separators', () => {
    // The stored value is the vocabulary KEY; the words rows used to hold
    // ('Half Twin', 'Single') still resolve, so old rows read and re-save.
    expect(normaliseSleepingTrainCabin('half twin')).toBe('half_twin')
    expect(normaliseSleepingTrainCabin('  HALF-TWIN ')).toBe('half_twin')
    expect(normaliseSleepingTrainCabin('half_twin')).toBe('half_twin')
    expect(normaliseSleepingTrainCabin('Half Twin')).toBe('half_twin')
    expect(normaliseSleepingTrainCabin('single')).toBe('single')
    expect(normaliseSleepingTrainCabin('Single')).toBe('single')
  })

  it('rejects the retired cabins and anything else', () => {
    for (const v of ['Double Cabin', 'Suite Cabin', 'Royal Suite', 'Twin', '', null, undefined, 42]) {
      expect(normaliseSleepingTrainCabin(v), String(v)).toBeNull()
    }
  })
})
