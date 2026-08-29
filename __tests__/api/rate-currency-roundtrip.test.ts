// ============================================
// What a rate API saves, its GET must return
// ============================================
// entrance_fees.rate_currency saved fine and then vanished on read: the
// attractions GET rebuilt each row through a hand-maintained field list
// written before per-rate-currency existed. The list rendered EGP rates
// through the org formatter (600 EGP → ¥95,808 for a JPY operator) and the
// edit form reopened on the default — which the operator reported,
// reasonably, as "the currency does not save". It saved; the read ate it.
//
// Source-scan: any rates route whose GET rebuilds rows with a monetary
// field list must carry rate_currency in that same GET.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) routeFiles(full, out)
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

describe('rates GET routes round-trip rate_currency', () => {
  for (const file of routeFiles(join(process.cwd(), 'app/api/rates'))) {
    const src = readFileSync(file, 'utf8')
    const getBody = src.includes('export async function GET')
      ? src.slice(src.indexOf('export async function GET'), src.indexOf('export async function', src.indexOf('export async function GET') + 10) === -1 ? undefined : src.indexOf('export async function', src.indexOf('export async function GET') + 10))
      : ''
    const rebuildsMonetaryFields = /(?:^|\s)(?:eur_rate|non_eur_rate|base_rate_eur|rate_eur):\s/m.test(getBody)
    if (!rebuildsMonetaryFields) continue

    it(`${file.replace(`${process.cwd()}/`, '')} returns rate_currency from its GET transform`, () => {
      expect(
        getBody.includes('rate_currency'),
        'this GET rebuilds rows with a field list but drops rate_currency — the saved currency vanishes on read',
      ).toBe(true)
    })
  }

  it('the scan still finds the transforms it guards (matcher not dead)', () => {
    const list = readFileSync(join(process.cwd(), 'app/api/rates/attractions/route.ts'), 'utf8')
    expect(list).toContain('rate_currency: item.rate_currency')
  })
})
