// The itinerary page's status line and its one main button
// (lib/itineraries/trip-stage, ported from autoura-saas).
import { describe, it, expect } from 'vitest'
import { defaultTab, nextAction, tripSteps, type TripFacts } from '@/lib/itineraries/trip-stage'

const facts = (over: Partial<TripFacts> = {}): TripFacts => ({
  status: 'draft', hasBooking: false, hasInvoice: false, invoiced: null, paid: null,
  startDate: '2026-12-05', endDate: '2026-12-12', today: '2026-10-07', ...over,
})
const done = (f: TripFacts) => tripSteps(f).filter(s => s.done).map(s => s.key)
const current = (f: TripFacts) => tripSteps(f).find(s => s.current)?.key

describe('tripSteps', () => {
  it('a draft has done nothing yet; it is at the quote', () => {
    expect(done(facts())).toEqual([])
    expect(current(facts())).toBe('quoted')
  })

  it('a booking means quoted and confirmed too', () => {
    expect(done(facts({ status: 'sent', hasBooking: true }))).toEqual(['quoted', 'confirmed', 'booked'])
  })

  it('invoiced without a booking shows booked undone, and the trip is there', () => {
    const f = facts({ status: 'confirmed', hasInvoice: true, invoiced: 1000, paid: 0 })
    expect(done(f)).toEqual(['quoted', 'confirmed', 'invoiced'])
    expect(current(f)).toBe('booked')
  })

  it('paid in full is paid; part-paid is not', () => {
    const f = { status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 1000 }
    expect(done(facts({ ...f, paid: 1000 }))).toContain('paid')
    expect(done(facts({ ...f, paid: 400 }))).not.toContain('paid')
  })

  it('a trip that ran still owing money is operated but not paid', () => {
    const f = facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 1000, paid: 0, today: '2026-12-20' })
    expect(done(f)).toContain('operated')
    expect(done(f)).not.toContain('paid')
    expect(current(f)).toBe('paid')
  })
})

describe('nextAction', () => {
  it('walks the trip from quote to close-out', () => {
    expect(nextAction(facts())?.kind).toBe('send_quote')
    expect(nextAction(facts({ status: 'sent' }))?.kind).toBe('convert')
    expect(nextAction(facts({ status: 'confirmed' }))?.kind).toBe('create_booking')
    expect(nextAction(facts({ status: 'confirmed', hasBooking: true }))?.kind).toBe('create_invoice')
    expect(nextAction(facts({ status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 1000, paid: 0 }))?.kind).toBe('record_payment')
    const paid = { status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 1000, paid: 1000 }
    expect(nextAction(facts(paid))?.kind).toBe('assign_resources')
    expect(nextAction(facts({ ...paid, today: '2026-12-06' }))?.kind).toBe('open_trip_log')
    expect(nextAction(facts({ ...paid, today: '2026-12-13' }))?.kind).toBe('close_out')
  })

  it('nothing to do on a cancelled or closed trip', () => {
    expect(nextAction(facts({ status: 'cancelled' }))).toBeNull()
    expect(nextAction(facts({ status: 'completed' }))).toBeNull()
  })
})

describe('defaultTab', () => {
  it('the days before the trip, operations while it runs, the money after', () => {
    expect(defaultTab(facts())).toBe('itinerary')
    expect(defaultTab(facts({ today: '2026-12-08' }))).toBe('operations')
    expect(defaultTab(facts({ today: '2026-12-13' }))).toBe('finance')
    expect(defaultTab(facts({ status: 'cancelled', today: '2026-12-13' }))).toBe('itinerary')
  })
})
