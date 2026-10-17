import { describe, it, expect } from 'vitest'
import {
  isStructuredItinerary, parseStructuredItinerary, readStructuredHeader, itineraryTemplate, namesList, matchOption,
} from '@/app/pricing-grid/lib/structured-itinerary'
import { readbackDays, readbackText } from '@/app/pricing-grid/lib/readback'
import type { AllRates, RateOption } from '@/app/pricing-grid/types'

const opt = (id: string, name: string, extra: Record<string, unknown> = {}): RateOption =>
  ({ id, name, rateEur: 10, rateNonEur: 10, ...extra }) as RateOption

// As the grid's rates route names them: the vehicle first, the route, its type.
const rates = {
  route: [
    opt('t1__sedan', 'Sedan (1-2 pax) — Cairo Airport Transfer', { city: 'Cairo', capacity_min: 1, capacity_max: 2, service_type: 'airport_transfer' }),
    opt('t1__van', 'Van (3-12 pax) — Cairo Airport Transfer', { city: 'Cairo', capacity_min: 3, capacity_max: 12, service_type: 'airport_transfer' }),
    opt('t2__van', 'Van (1-12 pax) — Airport → Full Day → Airport (Sphinx)', { city: 'Cairo', capacity_min: 1, capacity_max: 12, service_type: 'airport_transfer' }),
    opt('t3__sedan', 'Sedan (1-2 pax) — Cairo Sightseeing · Day Tour', { city: 'Cairo', capacity_min: 1, capacity_max: 2, service_type: 'day_tour' }),
  ],
  accommodation: [opt('h1', 'Marriott Mena House Giza (luxury | BB)', { city: 'Giza', single_supp_eur: 50 })],
  entrance_fees: [opt('e1', 'Pyramids of Giza', { city: 'Giza' }), opt('e2', 'Egyptian Museum', { city: 'Cairo' })],
  guide: [opt('g1', 'English Egyptologist', { city: 'Cairo' })],
  meals: [], airport_services: [], hotel_services: [], tipping: [], boat_rides: [], flights: [], experiences: [], water: [], cruise: [],
} as unknown as AllRates

const TEXT = `Package: Full Package
Tier: luxury
Travellers: 2

Day 1 — Cairo
Transport: Cairo Airport Transfer
Hotel: Marriott Mena House
Notes: Arrival

Day 2 — Giza
Transport: Cairo Sightseeing (sedan)
Guide: English Egyptologist
Entrances: Pyramids of Giza; Egyptian Museum; Karnak Temple`

let n = 0
const newId = () => `id${++n}`

describe('the itinerary format', () => {
  it('is told apart from free text', () => {
    expect(isStructuredItinerary(TEXT)).toBe(true)
    expect(isStructuredItinerary('We are 2 arriving Cairo.\nDay 1: arrival, transfer to hotel.\nDay 2: pyramids.')).toBe(false)
  })

  it('reads the header', () => {
    expect(readStructuredHeader(TEXT)).toEqual({ packageType: 'full-package', tier: 'luxury', pax: 2 })
  })

  it('matches each line by name: the plain transfer, the vehicle for the party, the hotel with its supplement', () => {
    const { days, unmatched } = parseStructuredItinerary(TEXT, rates, 4, newId)
    const ids = (d: number, s: string) => days[d].slots.find(x => x.slotId === s)!.selectedItems.map(i => i.rateId)
    expect(ids(0, 'route')).toEqual(['t1__sedan'])
    expect(ids(0, 'accommodation')).toEqual(['h1', 'h1_supp'])
    expect(ids(1, 'route')).toEqual(['t3__sedan'])
    expect(ids(1, 'entrance_fees')).toEqual(['e1', 'e2'])
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0]).toContain('Karnak Temple')
  })

  it('reads back as "route (vehicle)", and that reads in again to the same rates', () => {
    const first = parseStructuredItinerary(TEXT, rates, 2, newId)
    expect(readbackDays(first.days)[0].lines[0]).toBe('Transport: Cairo Airport Transfer (sedan)')
    const again = parseStructuredItinerary(readbackText(first.days, { packageName: 'Full Package', tier: 'luxury', pax: 2 }), rates, 2, newId)
    const all = (r: typeof first) => r.days.map(d => d.slots.flatMap(s => s.selectedItems.map(i => i.rateId)))
    expect(again.unmatched).toEqual([])
    expect(all(again)).toEqual(all(first))
  })

  it('does not choose between two names that fit equally', () => {
    const two = [opt('a', 'Nile Palace (standard | BB)', { city: 'Luxor' }), opt('b', 'Nile Palace (standard | HB)', { city: 'Aswan' })]
    expect(matchOption('Nile Palace', two, '')).toBeNull()
  })

  it('writes a template and names list without the vehicle prefixes, that reads back clean', () => {
    const t = itineraryTemplate(rates, { packageName: 'Full Package', tier: 'luxury', pax: 2, startDate: '2026-11-01' })
    expect(t).toContain('Transport: Cairo Airport Transfer')
    expect(parseStructuredItinerary(t, rates, 2, newId).unmatched).toEqual([])
    expect(namesList(rates)).not.toContain('Sedan (1-2 pax)')
  })
})
