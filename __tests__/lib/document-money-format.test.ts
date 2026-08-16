import { describe, it, expect } from 'vitest'
import { currencyDecimals, currencySymbol, formatMoney } from '@/lib/currency-totals'
import fs from 'fs'
import path from 'path'

// ============================================
// Money on customer documents
// ============================================
// Every PDF generator used to carry its OWN currency-symbol table and its own
// hardcoded two decimals. None of the tables contained ¥, so a yen invoice
// printed "JPY370873.00" — the wrong symbol, and a minor unit the currency does
// not have. It is the first document a Japanese customer sees.
//
// They now all go through formatMoney. These tests pin both the behaviour and
// the fact that no generator has grown its own formatter again.

describe('formatMoney on customer documents', () => {
  it('prints yen with no minor unit', () => {
    expect(formatMoney(370873, 'JPY')).toBe('¥370,873')
  })

  it('never prints a fractional yen, even when handed one', () => {
    // Storage rounds first, but a document must not render a decimal even if a
    // caller slips one through.
    expect(formatMoney(370873.4, 'JPY')).toBe('¥370,873')
  })

  it('still prints cents for currencies that have them', () => {
    expect(formatMoney(5822.05, 'EUR')).toBe('€5,822.05')
    expect(formatMoney(1200, 'USD')).toBe('$1,200.00')
    expect(formatMoney(950.5, 'EGP')).toBe('E£950.50')
  })

  it('knows the currencies this operator actually trades in', () => {
    expect(currencySymbol('JPY')).toBe('¥')
    expect(currencyDecimals('JPY')).toBe(0)
    expect(currencyDecimals('EUR')).toBe(2)
  })

  it('falls back to the code rather than inventing a symbol', () => {
    expect(formatMoney(100, 'CHF')).toBe('CHF100.00')
  })
})

describe('no generator formats money on its own', () => {
  const GENERATORS = [
    'lib/invoice-pdf-generator.ts',
    'lib/receipt-pdf-generator.ts',
    'lib/pdf-generator.ts',
    'lib/supplier-document-pdf.ts',
  ]

  for (const file of GENERATORS) {
    it(`${file} has no hardcoded 2-decimal money`, () => {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      // toFixed(2) on a money value is the exact bug: it asserts every currency
      // has cents. If a new one appears here, it will print ¥1,200.00.
      expect(source).not.toMatch(/toFixed\(2\)/)
    })

    it(`${file} has no private currency-symbol table`, () => {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      // A local table is how ¥ went missing in the first place — each one was
      // written before JPY was supported and never revisited.
      expect(source).not.toMatch(/EUR:\s*'€'/)
    })
  }
})
