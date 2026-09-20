// Operator, 2026-09-20: "why it is showing EU beside Euro and non-Euro. Is
// this EU should be taken away?"
//
// It is not a currency. `_eur` / `_non_eur` are PASSPORT groups — an EU
// passport pays one rate on a hotel or a cruise and everyone else pays
// another, and the agency's own data uses it (Al Farida summer: $110 EU,
// $150 non-EU). The figures beside it are in the org's rate currency, which is
// USD, so "EU $110.00" invited exactly the reading it got.
//
// So the split stays and the COLUMN says what it is.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const lines = read('components/rates/RatePeriodLines.tsx')
const en = JSON.parse(read('messages/en.json')).rates.ratePeriods
const ja = JSON.parse(read('messages/ja.json')).rates.ratePeriods

describe('the column says these are passports', () => {
  it('heads the group column instead of leaving it blank', () => {
    expect(en.passport).toBe('Passport')
    expect(lines).toContain("{t('passport')}")
    // It used to be an empty spacer, which is what left "EU" to be read as a
    // currency marker next to a dollar sign.
    expect(lines).not.toContain('<span className="w-12" />')
  })

  it('keeps the short values, which fit', () => {
    expect(en.eu).toBe('EU')
    expect(en.nonEu).toBe('Non-EU')
  })

  it('spells it out on hover, for a line read out of context', () => {
    expect(lines).toContain("title={suffix === 'eur' ? t('eurPassportHolders') : t('nonEurPassportHolders')}")
    expect(en.eurPassportHolders).toMatch(/passport/i)
    expect(en.nonEurPassportHolders).toMatch(/passport/i)
  })

  it('is translated', () => {
    expect(ja.passport).toBeTruthy()
  })
})

describe('the split itself is not a currency', () => {
  it('the money is formatted by the caller, in the org currency', () => {
    // This component never decides a currency — the caller's `format` does,
    // and today that prints dollars. Which is why a group label reading "EU"
    // beside "$110.00" could be taken for one.
    expect(lines).toContain('format(f.double)')
    expect(lines).toContain('format: (amount: number) => string')
  })
})
