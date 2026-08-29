// The letterhead monogram is identity, not decoration.
//
// Two customer-facing PDF templates and the signup page drew a circle reading
// "T2E" — the first operator's initials — on every agency's paper. The name
// beside it had already been fixed; the badge had not, because nobody greps
// for initials. Derived from the name now, and blank when it is blank.
import { describe, it, expect } from 'vitest'
import { monogram } from '@/lib/org-identity'

describe('monogram', () => {
  it('takes the initials of a multi-word name', () => {
    expect(monogram('Karnak Voyages Ltd')).toBe('KVL')
  })

  it('stops at three, so a long name does not become a paragraph', () => {
    expect(monogram('The Very Long Egyptian Travel Company')).toBe('TVL')
  })

  it('gives a single-word name two letters rather than one lonely capital', () => {
    expect(monogram('Autoura')).toBe('AU')
  })

  it('splits on hyphens and dashes as well as spaces', () => {
    expect(monogram('Nile-Voyages')).toBe('NV')
  })

  it('is blank when the operator has set no name — blank beats fake', () => {
    expect(monogram('')).toBe('')
    expect(monogram('   ')).toBe('')
  })

  it('stands a non-Latin name on its first character', () => {
    // A Japanese operator has no initials to take; one character is a better
    // badge than nothing, and nothing is better than somebody else's.
    expect(monogram('日本旅行株式会社')).toBe('日本')
  })
})
