import { vi, describe, it, expect } from 'vitest'

// The engine creates a supabase client at module load — mock it so importing
// the facade/engine doesn't require live credentials.
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import * as facade from '@/lib/pricing/rate-resolution'
import * as engine from '@/lib/auto-pricing-service'

// Phase A guard: the canonical facade must re-export the SAME hardened lookups
// as the engine — never a fork. Identity equality proves there's one
// implementation behind the single import surface.
describe('rate-resolution facade', () => {
  const fns = [
    'getHotelRates', 'getCruiseRates', 'getGuideRate', 'getMealRates',
    'getTippingRate', 'getAirportServiceRate', 'getHotelServiceRate',
    'getEntranceFee', 'buildTransportCache', 'findTransportRate', 'parseItinerary',
  ] as const

  it('re-exports the engine lookups by identity (no fork)', () => {
    for (const name of fns) {
      expect((facade as any)[name]).toBe((engine as any)[name])
      expect(typeof (facade as any)[name]).toBe('function')
    }
  })
})
