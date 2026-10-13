// Operate audit — Departures #2, #5, #9: the pure rules behind the routes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seatCounts, seatsFree, isBookableStatus } from '@/lib/departures/seats'
import { holdTransition } from '@/lib/departures/holds'
import { resolveGridFx } from '@/lib/departures/grid-fx'
import { durationError, paxRangeError, mirroredFieldsTouched, seatsBelowTakenMessage } from '@/lib/departures/validate'
import { uniqueValidDates, normaliseDates, MAX_GENERATED_DATES } from '@/lib/departures/generate-dates'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('one seat rule: booked outside the app + confirmed + pending', () => {
  it('adds the three, never below 0 free', () => {
    const holds = [{ pax: 5, status: 'confirmed' }, { pax: 1, status: 'pending' }, { pax: 3, status: 'cancelled' }]
    expect(seatCounts({ max_pax: 10, booked_pax: 2 }, holds)).toEqual({
      booked_pax: 2, held_confirmed: 5, held_pending: 1, seats_taken: 8, seats_free: 2,
    })
    expect(seatsFree({ max_pax: 4, booked_pax: 0 }, [{ pax: 6, status: 'pending' }])).toBe(0)
  })

  it('a date fully held by web orders has no seats, though booked_pax is 0', () => {
    expect(seatsFree({ max_pax: 6, booked_pax: 0 }, [{ pax: 4, status: 'pending' }, { pax: 2, status: 'pending' }])).toBe(0)
  })

  it('the order intake uses the same rule', () => {
    const s = src('lib/intake/process-order.ts')
    expect(s).toContain("import { isBookableStatus, seatsFree } from '@/lib/departures/seats'")
    expect(s).not.toMatch(/Math\.max\(Number\(departure\.booked_pax\)/)
  })

  it('only Open, Limited and Guaranteed are bookable', () => {
    expect(['open', 'limited', 'guaranteed'].map(isBookableStatus)).toEqual([true, true, true])
    expect(['draft', 'full', 'cancelled', null].map(isBookableStatus)).toEqual([false, false, false, false])
  })

  it('the false "kept by hand on the departures grid" comment is gone from the intake', () => {
    expect(src('lib/intake/process-order.ts')).not.toContain('kept by hand on the departures grid')
  })
})

describe('confirming and releasing a hold', () => {
  it('pending → confirmed; pending or confirmed → cancelled', () => {
    expect(holdTransition('confirm', 'pending', 'open')).toEqual({ from: 'pending', to: 'confirmed' })
    expect(holdTransition('release', 'pending', 'open')).toEqual({ from: 'pending', to: 'cancelled' })
    expect(holdTransition('release', 'confirmed', 'cancelled')).toEqual({ from: 'confirmed', to: 'cancelled' })
  })

  it('refuses what makes no sense', () => {
    expect(holdTransition('confirm', 'confirmed', 'open')).toMatchObject({ status: 409 })
    expect(holdTransition('confirm', 'pending', 'cancelled')).toMatchObject({ status: 409 })
    expect(holdTransition('release', 'cancelled', 'open')).toMatchObject({ status: 409 })
    expect(holdTransition('delete', 'pending', 'open')).toMatchObject({ status: 400 })
  })
})

describe('the grid prices in the company currency', () => {
  const rates = { EUR: 1, USD: 1.08, JPY: 162, EGP: 52 }

  it('no conversion when the rates already are in it', () => {
    expect(resolveGridFx('EUR', 'EUR', null, rates)).toEqual({ fx: 1, source: 'same' })
    expect(resolveGridFx('JPY', 'JPY', '160', rates)).toEqual({ fx: 1, source: 'same' })
  })

  it('target per rate-currency unit from the app rates — the right way round', () => {
    expect(resolveGridFx('USD', 'JPY', null, rates)).toEqual({ fx: 150, source: 'rates' })
    const egpToEur = resolveGridFx('EGP', 'EUR', null, rates)
    expect('fx' in egpToEur && egpToEur.fx).toBeCloseTo(1 / 52, 6)
  })

  it('a typed rate wins; no rate at all is an error, never 160', () => {
    expect(resolveGridFx('USD', 'JPY', '155.5', rates)).toEqual({ fx: 155.5, source: 'typed' })
    expect(resolveGridFx('GBP', 'JPY', null, rates)).toEqual({ error: expect.stringMatching(/No exchange rate from GBP to JPY/) })
    expect(src('app/api/departures/grid/route.ts')).not.toMatch(/\b160\b/)
    expect(src('app/api/departures/grid/route.ts')).not.toContain("DEFAULT_TARGET_CURRENCY = 'JPY'")
  })
})

describe('departure writes', () => {
  it('a duration is a whole number of days from 1', () => {
    expect(durationError(8)).toBeNull()
    expect(durationError(2.5)).toMatch(/whole number/)
    expect(durationError(0)).toMatch(/whole number/)
    expect(durationError(null)).toMatch(/whole number/)
  })

  it('min pax cannot exceed max pax', () => {
    expect(paxRangeError(10, 2)).toBeNull()
    expect(paxRangeError(10, null)).toBeNull()
    expect(paxRangeError(4, 6)).toMatch(/min_pax \(6\) cannot be more than max_pax \(4\)/)
  })

  it('names the partner-owned fields an edit touches', () => {
    expect(mirroredFieldsTouched({ max_pax: 4, fuel_surcharge_pp: 100, status: 'full' })).toEqual(['max_pax', 'status'])
    expect(mirroredFieldsTouched({ fuel_surcharge_pp: 100, internal_notes: 'x' })).toEqual([])
  })

  it('says what is taken when seats would go below it', () => {
    expect(seatsBelowTakenMessage({ booked_pax: 2, held: 6, taken: 8 })).toBe(
      'This date has 8 seat(s) taken (2 booked outside the app + 6 held) — seats cannot go below that')
  })

  it('a list of dates longer than the cap is visible as such, not cut', () => {
    const many = Array.from({ length: MAX_GENERATED_DATES + 5 }, (_, i) =>
      new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10))
    expect(uniqueValidDates(many)).toHaveLength(MAX_GENERATED_DATES + 5)
    expect(normaliseDates(many)).toHaveLength(MAX_GENERATED_DATES)
    expect(src('app/api/departures/bulk/route.ts')).toContain('uniqueValidDates(')
  })
})
