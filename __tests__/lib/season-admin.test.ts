// ============================================
// What the season calendar accepts from a person
// ============================================
// These two functions stand between a typed value and a row the pricing engine
// will read, so the cases worth naming are the ones that look like data and
// are not: a date the calendar does not have, a percentage nobody meant.

import { describe, it, expect } from 'vitest'
import { parseUpliftPercent, parseDateOnly, isHexColour } from '@/lib/pricing/season-admin'

describe('parseUpliftPercent', () => {
  it('takes the numbers an operator actually types', () => {
    expect(parseUpliftPercent(15)).toBe(15)
    expect(parseUpliftPercent('15')).toBe(15)
    expect(parseUpliftPercent('12.5')).toBe(12.5)
  })

  it('keeps zero, which is a season being watched rather than charged for', () => {
    expect(parseUpliftPercent(0)).toBe(0)
    expect(parseUpliftPercent('0')).toBe(0)
  })

  it('rejects what the column would reject anyway', () => {
    expect(parseUpliftPercent(-5)).toBeNull()
    expect(parseUpliftPercent(500)).toBeNull()
    expect(parseUpliftPercent('abc')).toBeNull()
    expect(parseUpliftPercent(null)).toBeNull()
    expect(parseUpliftPercent(undefined)).toBeNull()
  })

  it('rounds to the two decimals the column stores, rather than storing a surprise', () => {
    expect(parseUpliftPercent(12.3456)).toBe(12.35)
  })
})

describe('parseDateOnly', () => {
  it('accepts a plain calendar date', () => {
    expect(parseDateOnly('2027-04-29')).toBe('2027-04-29')
  })

  it('takes the date out of a timestamp rather than refusing it', () => {
    expect(parseDateOnly('2027-04-29T09:30:00Z')).toBe('2027-04-29')
  })

  it('refuses a date the calendar does not have', () => {
    // Date.parse would happily roll this into 3 March; a window edge that moves
    // by itself is worse than a rejected form.
    expect(parseDateOnly('2027-02-31')).toBeNull()
    expect(parseDateOnly('2027-13-01')).toBeNull()
  })

  it('refuses anything that is not a date at all', () => {
    expect(parseDateOnly('')).toBeNull()
    expect(parseDateOnly('next Tuesday')).toBeNull()
    expect(parseDateOnly(20270429)).toBeNull()
    expect(parseDateOnly(null)).toBeNull()
  })

  it('keeps a leap day that exists, and drops one that does not', () => {
    expect(parseDateOnly('2028-02-29')).toBe('2028-02-29')
    expect(parseDateOnly('2027-02-29')).toBeNull()
  })
})

describe('isHexColour', () => {
  it('accepts the six-digit form the column stores', () => {
    expect(isHexColour('#647C47')).toBe(true)
    expect(isHexColour('#647c47')).toBe(true)
  })

  it('rejects shorthand, names and anything that could carry markup', () => {
    expect(isHexColour('#fff')).toBe(false)
    expect(isHexColour('red')).toBe(false)
    expect(isHexColour('#647C47; background:url(x)')).toBe(false)
    expect(isHexColour(null)).toBe(false)
  })
})
