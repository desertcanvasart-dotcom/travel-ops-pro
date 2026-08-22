// Money is never assumed to be euro. Rate-side amounts carry the org's rate
// currency (organizations.rate_currency); billing-side amounts carry their
// record's own currency (invoice, payment, expense, trip); reports state one
// reporting currency. A literal '€' in front of an amount, or a conversion
// FROM a literal 'EUR', is a bug — the 2026-08-22 USD move found ~400 of them.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const SCAN = ['app', 'components', 'lib/templates', 'lib/twilio-whatsapp.ts', 'lib/template-placeholders.ts']
// Files whose '€' is legitimately about euros: currency pickers and parsers.
const ALLOW_FILE = [/parse-supplier-invoice/, /exchange-rate/, /currency-service\.ts$/, /currency-totals\.ts$/]
// Lines that are a symbol table or a currency picker option, not an assumption.
const ALLOW_LINE = /CURRENCY_SYMBOLS|EUR:\s*'€'|currencySymbol|value="EUR"|value='EUR'|console\.|debugLog/

function walk(p: string, out: string[] = []): string[] {
  if (!fs.existsSync(p)) return out
  if (fs.statSync(p).isFile()) { out.push(p); return out }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full)
  }
  return out
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const files = () => SCAN.flatMap(s => walk(path.join(ROOT, s))).filter(f => !ALLOW_FILE.some(rx => rx.test(f)))

describe('money is never assumed to be euro', () => {
  it('no display site converts from a literal EUR', () => {
    const offenders: string[] = []
    for (const f of files()) {
      for (const m of strip(fs.readFileSync(f, 'utf8')).matchAll(/(formatWithConversion|convertCurrency)\([^)]*['"]EUR['"]\)/g)) offenders.push(`${path.relative(ROOT, f)}: ${m[0]}`)
    }
    expect(offenders, 'use rateCurrency from useCurrency()').toEqual([])
  })

  it('no hard-coded € in front of an amount anywhere in the app', () => {
    const offenders: string[] = []
    for (const f of files()) {
      strip(fs.readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        if (!line.includes('€') || ALLOW_LINE.test(line)) return
        offenders.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 80)}`)
      })
    }
    expect(offenders, 'use formatMoney(amount, record.currency) / rateSymbol / formatTotals').toEqual([])
  })
})
