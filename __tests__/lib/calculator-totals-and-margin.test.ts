// Operator, 2026-09-20, reading the results panel: "the total cost is there
// without mentioning the number of pax, which is actually written above but it
// is much easier for the user to see the pax number along with the total
// cost." And: "I wonder if you can turn the margin into a box where a user can
// increase, decrease the percent there and see a live change for the rate."
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('app/b2b/calculator/[id]/page.tsx')
const en = JSON.parse(read('messages/en.json')).b2bCalculator
const ja = JSON.parse(read('messages/ja.json')).b2bCalculator

describe('a total says who it is for', () => {
  it('puts the pax count under the total cost', () => {
    // A total for two read exactly like a total for six.
    expect(page).toContain("t('forPax', { count: result.num_pax })")
    expect(en.forPax).toBe('for {count} passengers')
  })

  it('names the tour leader when the group carries one', () => {
    expect(page).toContain('result.tour_leader_included &&')
    expect(en.plusTourLeader).toMatch(/tour leader/i)
  })

  it('says what the per-person figure was divided by', () => {
    // The divisor is PAYING pax — a tour leader rides on the group's cost
    // without paying a share of it.
    expect(page).toContain('result.num_paying_pax ?? result.num_pax')
    expect(en.dividedBy).toBe('across {count} paying')
  })

  it('is translated', () => {
    for (const k of ['forPax', 'plusTourLeader', 'dividedBy']) expect(ja[k]).toBeTruthy()
  })
})

describe('the margin can be nudged, and the price follows', () => {
  it('has steppers either side of the number', () => {
    expect(page).toContain("aria-label={t('marginUp')}")
    expect(page).toContain("aria-label={t('marginDown')}")
    expect(en.marginUp).toBeTruthy()
    expect(en.marginDown).toBeTruthy()
  })

  it('re-prices ON THE SERVER, not in the browser', () => {
    // A margin re-derived client-side would be a second opinion about a number
    // a customer is quoted — and the breakdown and pax sheet below would still
    // be showing the first one.
    expect(page).toContain('void runPricing({ optionalIds: selectedOptionals, resetView: false })')
  })

  it('waits for the operator to stop moving it', () => {
    // Each run re-reads the whole rate catalogue; holding the stepper would
    // otherwise fire one per click.
    expect(page).toMatch(/setTimeout\([\s\S]{0,200}?\}, 600\)/)
    expect(page).toContain('clearTimeout(id)')
  })

  it('does not reprice before a first price exists', () => {
    expect(page).toContain('if (!result) return')
  })
})

describe('repricing must not do what calculating does', () => {
  it('leaves the itinerary alone', () => {
    // calculatePrice auto-saves the itinerary — right when the operator asks
    // for a price, wrong when they nudge a margin.
    const runPricing = page.slice(page.indexOf('const runPricing ='), page.indexOf('const calculatePrice ='))
    expect(runPricing).not.toContain('saveItineraryChanges()')
    expect(runPricing).not.toContain('setSavedQuote(null)')
  })

  it('leaves the breakdown open where the operator had it', () => {
    // Re-expanding every day on each nudge would collapse what they were
    // reading, which is the thing they nudged the margin to compare against.
    expect(page).toContain('if (opts.resetView) {')
    expect(page).toContain('resetView: true')
    expect(page).toContain('resetView: false')
  })

  it('and calculating still does all of it', () => {
    const calc = page.slice(page.indexOf('const calculatePrice ='), page.indexOf('const calculatePrice =') + 700)
    expect(calc).toContain('saveItineraryChanges()')
    expect(calc).toContain('setSavedQuote(null)')
    expect(calc).toContain('resetView: true')
  })
})
