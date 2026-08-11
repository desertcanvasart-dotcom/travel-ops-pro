import { describe, it, expect } from 'vitest'
import {
  generateShareToken,
  isValidShareToken,
  toClientItinerary,
} from '@/lib/itinerary-share'

// ============================================
// The security-critical test in this file is "strips every internal field".
// toClientItinerary is the ONLY thing standing between the itineraries table
// and a public URL, so it is fed a row carrying the whole cost base and asserted
// to leak none of it. If someone converts the projection to a spread, this test
// is what fails.
// ============================================

describe('generateShareToken', () => {
  it('mints 32-char base64url tokens that validate', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateShareToken()
      expect(token).toHaveLength(32)
      expect(isValidShareToken(token)).toBe(true)
    }
  })

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateShareToken()))
    expect(tokens.size).toBe(200)
  })

  it('is URL-safe — no +, / or = to be mangled in a link', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateShareToken()).not.toMatch(/[+/=]/)
    }
  })
})

describe('isValidShareToken', () => {
  it('rejects anything that is not a token we minted', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'short',
      'a'.repeat(31),
      'a'.repeat(33),
      'has spaces in it aaaaaaaaaaaaaaaa',
      '../../etc/passwd',
      "'; drop table itinerary_shares;--",
      'a'.repeat(31) + '!',
    ]) {
      expect(isValidShareToken(bad as string | null | undefined)).toBe(false)
    }
  })
})

