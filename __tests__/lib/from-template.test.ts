import { describe, it, expect } from 'vitest'
import { deriveEndDate, applyTemplate, templateLabel } from '@/lib/itineraries/from-template'

const programme = {
  id: 't-1',
  template_name: 'Nile in 8 days',
  template_code: 'NILE-8',
  duration_days: 8,
}

describe('deriveEndDate', () => {
  it('counts the first day — a 5-day trip from Monday ends Friday', () => {
    expect(deriveEndDate('2026-07-06', 5)).toBe('2026-07-10')
  })

  it('is the same day for a one-day trip', () => {
    expect(deriveEndDate('2026-07-06', 1)).toBe('2026-07-06')
  })

  it('crosses a month boundary', () => {
    expect(deriveEndDate('2026-07-30', 5)).toBe('2026-08-03')
  })

  it('does not lose a day west of UTC', () => {
    // A local-time Date turns '2026-07-01' into 30 June on a machine behind
    // UTC, which is how a trip silently starts a day early.
    expect(deriveEndDate('2026-07-01', 1)).toBe('2026-07-01')
  })

  it('refuses to invent a date from unusable input', () => {
    expect(deriveEndDate('', 5)).toBeNull()
    expect(deriveEndDate('not-a-date', 5)).toBeNull()
    expect(deriveEndDate('2026-07-06', 0)).toBeNull()
    expect(deriveEndDate('2026-07-06', null)).toBeNull()
    expect(deriveEndDate('2026-07-06', undefined)).toBeNull()
  })
})

describe('applyTemplate', () => {
  const blank = { trip_name: '', start_date: '', end_date: '' }

  it('links the programme and names the trip when nothing is typed yet', () => {
    expect(applyTemplate(programme, blank)).toEqual({
      template_id: 't-1', trip_name: 'Nile in 8 days', end_date: '',
    })
  })

  it('never replaces a name the operator typed', () => {
    const r = applyTemplate(programme, { ...blank, trip_name: 'Tanaka family — Nile, October' })
    expect(r.trip_name).toBe('Tanaka family — Nile, October')
  })

  it('treats a whitespace-only name as blank', () => {
    expect(applyTemplate(programme, { ...blank, trip_name: '   ' }).trip_name).toBe('Nile in 8 days')
  })

  it('sets the end date from the programme length', () => {
    expect(applyTemplate(programme, { ...blank, start_date: '2026-07-06' }).end_date).toBe('2026-07-13')
  })

  it('corrects an end date that does not match the programme', () => {
    // Picking an 8-day tour and keeping a 5-day window quotes the wrong trip.
    const r = applyTemplate(programme, {
      ...blank, start_date: '2026-07-06', end_date: '2026-07-10',
    })
    expect(r.end_date).toBe('2026-07-13')
  })

  it('leaves the end date alone when there is no start date to count from', () => {
    const r = applyTemplate(programme, { ...blank, end_date: '2026-07-10' })
    expect(r.end_date).toBe('2026-07-10')
  })

  it('leaves the end date alone for a programme with no stated length', () => {
    const r = applyTemplate(
      { ...programme, duration_days: null },
      { ...blank, start_date: '2026-07-06', end_date: '2026-07-10' }
    )
    expect(r.end_date).toBe('2026-07-10')
  })

  it('unlinks without touching anything the operator entered', () => {
    expect(applyTemplate(null, { trip_name: 'Custom trip', start_date: '2026-07-06', end_date: '2026-07-10' }))
      .toEqual({ template_id: null, trip_name: 'Custom trip', end_date: '2026-07-10' })
  })
})

describe('templateLabel', () => {
  it('reads as code, name and length', () => {
    expect(templateLabel(programme)).toBe('NILE-8 — Nile in 8 days · 8 days')
  })

  it('drops the parts that are missing rather than printing blanks', () => {
    expect(templateLabel({ id: 'x', template_name: 'Custom', template_code: null, duration_days: null }))
      .toBe('Custom')
  })

  it('says one day, not one days', () => {
    expect(templateLabel({ id: 'x', template_name: 'Cairo day', duration_days: 1 })).toBe('Cairo day · 1 day')
  })
})
