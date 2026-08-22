// The rate currency is an org setting (organizations.rate_currency). Nothing
// on the rate side of the app may assume euro any more: no conversion FROM a
// literal 'EUR', and no hard-coded € in front of a rate-table amount. The
// finance pages (invoices, payments, reports) are the BILLING side and are
// covered by their own records' currency — not scanned here.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const RATE_SIDE = ['app/rates', 'app/tours', 'app/tour-builder', 'app/b2b', 'app/pricing-grid', 'app/restaurants', 'app/suppliers', 'components/rates']

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full)
  }
  return out
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('rate currency is never assumed to be euro', () => {
  it('no display site converts from a literal EUR', () => {
    const offenders: string[] = []
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      const src = strip(fs.readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/(formatWithConversion|convertCurrency)\([^)]*['"]EUR['"]\)/g)) {
        offenders.push(`${path.relative(ROOT, f)}: ${m[0]}`)
      }
    }
    expect(offenders, 'use rateCurrency from useCurrency()').toEqual([])
  })

  it('no hard-coded € in front of a rate amount on the rate side', () => {
    const offenders: string[] = []
    for (const dir of RATE_SIDE) for (const f of walk(path.join(ROOT, dir))) {
      const src = strip(fs.readFileSync(f, 'utf8'))
      src.split('\n').forEach((line, i) => {
        if (!line.includes('€')) return
        if (/CURRENCY_SYMBOLS|EUR:\s*'€'|currencySymbol/.test(line)) return // a symbol table, not an assumption
        offenders.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 80)}`)
      })
    }
    expect(offenders, 'use rateSymbol from useCurrency()').toEqual([])
  })
})
