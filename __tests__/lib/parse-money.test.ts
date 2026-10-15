import { describe, it, expect } from 'vitest'
import { parseMoney } from '@/lib/parse-money'

describe('parseMoney', () => {
  it.each([
    ['€1,234.50', 1234.5],
    ['1.234,50 EUR', 1234.5],
    ['1 234,50', 1234.5],
    ['1,234', 1234],
    ['1.234.567', 1234567],
    ['1,234,567.89', 1234567.89],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['EGP 15000', 15000],
    ['-45.00', -45],
    ['(45.00)', -45],
    [99.9, 99.9],
    [0, 0],
  ])('%s → %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected)
  })

  it.each([null, undefined, '', 'n/a', '-', '.', NaN, Infinity, {}])('%s → null', (input) => {
    expect(parseMoney(input)).toBeNull()
  })
})
