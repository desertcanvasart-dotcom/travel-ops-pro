// The calculator's editor must never erase what it does not render.
//
// It rebuilt each day from a fixed field list that left out the travel mode,
// the picked ticket and the overnight-in-flight marker, and saving replaces
// the whole itinerary — so reopening a programme and saving erased them. On
// NMS803-CR-ABS seven of eight days had lost their travel mode, and day 1 had
// lost the marker that stops a Cairo hotel being booked on the flight night.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toEditableDay } from '@/lib/itineraries/editable-day'

describe('toEditableDay keeps every stored field', () => {
  const stored = {
    day: 7, title: 'Cairo', city: 'Cairo', overnight_city: 'Cairo', accommodation_type: 'hotel',
    meals: ['breakfast', 'lunch'],
    transport_type: 'flight', transport_rate_id: 'fl-abs-cai', road_transfers: false,
    overnight_kind: 'flight', skip_arrival_checkin: true,
    transport: { service_type: 'day_tour', vehicle_type: 'Horse Carriage' },
    extras: ['sound_light'],
    services: { airport_arrival: true, guide_required: true, cruise_disembark: true },
  }

  it('the travel mode, the picked ticket and the road choice survive', () => {
    const d = toEditableDay(stored, 6)
    expect(d.transport_type).toBe('flight')
    expect(d.transport_rate_id).toBe('fl-abs-cai')
    expect(d.road_transfers).toBe(false)
  })

  it('fields the editor never renders survive too', () => {
    const d = toEditableDay(stored, 6)
    expect(d.overnight_kind).toBe('flight')
    expect(d.skip_arrival_checkin).toBe(true)
    expect(d.transport).toEqual({ service_type: 'day_tour', vehicle_type: 'Horse Carriage' })
    expect(d.extras).toEqual(['sound_light'])
    expect(d.services.cruise_disembark).toBe(true)
  })

  it('still fills the defaults the editor renders', () => {
    const d = toEditableDay({ services: { airport_arrival: 1 } }, 2)
    expect(d).toMatchObject({ day: 3, title: 'Day 3', description: '', meals: [], city: '', overnight_city: null, is_cruise_day: false, attractions: [], attraction_ids: [], accommodation_type: 'hotel' })
    expect(d.services).toMatchObject({ airport_arrival: true, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false })
  })

  it('round-trips: editing nothing and saving writes back what was stored', () => {
    const d = toEditableDay(stored, 6)
    for (const [k, v] of Object.entries(stored)) {
      if (k === 'services') continue
      expect(d[k], k).toEqual(v)
    }
  })
})

describe('the calculator loads days through it', () => {
  it('does not build days from its own field list again', () => {
    const page = readFileSync(join(process.cwd(), 'app/b2b/calculator/[id]/page.tsx'), 'utf8')
    expect(page).toContain('toEditableDay(d, i)')
    // The old builder's signature line — a hand-written field list feeding setEditableDays.
    expect(page).not.toMatch(/\.map\(\(d: any, i: number\) => \(\{\s*day: d\.day \|\| i \+ 1,/)
  })
})
