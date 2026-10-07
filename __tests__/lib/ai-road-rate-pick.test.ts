// The AI builder's road rate, by the shape of the trip (lib/ai/road-rate-pick).
import { describe, it, expect } from 'vitest'
import { pickRoadRate, isSameDayReturn } from '@/lib/ai/road-rate-pick'

const rows = [
  { id: 'ow', service_type: 'intercity', trip_shape: 'one_way' },
  { id: 'on', service_type: 'intercity', trip_shape: 'overnight_return' },
  { id: 'sd', service_type: 'intercity', trip_shape: 'same_day_return' },
  { id: 'sds', service_type: 'intercity_with_sightseeing', trip_shape: 'same_day_return' },
  { id: 'nil', service_type: 'intercity', trip_shape: null },
]

describe('which road rate', () => {
  it('a day trip takes the same-day return — the sightseeing variant first — never one-way or overnight', () => {
    expect(pickRoadRate(rows, 'day_trip')?.id).toBe('sds')
    expect(pickRoadRate(rows.filter(r => r.id !== 'sds'), 'day_trip')?.id).toBe('sd')
    expect(pickRoadRate(rows.filter(r => !r.trip_shape?.startsWith('same')), 'day_trip')?.id).toBe('nil')
    expect(pickRoadRate(rows.filter(r => r.trip_shape === 'one_way' || r.trip_shape === 'overnight_return'), 'day_trip')).toBeNull()
  })
  it('a move takes the one-way, then an unshaped row, then overnight return — never the same-day return', () => {
    expect(pickRoadRate(rows, 'move')?.id).toBe('ow')
    expect(pickRoadRate(rows.filter(r => r.id !== 'ow'), 'move')?.id).toBe('nil')
    expect(pickRoadRate(rows.filter(r => r.id !== 'ow' && r.id !== 'nil'), 'move')?.id).toBe('on')
    expect(pickRoadRate(rows.filter(r => r.trip_shape === 'same_day_return'), 'move')).toBeNull()
  })
})

describe('a day trip', () => {
  const base = { previousOvernightCity: 'Cairo', flies: false, aboard: false }
  it('the night stays where it was, the day is elsewhere', () => {
    expect(isSameDayReturn({ ...base, city: 'Alexandria', overnightCity: 'Cairo' })).toBe(true)
  })
  it('not a move, a day at home, a flight, a ship, or a day the AI gave no night', () => {
    expect(isSameDayReturn({ ...base, city: 'Alexandria', overnightCity: 'Alexandria' })).toBe(false)
    expect(isSameDayReturn({ ...base, city: 'Cairo', overnightCity: 'Cairo' })).toBe(false)
    expect(isSameDayReturn({ ...base, city: 'Luxor', overnightCity: 'Cairo', flies: true })).toBe(false)
    expect(isSameDayReturn({ ...base, city: 'Aswan', overnightCity: 'Cairo', aboard: true })).toBe(false)
    expect(isSameDayReturn({ ...base, city: 'Alexandria', overnightCity: null })).toBe(false)
  })
})
