// A rate row that names its own currency must be DISPLAYED in that currency,
// and rate amounts in different currencies must never be merged into one stat.
//
// Three shapes of the same mistake have now shipped, each found by the
// operator looking at a screen rather than by anything here:
//
//   1. `{rateSymbol}{pkg.sedan_rate}` — the org symbol pasted in front of a
//      row's raw number. A package stored as 2000 EGP read "$2000".
//   2. `{formatRate(rate.rate_eur)}` followed by a badge printing the row's
//      OWN currency code — "$500.00 EGP", which contradicts itself in place.
//   3. `rates.reduce((sum, r) => sum + r.rate_eur, 0) / rates.length` — an
//      average over rows in different currencies, labelled with the org
//      symbol. Two EGP rows averaged to a header reading "Avg. Tip $600.00".
//
// The first version of this file only knew shape 1, which is exactly why 2
// and 3 survived it. Each rule below is a shape that reached production.
//
// Computed TOTALS normalised into the run currency are exempt: this scan only
// looks at files that read rate_currency at all.
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

/** Files that model per-row currency at all. */
function currencyAwareFiles(dir: string): { file: string; src: string }[] {
  return walk(join(ROOT, dir))
    .map(file => ({ file, src: readFileSync(file, 'utf8') }))
    .filter(({ src }) => src.includes('rate_currency'))
}

const rel = (f: string) => f.replace(ROOT + '/', '')

describe('row-currency display', () => {
  it('no file that knows rate_currency prefixes a global symbol onto a row amount', () => {
    const violations: string[] = []
    for (const { file, src } of currencyAwareFiles('app')) {
      for (const m of src.matchAll(/\{rateSymbol\}\{([a-zA-Z_$][\w.$]*)\}/g)) {
        violations.push(`${rel(file)}: {rateSymbol}{${m[1]}} — use formatRateInRowCurrency(amount, row, formatRate)`)
      }
    }
    expect(
      violations,
      'These paste the org currency symbol onto a row that carries its own rate_currency.'
    ).toEqual([])
  })

  it('no amount is formatted in the org currency next to a badge naming the row currency', () => {
    // The self-contradicting render: "$500.00" and "EGP" side by side, one of
    // them necessarily wrong. formatRateInRowCurrency() contains the substring
    // "formatRate" but never "formatRate(", so the correct call does not match.
    const violations: string[] = []
    for (const { file, src } of currencyAwareFiles('app')) {
      for (const badge of src.matchAll(/\{(?:\w+)\.rate_currency\}<\/span>/g)) {
        const before = src.slice(Math.max(0, badge.index! - 300), badge.index!)
        if (/formatRate\(/.test(before)) {
          const line = src.slice(0, badge.index!).split('\n').length
          violations.push(`${rel(file)}:${line} — org-formatted amount beside a row-currency badge`)
        }
      }
    }
    expect(
      violations,
      'These print the org currency symbol next to the row\'s own currency code. ' +
        'Use formatRateInRowCurrency(amount, row, formatRate) for the amount.'
    ).toEqual([])
  })

  it('no rates page averages a rate column across currencies by hand', () => {
    // Money in different currencies does not add, and it does not average
    // either. lib/currency-totals averageRateInOneCurrency() is the one way:
    // it averages within a single currency or returns null for a dash.
    const violations: string[] = []
    for (const { file, src } of currencyAwareFiles('app/rates')) {
      for (const m of src.matchAll(/\.reduce\(\(sum/g)) {
        const line = src.slice(0, m.index!).split('\n').length
        violations.push(`${rel(file)}:${line} — hand-rolled sum over rows that each carry a currency`)
      }
    }
    expect(
      violations,
      'Use averageRateInOneCurrency(rows, getAmount, getCurrency) from lib/currency-totals ' +
        'and render it with formatRateAverage(), which averages within one currency or not at all.'
    ).toEqual([])
  })

  it('no rates page formats a row amount with the bare org formatter', () => {
    // Shape 4, found by the operator on the transportation cards (2026-09-02):
    // `{formatRate(eurRate)}` — the org formatter called directly on a row's
    // stored number. 101 EGP rows rendered as "$2,126.00" under a "RATE (USD)"
    // header. No symbol pasted, no badge beside it, no average — so rules 1–3
    // all let it through. The only correct call in a currency-aware file is
    // formatRateInRowCurrency(amount, row, formatRate) — which PASSES
    // formatRate and never calls it — or formatRateAverage() for a stat.
    // The one allowed `formatRate(` is its own definition.
    const violations: string[] = []
    for (const { file, src } of currencyAwareFiles('app/rates')) {
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (!/\bformatRate\(/.test(line)) return
        if (/const formatRate\s*=/.test(line)) return
        if (/formatRateInRowCurrency\(|formatRateAverage\(/.test(line)) return
        violations.push(`${rel(file)}:${i + 1} — ${line.trim().slice(0, 90)}`)
      })
    }
    expect(
      violations,
      'These format a row amount in the org currency. The row carries its own rate_currency: ' +
        'use formatRateInRowCurrency(amount, row, formatRate).'
    ).toEqual([])
  })

  it('no rates page labels an amount column or field with the org currency', () => {
    // Shape 5: `t('rateHeader', { currency: rateCurrency })` above rows that
    // each carry their own currency. A header can name a currency only when
    // every amount under it is in that currency — a per-row card may say
    // `rate.rate_currency || rateCurrency`; a mixed table says nothing.
    const violations: string[] = []
    for (const { file, src } of currencyAwareFiles('app/rates')) {
      for (const m of src.matchAll(/\{\s*currency:\s*rateCurrency\s*\}/g)) {
        const line = src.slice(0, m.index!).split('\n').length
        violations.push(`${rel(file)}:${line} — label interpolates the org currency`)
      }
    }
    expect(
      violations,
      'Label the column "Rate" with no currency, or name the ROW\'s currency (row.rate_currency || rateCurrency).'
    ).toEqual([])
  })

  it('every tour-builder rate fetch asks for rows in the org currency', () => {
    // Shape 6: the tour-builder is a PRICING screen — it sums what it fetches
    // and posts the sum to /api/tours/calculate. A raw row there is not a
    // display slip, it is a wrong total (a 5000 EGP dinner summed as $5000).
    // /api/rates?type=…&in_org_currency=true converts once, server-side.
    const violations: string[] = []
    for (const file of walk(join(ROOT, 'app', 'tour-builder'))) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/\/api\/rates\?type=[^`'"]*/g)) {
        if (!m[0].includes('in_org_currency=true')) {
          const line = src.slice(0, m.index!).split('\n').length
          violations.push(`${rel(file)}:${line} — ${m[0]}`)
        }
      }
    }
    expect(violations, 'Append &in_org_currency=true — the builder must never price raw rows.').toEqual([])
  })
})