describe('toClientItinerary', () => {
  /** An itinerary row as the service role actually returns it: select('*'). */
  const fullRow = {
    id: 'itin-uuid-1',
    itinerary_code: 'ITN-001',
    trip_name: 'Nile Discovery',
    start_date: '2026-09-01',
    end_date: '2026-09-08',
    total_days: 8,
    num_adults: 2,
    num_children: 1,
    num_infants: 0,
    currency: 'EUR',
    total_cost: 4200,
    tier: 'deluxe',
    inclusions: ['All transfers', 'English-speaking guide'],
    exclusions: ['International flights'],

    // ---- everything below is INTERNAL and must not survive ----
    supplier_cost: 2900,
    profit: 1300,
    margin_percent: 31,
    total_revenue: 4200,
    partner_id: 'partner-uuid',
    partner_commission_percent: 10,
    // Deliberately not a substring of any client-facing number (4200, 8, 2):
    // a value-based leak check is only meaningful if a hit cannot be coincidence.
    partner_commission_amount: 437.77,
    notes: 'Client is price sensitive — do not go below 3900',
    guide_notes: 'Use Ahmed, not Mostafa',
    hotel_notes: 'Negotiated rate, do not disclose',
    generation_warnings: ['rate hole: entrance fee Abu Simbel'],
    assigned_guide_id: 'guide-uuid',
    assigned_vehicle_id: 'vehicle-uuid',
    assigned_hotel_id: 'hotel-uuid',
    client_email: 'client@example.com',
    client_phone: '+201234567890',
    org_id: 'org-uuid',
    user_id: 'user-uuid',
    idempotency_key: 'key-123',
    cabin_allocation: { double: 1, single: 1 },
    cost_mode: 'auto',
    supplier_currency: 'EGP',
  }

  const days = [
    {
      id: 'day-2',
      itinerary_id: 'itin-uuid-1',
      day_number: 2,
      date: '2026-09-02',
      title: 'Giza Pyramids',
      description: 'Full day at the plateau.',
      city: 'Cairo',
      overnight_city: 'Cairo',
      attractions: ['Great Pyramid', 'Sphinx'],
      day_type: 'tour',
      lunch_included: true,
      dinner_included: false,
      hotel_included: true,
      has_sightseeing: true,
      flight_from: null,
      airport_arrival: null,
      airport_departure: null,
      // internal
      guide_required: true,
      transport_type: 'private_van',
      extras: [{ supplier: 'Ahmed Tours', cost: 300 }],
    },
    {
      id: 'day-1',
      day_number: 1,
      date: '2026-09-01',
      title: 'Arrival',
      description: null,
      city: 'Cairo',
      overnight_city: 'Cairo',
      attractions: [],
      day_type: 'arrival',
      lunch_included: false,
      dinner_included: false,
      hotel_included: true,
      has_sightseeing: false,
      flight_from: 'NRT',
      airport_arrival: 'CAI 14:20',
      airport_departure: null,
    },
  ]

  it('strips every internal field — the cost base cannot reach a client', () => {
    const result = toClientItinerary(fullRow, days)
    const serialized = JSON.stringify(result)

    // Field names must be absent...
    for (const leaked of [
      'supplier_cost', 'profit', 'margin_percent', 'partner_commission',
      'guide_notes', 'hotel_notes', 'generation_warnings', 'assigned_guide_id',
      'idempotency_key', 'org_id', 'user_id', 'notes', 'supplier_currency',
      'total_revenue', 'client_email', 'client_phone', 'cost_mode',
    ]) {
      expect(serialized).not.toContain(leaked)
    }

    // ...and so must their VALUES, which is the check that survives a rename.
    for (const secret of [
      '2900', '1300', '437.77', 'price sensitive', 'Ahmed, not Mostafa',
      'Negotiated rate', 'rate hole', 'guide-uuid', 'partner-uuid',
      'client@example.com', '+201234567890', 'key-123',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('keeps the client-facing fields', () => {
    const result = toClientItinerary(fullRow, days)
    expect(result.tripName).toBe('Nile Discovery')
    expect(result.code).toBe('ITN-001')
    expect(result.totalPrice).toBe(4200)
    expect(result.currency).toBe('EUR')
    expect(result.numAdults).toBe(2)
    expect(result.numChildren).toBe(1)
    expect(result.inclusions).toEqual(['All transfers', 'English-speaking guide'])
    expect(result.exclusions).toEqual(['International flights'])
  })

  it('sorts days by number regardless of query order', () => {
    const result = toClientItinerary(fullRow, days)
    expect(result.days.map(d => d.dayNumber)).toEqual([1, 2])
    expect(result.days[0].title).toBe('Arrival')
  })

  it('drops internal day fields too', () => {
    const result = toClientItinerary(fullRow, days)
    const serialized = JSON.stringify(result.days)
    expect(serialized).not.toContain('guide_required')
    expect(serialized).not.toContain('transport_type')
    expect(serialized).not.toContain('Ahmed Tours')
    expect(serialized).not.toContain('itinerary_id')
  })

  it('exposes total_cost as the client price, never supplier_cost', () => {
    // The two differ by design; a swap here would undercharge or expose cost.
    const result = toClientItinerary(fullRow, [])
    expect(result.totalPrice).toBe(4200)
    expect(result.totalPrice).not.toBe(2900)
  })

  it('normalises inclusions written as a newline string', () => {
    const result = toClientItinerary(
      { ...fullRow, inclusions: 'Transfers\nGuide\n\n  Water  ', exclusions: null },
      []
    )
    expect(result.inclusions).toEqual(['Transfers', 'Guide', 'Water'])
    expect(result.exclusions).toEqual([])
  })

  it('drops non-string junk in inclusions rather than rendering objects', () => {
    const result = toClientItinerary(
      { ...fullRow, inclusions: ['Transfers', { supplier: 'X', cost: 1 }, null, 42] },
      []
    )
    expect(result.inclusions).toEqual(['Transfers'])
  })

  it('passes through only known day_type values', () => {
    const result = toClientItinerary(fullRow, [
      { day_number: 1, day_type: 'cruise' },
      { day_number: 2, day_type: 'not-a-real-type' },
      { day_number: 3 },
    ])
    expect(result.days[0].dayType).toBe('cruise')
    expect(result.days[1].dayType).toBeNull()
    expect(result.days[2].dayType).toBeNull()
  })

  it('survives an empty/garbage row without throwing', () => {
    const result = toClientItinerary({}, [])
    expect(result.tripName).toBe('Your trip')
    expect(result.code).toBe('')
    expect(result.totalPrice).toBeNull()
    expect(result.days).toEqual([])
  })

  it('coerces numeric strings from postgres numerics', () => {
    const result = toClientItinerary(
      { ...fullRow, total_cost: '4200.50', num_adults: '3', total_days: '8' },
      []
    )
    expect(result.totalPrice).toBe(4200.5)
    expect(result.numAdults).toBe(3)
    expect(result.totalDays).toBe(8)
  })
})
