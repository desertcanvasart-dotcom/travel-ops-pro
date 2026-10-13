// The itinerary editor's prices (lib/itineraries/editor-pricing).
//
// A yen trip priced from euro rates: the AI stored a line as ¥8,000 (rate
// €50 at 160), and changing its quantity from 1 to 2 wrote "JPY 100" —
// quantity × the EURO rate, labelled yen. And the save wrote the trip's total
// as Σ cost × (1 + margin), dropping each line's client price and the season
// supplement, while the line's client price never moved at all.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { editorFxRate, editorSaveTotals, lineMarkup, repriceEditorLine, type EditorLine } from '@/lib/itineraries/editor-pricing'
import { tripClientTotal } from '@/lib/itinerary-client-price'

const AI_LINE: EditorLine = {
  quantity: 1, rate_eur: 50, rate_non_eur: 50,
  total_cost: 8000, client_price: 10000,
  supplier_currency: 'EUR', supplier_cost_original: 50, exchange_rate_used: 160,
}

describe('a quantity or rate change is priced in the trip currency', () => {
  it('converts at the rate the line already carries (the bug: JPY 100)', () => {
    const out = repriceEditorLine(AI_LINE, { quantity: 2, rate_eur: 50, rate_non_eur: 50 }, { rateCurrency: 'EUR', tripCurrency: 'JPY', fx: 170 })
    expect(out).toMatchObject({ quantity: 2, total_cost: 16000, supplier_cost_original: 100, exchange_rate_used: 160, supplier_currency: 'EUR' })
    // The client price moves with the cost at the line's own markup (×1.25).
    expect(out!.client_price).toBe(20000)
  })

  it("a new line (no rate of its own) takes the trip's rate, and the trip's margin", () => {
    const fresh: EditorLine = { quantity: 1, rate_eur: 0, rate_non_eur: 0, total_cost: 0 }
    const out = repriceEditorLine(fresh, { quantity: 3, rate_eur: 20, rate_non_eur: 20 }, { rateCurrency: 'EUR', tripCurrency: 'JPY', fx: 160, marginPercent: 30 })
    expect(out).toMatchObject({ total_cost: 9600, supplier_cost_original: 60, exchange_rate_used: 160, client_price: 12480 })
  })

  it('same currency: no conversion, rate 1', () => {
    const fresh: EditorLine = { quantity: 1, rate_eur: 0, rate_non_eur: 0, total_cost: 0 }
    const out = repriceEditorLine(fresh, { quantity: 2, rate_eur: 45.5, rate_non_eur: 45.5 }, { rateCurrency: 'USD', tripCurrency: 'USD', fx: null })
    expect(out).toMatchObject({ total_cost: 91, exchange_rate_used: 1, client_price: 113.75 })
  })

  it('refuses (null) rather than write a rate-currency number as the trip currency when no rate is known', () => {
    const fresh: EditorLine = { quantity: 1, rate_eur: 0, rate_non_eur: 0, total_cost: 0 }
    expect(repriceEditorLine(fresh, { quantity: 2, rate_eur: 50, rate_non_eur: 50 }, { rateCurrency: 'EUR', tripCurrency: 'JPY', fx: null })).toBeNull()
  })

  it('a line converted from another rate currency does not reuse that rate', () => {
    const usdLine: EditorLine = { ...AI_LINE, supplier_currency: 'USD', exchange_rate_used: 150 }
    const out = repriceEditorLine(usdLine, { quantity: 1, rate_eur: 50, rate_non_eur: 50 }, { rateCurrency: 'EUR', tripCurrency: 'JPY', fx: 160 })
    expect(out!.exchange_rate_used).toBe(160)
  })
})

describe('the exchange rate the editor uses', () => {
  const frozen = { base: 'EUR', date: '', rates: { JPY: 158 } }
  const live = { base: 'EUR', date: '', rates: { JPY: 171 } }
  it('the frozen rate first, then today’s, else unknown', () => {
    expect(editorFxRate('EUR', 'JPY', { frozen, live })).toBe(158)
    expect(editorFxRate('EUR', 'JPY', { live })).toBe(171)
    expect(editorFxRate('EUR', 'JPY', {})).toBeNull()
    expect(editorFxRate('EUR', 'EUR', {})).toBe(1)
  })
})

describe('what the save stores on the itinerary', () => {
  it('is what the client pays: line client prices + the season supplement (the view page’s figure)', () => {
    const itinerary = { total_cost: 0, season_uplift_amount: 5000 }
    const lines: EditorLine[] = [
      AI_LINE,
      // A new line with no client price yet counts at cost + 25%.
      { quantity: 1, rate_eur: 0, rate_non_eur: 0, total_cost: 4000 },
      // Deleted lines are not counted.
      { quantity: 1, rate_eur: 0, rate_non_eur: 0, total_cost: 999, client_price: 999, isDeleted: true },
    ]
    const totals = editorSaveTotals(itinerary, lines)
    expect(totals).toEqual({ supplier_cost: 12000, total_cost: 20000, profit: 8000 })
    expect(totals.total_cost).toBe(tripClientTotal(itinerary, [{ services: lines.filter(l => !l.isDeleted) }]))
  })

  it('markup: the line’s own when it has a client price, else the trip’s margin, else 25%', () => {
    expect(lineMarkup({ total_cost: 100, client_price: 140 }, 10)).toBeCloseTo(1.4)
    expect(lineMarkup({ total_cost: 100, client_price: null }, 10)).toBeCloseTo(1.1)
    expect(lineMarkup({ total_cost: 0, client_price: null }, null)).toBeCloseTo(1.25)
  })
})

describe('the editor page uses them', () => {
  const src = readFileSync(join(process.cwd(), 'app', 'itineraries', '[id]', 'edit', 'page.tsx'), 'utf8')
  it('no line total is written as quantity × rate any more', () => {
    expect(src).not.toMatch(/total_cost:\s*service\.quantity\s*\*/)
    expect(src).not.toMatch(/const total = qty \* \(service\.rate_non_eur/)
    expect(src).toContain('repriceEditorLine(')
  })
  it('the itinerary row is written after the services, with editorSaveTotals', () => {
    const save = src.slice(src.indexOf('const saveDraft = async'), src.indexOf('const calculatePricing = async'))
    expect(save.indexOf("from('itinerary_services')")).toBeGreaterThan(-1)
    expect(save.indexOf("from('itineraries')")).toBeGreaterThan(save.lastIndexOf("from('itinerary_services')"))
    expect(save).toContain('editorSaveTotals(itinerary, services)')
    expect(save).not.toMatch(/supplierCost \* \(1 \+ marginPct/)
  })
})
