// Duplicate trip (lib/itineraries/duplicate, ported from autoura-saas): what
// the copy keeps, what it leaves behind, and that every listed column exists.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  DAY_COPY_COLUMNS, DAY_VERSION_COPY_COLUMNS, ITINERARY_COPY_COLUMNS, SERVICE_COPY_COLUMNS,
  SERVICE_VERSION_COPY_COLUMNS, VERSION_COPY_COLUMNS,
  copyCode, copyDay, copyDayVersion, copyItinerary, copyService, copyServiceVersion, copyVersion,
} from '@/lib/itineraries/duplicate'

describe('the copy of an itinerary', () => {
  const original = {
    id: 'it-1', itinerary_code: 'ITN-2026-8987', org_id: 'o', user_id: 'u',
    trip_name: 'NEK502 — Cairo & Luxor 5 days', client_name: 'Hanako Sato', start_date: '2026-10-09', end_date: '2026-10-13',
    num_adults: 3, total_cost: 2349.5, margin_percent: 25, currency: 'JPY', tier: 'standard', template_id: 'tpl',
    status: 'confirmed', cancelled_at: null, cancellation_reason: null, payment_status: 'paid', total_paid: 2415.72,
    deposit_amount: 700, balance_due: 0, fx_frozen: { EUR: 1 }, idempotency_key: 'k', thread_id: 'th',
    generation_warnings: ['w'], assigned_guide_id: 'g', guide_notes: 'gate 3', assigned_to: 'adham',
    created_at: 'then', updated_at: 'then',
  }

  it('keeps the trip, the client and the prices; a new draft with a new code and "(copy)"', () => {
    expect(copyItinerary(original, 'ITN-2026-1234')).toEqual({
      itinerary_code: 'ITN-2026-1234', status: 'draft', trip_name: 'NEK502 — Cairo & Luxor 5 days (copy)',
      client_name: 'Hanako Sato', start_date: '2026-10-09', end_date: '2026-10-13', num_adults: 3, total_cost: 2349.5,
      margin_percent: 25, currency: 'JPY', tier: 'standard', template_id: 'tpl', assigned_to: 'adham',
    })
  })

  it("a code in the original's style, this year", () => {
    expect(copyCode('ITN-2026-8987', 2027, 4321)).toBe('ITN-2027-4321')
    expect(copyCode('ITN-S-2025-12', 2026, 1000)).toBe('ITN-S-2026-1000')
    expect(copyCode('CON-ABC123', 2026, 1000)).toBe('ITN-2026-1000')
  })
})

describe('its days, services and languages', () => {
  const days = new Map([['d1', 'n1']])
  const services = new Map([['s1', 'm1']])

  it('a day moves to the copy, with all it says', () => {
    expect(copyDay({ id: 'd1', itinerary_id: 'it-1', day_number: 1, city: 'Cairo', created_at: 'x' }, 'it-2', 'n1'))
      .toEqual({ id: 'n1', itinerary_id: 'it-2', day_number: 1, city: 'Cairo' })
  })

  it("a service goes on the copy's day; commission starts over; a line on a missing day is left out", () => {
    expect(copyService({ id: 's1', itinerary_day_id: 'd1', service_name: 'Guide', total_cost: 80, commission_status: 'paid' }, days, 'm1'))
      .toEqual({ id: 'm1', itinerary_day_id: 'n1', service_name: 'Guide', total_cost: 80 })
    expect(copyService({ id: 's2', itinerary_day_id: 'gone', service_name: 'X' }, days, 'm2')).toBeNull()
  })

  it('every language comes along: a reviewed translation stays reviewed; the staff notes stay behind', () => {
    expect(copyVersion({ id: 'v', itinerary_id: 'it-1', language: 'ja', trip_name: 'カイロ', guide_notes: 'x', created_by: 'u' }, 'it-2'))
      .toEqual({ itinerary_id: 'it-2', language: 'ja', trip_name: 'カイロ' })
    expect(copyDayVersion({ id: 'dv', itinerary_day_id: 'd1', language: 'ja', title: '到着', status: 'reviewed', source_hash: 'h' }, days))
      .toEqual({ itinerary_day_id: 'n1', language: 'ja', title: '到着', status: 'reviewed', source_hash: 'h' })
    expect(copyDayVersion({ itinerary_day_id: 'gone', language: 'ja' }, days)).toBeNull()
    expect(copyServiceVersion({ itinerary_service_id: 's1', language: 'ja', service_name: 'ガイド' }, services))
      .toEqual({ itinerary_service_id: 'm1', language: 'ja', service_name: 'ガイド' })
    expect(copyServiceVersion({ itinerary_service_id: 's9', language: 'ja' }, services)).toBeNull()
  })
})

describe('the copied columns exist', () => {
  // A listed column the table does not have would fail the select at run time.
  const types = readFileSync(join(process.cwd(), 'types/database.types.ts'), 'utf8')
  const rowColumns = (table: string) => {
    const start = types.indexOf(`      ${table}: {\n        Row: {`)
    expect(start, table).toBeGreaterThan(-1)
    const body = types.slice(start, types.indexOf('        Insert: {', start))
    return new Set([...body.matchAll(/^          ([a-z_0-9]+)\??:/gm)].map(m => m[1]))
  }
  it.each([
    ['itineraries', ITINERARY_COPY_COLUMNS],
    ['itinerary_days', DAY_COPY_COLUMNS],
    ['itinerary_services', SERVICE_COPY_COLUMNS],
    ['itinerary_versions', VERSION_COPY_COLUMNS],
    ['itinerary_day_versions', DAY_VERSION_COPY_COLUMNS],
    ['itinerary_service_versions', SERVICE_VERSION_COPY_COLUMNS],
  ] as const)('%s', (table, columns) => {
    const have = rowColumns(table)
    expect(columns.filter(c => !have.has(c))).toEqual([])
  })
})
