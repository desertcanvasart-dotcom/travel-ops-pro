// Transport "matched without duration" (owner 2026-11-19: a missing price is
// a gap, never a guess).
//
//   OLD: a full-day ask with only a half-day rate in the city priced the
//        half-day rate (and the other way round), via a no-duration key that
//        every rate was copied under.
//   NEW: only a rate that states NO duration answers any length; a rate of
//        another duration never does, so the day is a gap.
import { vi, describe, it, expect } from 'vitest'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { transportCacheFromRows, findTransportRateExplained } from '@/lib/auto-pricing-service'

const v = (rate: number) => [{ key: 'sedan', rate_eur: rate, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }]
const row = (id: string, duration: string | null, rate: number, service_type = 'day_tour') => ({
  id, service_code: id, service_type, city: 'Luxor', duration, vehicles: v(rate), is_active: true,
  rate_valid_from: '2026-01-01', rate_valid_to: '2099-12-31', route_name: id,
}) as any
const ask = (rows: any[], duration: string, serviceType = 'day_tour') =>
  findTransportRateExplained(transportCacheFromRows(rows, '2026-12-01'), { serviceType: serviceType as any, city: 'Luxor', duration: duration as any, pax: 2 })

describe('a rate of another duration never answers', () => {
  it('full-day ask, only a half-day rate: no rate (a gap)', () => {
    expect(ask([row('half', 'half_day', 30)], 'full_day').rate).toBeNull()
  })
  it('half-day ask, only a full-day rate: no rate (a gap)', () => {
    expect(ask([row('full', 'full_day', 50)], 'half_day').rate).toBeNull()
  })
  it('the matching duration still prices', () => {
    expect(ask([row('half', 'half_day', 30), row('full', 'full_day', 50)], 'full_day').rate?.id).toBe('full')
  })
  it('a rate that states no duration answers any length, as before', () => {
    expect(ask([row('apt', null, 25, 'airport_transfer')], 'one_way', 'airport_transfer').rate?.id).toBe('apt')
    expect(ask([row('any', null, 40)], 'half_day').rate?.id).toBe('any')
  })
})
