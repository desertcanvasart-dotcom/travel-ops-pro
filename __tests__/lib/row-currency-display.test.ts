// A rate row that names its own currency must be DISPLAYED in that currency.
//
// Transport Packages rendered `{rateSymbol}{pkg.sedan_rate}` — the org-wide
// symbol pasted in front of every row's raw number. A package priced at
// 2000 EGP therefore read "$2000": a third currency, matching neither the
// stored data nor the viewer's own preference (operator, 1 Sep). The
// /rates/* pages had already been moved onto formatRateInRowCurrency; this
// page was simply missed, and nothing noticed.
//
// The rule: in a file that knows about rate_currency, a global symbol may
// not be concatenated directly onto a row field. Computed TOTALS are
// exempt — they are normalised into the run currency before display, so the
// org symbol is correct for them; this scan only looks at files that read
// rate_currency at all.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(e)) out.push(full)
  }
  return out
}

describe('row-currency display', () => {
  it('no file that knows rate_currency prefixes a global symbol onto a row amount', () => {
    const violations: string[] = []
    for (const file of walk(join(ROOT, 'app'))) {
      const src = readFileSync(file, 'utf8')
      // Only files that model per-row currency at all.
      if (!src.includes('rate_currency')) continue
      for (const m of src.matchAll(/\{rateSymbol\}\{([a-zA-Z_$][\w.$]*)\}/g)) {
        violations.push(`${file.replace(ROOT + '/', '')}: {rateSymbol}{${m[1]}} — use formatRateInRowCurrency(amount, row, formatRate)`)
      }
    }
    expect(
      violations,
      'These paste the org currency symbol onto a row that carries its own rate_currency.'
    ).toEqual([])
  })
})
