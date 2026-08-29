// ============================================
// parseItinerary's DEFAULT service flags respect the package
// ============================================
// Two latent bugs (taxonomy review): a SINGLE-day template with no explicit
// services defaulted airport arrival AND departure AND hotel check-in AND
// check-out onto its one day — a day tour priced like a whole package — and
// no product ever escaped the full-package assumption. Explicit day.services
// win over everything, mirroring the pricing grid's package-mask precedence.
import { vi, describe, it, expect } from 'vitest'

// The engine builds a service-role client at module scope; mock it BEFORE
// importing (vitest hoists vi.mock) — same pattern as auto-pricing-service.test.ts.
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { parseItinerary } from '@/lib/auto-pricing-service'

const bareDay = (title: string) => ({ title, description: '' })

describe('parseItinerary — package-gated service defaults', () => {
  it('single-day, no package (historical full-package): airport yes, hotel NO', () => {
    // One day = no overnight = nothing to check into, whatever the package.
    const [d] = parseItinerary([bareDay('Cairo Day Tour')])
    expect(d.services.airport_arrival).toBe(true)
    expect(d.services.airport_departure).toBe(true)
    expect(d.services.hotel_checkin).toBe(false)
    expect(d.services.hotel_checkout).toBe(false)
  })

  it('single-day tours-only: no airport, no hotel — just the tour', () => {
    const [d] = parseItinerary([bareDay('Luxor Day Tour')], { packageType: 'tours-only' })
    expect(d.services.airport_arrival).toBe(false)
    expect(d.services.airport_departure).toBe(false)
    expect(d.services.hotel_checkin).toBe(false)
    expect(d.services.hotel_checkout).toBe(false)
  })

  it('multi-day full-package keeps the historical enforcement', () => {
    const days = parseItinerary([bareDay('Arrival'), bareDay('Giza'), bareDay('Departure')])
    expect(days[0].services.airport_arrival).toBe(true)
    expect(days[0].services.hotel_checkin).toBe(true)
    expect(days[2].services.airport_departure).toBe(true)
    expect(days[2].services.hotel_checkout).toBe(true)
  })

  it('multi-day land-package: hotels enforced, airport transfers not', () => {
    const days = parseItinerary([bareDay('Arrival'), bareDay('Departure')], { packageType: 'land-package' })
    expect(days[0].services.hotel_checkin).toBe(true)
    expect(days[0].services.airport_arrival).toBe(false)
    expect(days[1].services.airport_departure).toBe(false)
  })

  it('explicit day.services beat the package gate — same precedence as the grid', () => {
    // "This tours-only trip DOES include one airport pickup" is a real sale.
    const days = parseItinerary(
      [{ ...bareDay('Special'), services: { airport_arrival: true, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false } }],
      { packageType: 'tours-only' }
    )
    expect(days[0].services.airport_arrival).toBe(true)
  })
})
