import { vi, describe, it, expect, beforeAll } from 'vitest'

// The calculator's day editor saved an untick on day 1's airport arrival, and
// the engine re-ticked it at pricing time (the first/last-day rule), so the
// line came back and the operator read it as "it does not save". Same for the
// last ticket unticked in the picker: the day fell back to pricing its wording
// (operator, 2026-10-01). What the operator set by hand now stands.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { parseItinerary } from '@/lib/auto-pricing-service'
import { resolveAttractions, buildAliasMap } from '@/lib/pricing/attractions'
import { markServiceSetByHand, toEditableDay } from '@/lib/itineraries/editable-day'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const none = { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false }

function threeDays(first: Record<string, unknown> = {}, last: Record<string, unknown> = {}) {
  return [
    { day: 1, title: 'Arrive Cairo', city: 'Cairo', meals: [], attractions: [], services: { ...none }, ...first },
    { day: 2, title: 'Giza', city: 'Cairo', meals: [], attractions: ['Giza Plateau'], services: { ...none, guide_required: true } },
    { day: 3, title: 'Depart Cairo', city: 'Cairo', meals: [], attractions: [], services: { ...none }, ...last },
  ]
}

describe('service flags set by hand', () => {
  it('still forces arrival and departure onto the first and last day by default', () => {
    const days = parseItinerary(threeDays())
    expect(days[0].services.airport_arrival).toBe(true)
    expect(days[0].services.hotel_checkin).toBe(true)
    expect(days[2].services.airport_departure).toBe(true)
    expect(days[2].services.hotel_checkout).toBe(true)
  })

  it('keeps an arrival the operator unticked by hand', () => {
    const days = parseItinerary(threeDays(
      { services_set_by_hand: ['airport_arrival'] },
      { services_set_by_hand: ['hotel_checkout'] },
    ))
    expect(days[0].services.airport_arrival).toBe(false)
    // only the flag they touched — the rest of the rule still applies
    expect(days[0].services.hotel_checkin).toBe(true)
    expect(days[2].services.hotel_checkout).toBe(false)
    expect(days[2].services.airport_departure).toBe(true)
  })

  it('keeps a guide the operator ticked on a transfer-only day', () => {
    const days = parseItinerary(threeDays({
      services: { ...none, guide_required: true },
      services_set_by_hand: ['guide_required'],
    }))
    expect(days[0].services.guide_required).toBe(true)
  })

  it('markServiceSetByHand records each key once and survives toEditableDay', () => {
    const d = markServiceSetByHand(markServiceSetByHand(toEditableDay({}, 0), 'airport_arrival'), 'airport_arrival')
    expect(d.services_set_by_hand).toEqual(['airport_arrival'])
    expect(toEditableDay(d, 0).services_set_by_hand).toEqual(['airport_arrival'])
  })
})

describe('tickets set by hand', () => {
  const fees = [{ id: 'fee-giza', attraction_name: 'Giza Plateau', eur_rate: 20, non_eur_rate: 20 }]
  const aliases = buildAliasMap([])

  it('prices the wording when the picker was never used', () => {
    const r = resolveAttractions([{ day: 2, attractions: ['Giza Plateau'], attraction_ids: [] }], fees, aliases, true)
    expect(r.tickets.map(t => t.id)).toEqual(['fee-giza'])
  })

  it('charges no ticket once the operator unticked the last one', () => {
    const r = resolveAttractions(
      [{ day: 2, attractions: ['Giza Plateau'], attraction_ids: [], tickets_set_by_hand: true }],
      fees, aliases, true,
    )
    expect(r.tickets).toEqual([])
    expect(r.unresolved).toEqual([])
  })

  it('parseItinerary carries the mark to the resolver', () => {
    const days = parseItinerary(threeDays())
    expect(days[1].tickets_set_by_hand).toBeUndefined()
    const marked = parseItinerary([{ ...threeDays()[1], attraction_ids: [], tickets_set_by_hand: true }])
    expect(marked[0].tickets_set_by_hand).toBe(true)
  })

  it('does not re-read sights from the title once the operator emptied them', () => {
    const day = { day: 1, title: 'Visit Karnak Temple', city: 'Luxor', meals: [], attractions: [], services: { ...none } }
    expect(parseItinerary([day])[0].attractions.length).toBeGreaterThan(0)
    expect(parseItinerary([{ ...day, attractions_set_by_hand: true }])[0].attractions).toEqual([])
  })
})
