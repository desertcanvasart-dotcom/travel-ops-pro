// The Add Flight Rate form had TWO places to type a price: a "Price · EU
// passport" box at the top and a fare inside each validity period. They were
// not two views of one number — the save wrote the FIRST PERIOD over the
// column (legacyColumnMirror), so whatever was typed up top was discarded the
// moment a period existed. Operator, 2026-09-19: "the form has two places to
// enter prices, I think this is not the best thing to do."
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RATE_FIELDS, legacyColumnMirror } from '@/lib/rates/rate-seasons'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const form = read('app/rates/flights/flights-content.tsx')
const editor = read('components/rates/RateSeasonsEditor.tsx')

describe('one place to type a fare', () => {
  it('the form no longer takes a price outside the periods', () => {
    expect(form).not.toContain('id="base_rate_eur"')
    expect(form).not.toMatch(/formData\.guide_rate \?\? ''/)
  })

  it('keeps what belongs to the contract rather than to one dated block', () => {
    // Currency and baggage are properties of the whole fare, not of a season.
    expect(form).toContain('<RateCurrencyField')
    expect(form).toContain('formData.baggage_kg')
  })

  it('refuses a fare with no priced period', () => {
    // Checking base_rate_eur would check a column nothing on the form fills —
    // it is written by the mirror, from period one.
    expect(form).toContain('Add at least one validity period with a fare')
    expect(form).toMatch(/Number\(s\.rates\?\.base_rate_eur\) > 0/)
  })
})

describe('a flight period has ONE fare, not a passport pair', () => {
  it('the editor shows a single group for flights', () => {
    const groups = editor.slice(editor.indexOf('flight: ['), editor.indexOf('}', editor.indexOf('flight: [')))
    expect(groups).toContain('base_rate_eur')
    expect(groups).toContain('tax_eur')
    // "A seat costs what a seat costs" — operator, 2026-08-30. A second box
    // would be left at zero, which prices as FREE rather than as "the same".
    expect(groups).not.toContain('base_rate_non_eur')
  })

  it('does not announce a passport split it is not making', () => {
    expect(editor).toContain('FIELD_GROUPS[entity].length > 1 &&')
  })

  it('the save fills the non-EU columns from the EU ones', () => {
    // The split is notional for a flight, but the stored shape keeps both so
    // nothing downstream has to know that.
    expect(form).toMatch(/base_rate_non_eur: Number\(p\.rates\?\.base_rate_eur\) \|\| 0/)
    expect(form).toMatch(/tax_non_eur: Number\(p\.rates\?\.tax_eur\) \|\| 0/)
  })
})

describe('why the top box could not have worked', () => {
  it('the mirror writes the first period over the columns', () => {
    const mirrored = legacyColumnMirror(
      [{ name: 'Low', from: '2026-05-01', to: '2026-09-30', rates: { base_rate_eur: 300, tax_eur: 20 } }],
      'flight'
    )
    expect(mirrored.base_rate_eur).toBe(300)
    expect(mirrored.tax_eur).toBe(20)
    expect(mirrored.rate_valid_from).toBe('2026-05-01')
  })

  it('and the route spreads it AFTER the typed values', () => {
    const route = read('app/api/rates/flights/route.ts')
    expect(route.indexOf('base_rate_eur: parseFloat(body.base_rate_eur)'))
      .toBeLessThan(route.indexOf("legacyColumnMirror(flightSeasons, 'flight')"))
  })

  it('a flight period carries the fields the fare is made of', () => {
    expect([...RATE_FIELDS.flight]).toEqual([
      'base_rate_eur', 'tax_eur', 'base_rate_non_eur', 'tax_non_eur', 'guide_rate',
    ])
  })
})
