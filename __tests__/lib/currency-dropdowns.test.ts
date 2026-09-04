// Every currency dropdown must come from the ONE vocabulary
// (lib/org-rate-currency RATE_CURRENCIES) — not a hand-typed option list.
//
// Five separate inline lists drifted before this scan existed: the pricing
// grid's dropdown lacked JPY entirely (the operator noticed while quoting in
// yen, 2026-09-04), and clients/new, both payment forms, the payment editor
// and both invoice forms lacked EGP. A hand-typed <option value="EUR"> is
// how the next drift starts, so none may exist.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

describe('currency dropdowns come from RATE_CURRENCIES', () => {
  const sources = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]

  it.each(sources.map(f => path.relative(ROOT, f)))('%s', file => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    expect(
      /<option[^>]*value=["'](EUR|USD|GBP|EGP|JPY)["']/.test(code),
      `${file} hand-types a currency <option> — build the list from RATE_CURRENCIES (lib/org-rate-currency) with currencySymbol (lib/currency-totals) instead; hand-typed lists are how the grid lost JPY`
    ).toBe(false)
  })

  it('no file hardcodes a currency array literal outside the two canonical modules', () => {
    const canonical = new Set([
      'lib/org-rate-currency.ts', 'lib/currency-service.ts', 'lib/exchange-rate-api.ts',
      // DELIBERATE: a B2B partner's BILLING currency preference (CHF, AUD,
      // CAD included) — a different vocabulary from the five rate-entry
      // currencies, so it must not be squeezed into RATE_CURRENCIES.
      'app/b2b/partners/page.tsx',
    ])
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'lib'))]) {
      const rel = path.relative(ROOT, f)
      if (canonical.has(rel)) continue
      const code = stripComments(fs.readFileSync(f, 'utf8'))
      expect(
        /\[\s*['"](EUR|USD)['"]\s*,\s*['"](USD|EUR)['"]\s*,\s*['"]GBP['"]/.test(code),
        `${rel} declares its own currency list — import RATE_CURRENCIES instead`
      ).toBe(false)
    }
  })
})
