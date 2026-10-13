// Rates › Accommodation audit, the library and engine half: a blank guide
// rate stays null; a backwards / negative period is refused; Rate Card
// Validity ranks the automatic pick; the converter covers the old high/peak
// columns; hotel services price by destination and reach Deluxe; two trains
// of one supplier stay two trains; the hotel CSV carries a tier.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables, multiTierRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import {
  sanitizeSeasons, guideRateOf, seasonsFromFlightColumns, legacyColumnMirror, seasonsPayloadError,
  seasonsWrite, seasonsForRow,
} from '@/lib/rates/rate-seasons'
import { hotelCandidates, cruiseCandidates, rankForDate } from '@/lib/pricing/property-candidates'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import { resolveHotelRatesForDate, calculateAutoPricing } from '@/lib/auto-pricing-service'
import { hotelServiceCategories, pickHotelServiceRow } from '@/lib/pricing/hotel-service-pick'
import { resolveImportTier, accommodationImportFill, RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'
import { rateInUseMessage } from '@/lib/rates/rate-in-use'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('a blank guide rate is null end to end (finding 10, Transport F1)', () => {
  it('sanitizeSeasons leaves a blank guide_rate out and keeps a typed 0', () => {
    const [blank] = sanitizeSeasons([{ from: '2026-01-01', to: '2026-12-31', rates: { pp_double_eur: 80, guide_rate: '' } }], 'accommodation')!
    expect('guide_rate' in blank.rates).toBe(false)
    expect(guideRateOf(blank.rates)).toBeNull()
    const [zero] = sanitizeSeasons([{ from: '2026-01-01', to: '2026-12-31', rates: { guide_rate: 0 } }], 'accommodation')!
    expect(guideRateOf(zero.rates)).toBe(0)
  })

  it('a flight row with guide_rate NULL reads no guide fare, and the mirror writes NULL back', () => {
    const [p] = seasonsFromFlightColumns({ base_rate_eur: 100, tax_eur: 20, guide_rate: null })
    expect(p.rates.base_rate_eur).toBe(100)
    expect(guideRateOf(p.rates)).toBeNull()
    const flight = sanitizeSeasons([{ from: '2026-01-01', to: '2026-12-31', rates: { base_rate_eur: 100, tax_eur: 20 } }], 'flight')
    expect(legacyColumnMirror(flight, 'flight').guide_rate).toBeNull()
    const free = sanitizeSeasons([{ from: '2026-01-01', to: '2026-12-31', rates: { base_rate_eur: 100, guide_rate: 0 } }], 'flight')
    expect(legacyColumnMirror(free, 'flight').guide_rate).toBe(0)
  })
})

describe('period payloads (findings 7 and 11)', () => {
  it('a backwards period or a negative rate is an error, not "no periods"', () => {
    expect(seasonsPayloadError([{ from: '2026-05-01', to: '2026-04-01', rates: {} }], 'accommodation')).toMatch(/before it starts/)
    expect(seasonsPayloadError([{ from: '2026-01-01', to: '2026-12-31', rates: { pp_double_eur: -1 } }], 'accommodation')).toMatch(/negative/)
    expect(seasonsPayloadError([{ from: '2026-01-01', to: '2026-12-31', rates: { 'supp:sea_view:eur': -3 } }], 'accommodation')).toMatch(/negative/)
    expect(seasonsPayloadError([{ from: '2026-01-01', to: '2026-12-31', rates: { pp_double_eur: 10 } }], 'accommodation')).toBeNull()
    expect(seasonsPayloadError(undefined, 'cruise')).toBeNull()
  })

  it('an empty list clears the legacy windows, so the row has no periods', () => {
    const row: Record<string, unknown> = {
      low_season_from: '2026-01-01', low_season_to: '2026-12-31', pp_double_eur: 80,
      high_season_from: '2025-10-01', high_season_to: '2026-04-30', high_pp_double_eur: 120,
      ...seasonsWrite([], 'accommodation'),
    }
    expect(row.seasons).toEqual([])
    expect(seasonsForRow(row, 'accommodation')).toEqual([])
    expect(resolveHotelRatesForDate(row, true, '2026-02-01').ppdNight).toBe(0)
  })
})

describe('Rate Card Validity ranks the automatic pick (finding 6)', () => {
  const older = {
    id: 'older', org_id: 'org-1', tier: 'standard', city: 'Cairo', is_active: true, created_at: '2026-01-01',
    rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31',
    seasons: [{ name: '2026', from: '2026-01-01', to: '2026-12-31', rates: { pp_double_eur: 80 } }],
  }
  const newer = {
    id: 'newer', org_id: 'org-1', tier: 'standard', city: 'Cairo', is_active: true, created_at: '2026-06-01',
    rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31',
    seasons: [{ name: '2027', from: '2027-01-01', to: '2027-12-31', rates: { pp_double_eur: 95 } }],
  }

  it('a date this year takes the older sheet; next year the newer; no date, newest first', async () => {
    setMockTables({ accommodation_rates: [older, newer] })
    const db = createMockClient()
    expect((await hotelCandidates(db, 'org-1', 'Cairo', 'standard', '2026-11-10')).map(r => r.id)).toEqual(['older', 'newer'])
    expect((await hotelCandidates(db, 'org-1', 'Cairo', 'standard', '2027-03-01')).map(r => r.id)).toEqual(['newer', 'older'])
    expect((await hotelCandidates(db, 'org-1', 'Cairo', 'standard')).map(r => r.id)).toEqual(['newer', 'older'])
  })

  it('an expired sheet is still used when it is all there is (never dropped)', () => {
    expect(rankForDate([older], 'accommodation', '2030-01-01').map(r => r.id)).toEqual(['older'])
  })

  it('ships: within the programme\'s length, the sheet valid on the sailing date first', async () => {
    const ship = (id: string, from: string, to: string, created_at: string) => ({
      id, org_id: 'org-1', tier: 'standard', is_active: true, is_preferred: false, duration_nights: 4, created_at,
      rate_valid_from: from, rate_valid_to: to,
    })
    setMockTables({ nile_cruises: [ship('s26', '2026-01-01', '2026-12-31', '2026-01-01'), ship('s27', '2027-01-01', '2027-12-31', '2026-06-01')] })
    const ids = (await cruiseCandidates(createMockClient(), 'org-1', 'standard', null, 4, '2026-11-10')).map(r => r.id)
    expect(ids[0]).toBe('s26')
  })

  it('the engine prices a 2026 night from the older sheet', async () => {
    const t = fullRateTables() as any
    t.accommodation_rates = [
      { ...older, property_name: 'Old Sheet Hotel', pp_double_non_eur: 80, seasons: [{ name: '2026', from: '2026-01-01', to: '2026-12-31', rates: { pp_double_eur: 80, pp_double_non_eur: 80 } }] },
      { ...newer, property_name: 'New Sheet Hotel', pp_double_non_eur: 95, seasons: [{ name: '2027', from: '2027-01-01', to: '2027-12-31', rates: { pp_double_eur: 95, pp_double_non_eur: 95 } }] },
    ]
    setMockTables(t)
    const r = await calculateAutoPricing({ orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard', isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2, travelDate: '2026-11-10' })
    const hotel = (r.services ?? []).find((s: any) => s.serviceType === 'accommodation' && /Sheet Hotel/.test(s.serviceName ?? ''))
    expect(hotel?.serviceName).toMatch(/Old Sheet Hotel/)
  })
})

describe('the converter covers the old high/peak columns (finding 9)', () => {
  const egpRow = {
    id: 'egp', rate_currency: 'EGP', seasons: null,
    high_season_from: '2026-10-01', high_season_to: '2027-04-30',
    high_pp_double_eur: 5000, high_pp_double_non_eur: 5000,
  }

  it('with an FX rate, a legacy high-season night is converted', async () => {
    const n = createRateNormalizer('EUR', { getRates: async () => ({ base: 'EUR', date: '2026-11-01', rates: { EUR: 1, EGP: 50 } }) })
    const [row] = (await n.normalize('accommodation_rates', [egpRow]))!
    expect(Number(row.high_pp_double_eur)).toBeLessThan(5000)
  })

  it('with no FX rate, a legacy high-season night is never the raw EGP number', async () => {
    const n = createRateNormalizer('EUR', { getRates: async () => ({ base: 'EUR', date: '2026-11-01', rates: { EUR: 1 } }) })
    const [row] = (await n.normalize('accommodation_rates', [egpRow]))!
    expect(resolveHotelRatesForDate(row, true, '2026-11-10').ppdNight).toBe(0)
    expect(n.misses).toHaveLength(1)
  })
})

describe('hotel services: destination and category (findings 20, 21)', () => {
  const r = (id: string, over: Record<string, unknown>) => ({ id, service_type: 'checkin_assist', hotel_category: 'standard', destination: null, rate_eur: 10, is_active: true, ...over })

  it('the day\'s city beats all destinations, and another city never prices', () => {
    const rows = [r('aswan', { destination: 'Aswan', rate_eur: 30 }), r('any', { rate_eur: 20 }), r('cairo', { destination: 'Cairo', rate_eur: 15 })]
    expect(pickHotelServiceRow(rows, 'checkin_assist', ['standard'], 'cairo')?.id).toBe('cairo')
    expect(pickHotelServiceRow(rows, 'checkin_assist', ['standard'], 'Luxor')?.id).toBe('any')
    expect(pickHotelServiceRow([rows[0]], 'checkin_assist', ['standard'], 'Cairo')).toBeUndefined()
  })

  it('a deluxe quote reads Deluxe, then Standard, then All', () => {
    expect(hotelServiceCategories('deluxe')).toEqual(['deluxe', 'standard'])
    const rows = [r('all', { hotel_category: 'all' }), r('std', {}), r('dlx', { hotel_category: 'deluxe' })]
    expect(pickHotelServiceRow(rows, 'checkin_assist', hotelServiceCategories('deluxe'), 'Cairo')?.id).toBe('dlx')
    expect(pickHotelServiceRow(rows.slice(0, 2), 'checkin_assist', hotelServiceCategories('deluxe'), 'Cairo')?.id).toBe('std')
  })

  it('the engine prices a Cairo check-in at the Cairo row, and a deluxe quote at the Deluxe row', async () => {
    const t = multiTierRateTables() as any
    t.hotel_staff_rates = [r('aswan', { destination: 'Aswan', rate_eur: 30 }), r('cairo', { destination: 'Cairo', rate_eur: 15 }), r('dlx', { hotel_category: 'deluxe', rate_eur: 22 })]
    setMockTables(t)
    const base = { orgId: 'org-1', templateId: TEMPLATE_ID, isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2 }
    const std = await calculateAutoPricing({ ...base, tier: 'standard' })
    expect((std.services ?? []).find((s: any) => s.id === 'day1-hotel-checkin')).toMatchObject({ unitCost: 15 })
    // Destination ranks before category, so the Deluxe row is read where no
    // row names the city.
    t.hotel_staff_rates = [r('std', { rate_eur: 10 }), r('dlx', { hotel_category: 'deluxe', rate_eur: 22 })]
    setMockTables(t)
    const dlx = await calculateAutoPricing({ ...base, tier: 'deluxe' })
    expect((dlx.services ?? []).find((s: any) => s.id === 'day1-hotel-checkin')).toMatchObject({ unitCost: 22 })
  })
})

describe('two trains of one supplier stay two trains (finding 18)', () => {
  const day = (n: number, city: string, over: Record<string, unknown> = {}) => ({
    day: n, title: `Day ${n}`, city, overnight_city: city, accommodation_type: 'none',
    meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, attractions: [],
    services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
    ...over,
  })
  const cabin = (id: string, train: string, cabin_type: string, fare: number) => ({
    id, origin_city: 'Giza', destination_city: 'Luxor', cabin_type, operator_name: 'Watania', supplier_id: 'sup-w',
    property_id: train, rate_oneway_eur: fare, rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31', is_active: true,
  })
  const tables = (over: Record<string, unknown> = {}) => {
    const t = fullRateTables() as any
    t.sleeping_train_rates = [cabin('a-ht', 'train-a', 'Half Twin', 120), cabin('a-sg', 'train-a', 'Single', 170), cabin('b-ht', 'train-b', 'Half Twin', 200), cabin('b-sg', 'train-b', 'Single', 260)]
    t.tour_templates[0].itinerary = [day(1, 'Cairo', { transport_type: 'sleeping_train', overnight_kind: 'train', ...over }), day(2, 'Luxor')]
    return t
  }
  const base = { orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2, travelDate: '2026-05-01' }

  it('naming train B prices train B\'s Half Twin and Single', async () => {
    setMockTables(tables({ transport_rate_id: 'b-ht' }))
    const r = await calculateAutoPricing(base)
    expect((r.services ?? []).find((s: any) => s.id === 'day1-ticket-sleeper')).toMatchObject({ unitCost: 200 })
    expect((r.accommodationNights ?? []).some((n: any) => n.ppd === 200 && n.singleSupp === 60)).toBe(true)
  })

  it('naming no train is a hole asking which, not an auto-pick', async () => {
    setMockTables(tables())
    const r = await calculateAutoPricing(base)
    expect((r.holes ?? []).some((h: any) => /2 sleeping trains serve/.test(h.message ?? ''))).toBe(true)
  })
})

describe('the hotel CSV carries a tier (finding 8)', () => {
  const items = [{ key: 'economy', label: 'Economy' }, { key: 'classic', label: 'Classic' }, { key: 'premium', label: 'Premium' }]

  it('the sheet has a Tier column', () => {
    expect(RATE_TABLE_CONFIGS.accommodation_rates.columns.map(c => c.name)).toContain('tier')
  })

  it('a tier word resolves to its key; an unknown one is refused', () => {
    expect(resolveImportTier('Classic', items)).toEqual({ ok: true, tier: 'classic' })
    expect(resolveImportTier('', items)).toEqual({ ok: true, tier: null })
    expect(resolveImportTier('Gold', items).ok).toBe(false)
  })

  it('a blank tier keeps the stored one; a new row gets the company default and property type hotel', async () => {
    const existing: Record<string, unknown> = { service_code: 'A' }
    accommodationImportFill(existing, { tier: 'premium', property_type: 'boutique' }, items.map(i => i.key))
    expect(existing).toMatchObject({ tier: 'premium', property_type: 'boutique' })
    const fresh: Record<string, unknown> = { service_code: 'B', city: 'Cairo' }
    accommodationImportFill(fresh, undefined, items.map(i => i.key))
    expect(fresh).toMatchObject({ tier: 'classic', property_type: 'hotel' })
    // ...and the engine's automatic pick then finds it.
    setMockTables({ accommodation_rates: [{ ...fresh, id: 'csv', org_id: 'org-1', is_active: true }] })
    expect((await hotelCandidates(createMockClient(), 'org-1', 'Cairo', 'classic')).map(r => r.id)).toEqual(['csv'])
  })
})

describe('the in-use message (finding 5)', () => {
  it('names what uses the rate and says to deactivate', () => {
    expect(rateInUseMessage({ tourDays: 0, programmes: 0, gridLines: 0 })).toBeNull()
    expect(rateInUseMessage({ tourDays: 2, programmes: 1, gridLines: 0 })).toMatch(/2 tour days, 1 programme\. Switch it off/)
  })
})
