// A tip is a place-specific number: what a driver is tipped in Cairo is not
// what a driver is tipped in Aswan (operator, 1 Sep).
//
// The hazard this file guards is the NAIVE reading of a city column. The
// itemized lookup already summed one row per role; the flat helper summed
// EVERY active per-day row. Add cities to that and a trip charges a Cairo
// driver tip AND an Aswan driver tip on every single day.
//
// The rule: most specific wins, and exactly ONE row is ever charged.
//   role+context+city → role+context anywhere → role+city → role anywhere → 0
// A blank city keeps the meaning it always had: anywhere.
import { describe, it, expect } from 'vitest'
import { getItemizedTippingRates } from '@/lib/tipping-utils'

type Row = {
  role_type: string
  context: string | null
  city: string | null
  rate_eur: number
  rate_unit?: string
  service_code?: string
}

const supabaseWith = (rows: Row[]) => ({
  from: () => ({
    select: () => ({
      eq: async () => ({ data: rows.map(r => ({ rate_unit: 'per_day', ...r })), error: null }),
    }),
  }),
})

const load = (rows: Row[]) => getItemizedTippingRates(supabaseWith(rows) as never, 'standard')

describe('city-specific tipping', () => {
  it('prefers the city rate over the country-wide one', async () => {
    const rates = await load([
      { role_type: 'driver', context: null, city: null, rate_eur: 100 },
      { role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 },
    ])
    expect(rates.getRate('driver' as never, undefined, 'Aswan')).toBe(150)
    expect(rates.getRate('driver' as never, undefined, 'Cairo')).toBe(100)
  })

  it('charges ONE row, never a city rate plus the country-wide rate', async () => {
    // The whole point. Summing both is the bug this design avoids.
    const rates = await load([
      { role_type: 'driver', context: null, city: null, rate_eur: 100 },
      { role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 },
      { role_type: 'driver', context: null, city: 'Cairo', rate_eur: 120 },
    ])
    expect(rates.sumRates([{ role: 'driver' as never, quantity: 1 }], 'Aswan')).toBe(150)
  })

  it('prefers role+context+city over role+context anywhere', async () => {
    const rates = await load([
      { role_type: 'guide', context: 'day_tour', city: null, rate_eur: 200 },
      { role_type: 'guide', context: 'day_tour', city: 'Luxor', rate_eur: 250 },
      { role_type: 'guide', context: null, city: 'Luxor', rate_eur: 999 },
    ])
    // The context match wins over the bare-role city match.
    expect(rates.getRate('guide' as never, 'day_tour' as never, 'Luxor')).toBe(250)
  })

  it('falls back through context before falling back through city', async () => {
    // role+context anywhere beats role-with-no-context in this city: context
    // is the more specific description of the service being tipped.
    const rates = await load([
      { role_type: 'guide', context: 'day_tour', city: null, rate_eur: 200 },
      { role_type: 'guide', context: null, city: 'Luxor', rate_eur: 300 },
    ])
    expect(rates.getRate('guide' as never, 'day_tour' as never, 'Luxor')).toBe(200)
  })

  it('matches the city case- and whitespace-insensitively', async () => {
    const rates = await load([{ role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 }])
    expect(rates.getRate('driver' as never, undefined, '  aswan ')).toBe(150)
  })

  it('prices exactly as before when no row names a city', async () => {
    // Backward compatibility: every row in production today has a null city,
    // so no existing itinerary may change price.
    const rows: Row[] = [
      { role_type: 'driver', context: null, city: null, rate_eur: 100 },
      { role_type: 'guide', context: 'day_tour', city: null, rate_eur: 200 },
    ]
    const rates = await load(rows)
    expect(rates.getRate('driver' as never, undefined, 'Cairo')).toBe(100)
    expect(rates.getRate('driver' as never)).toBe(100)
    expect(rates.getRate('guide' as never, 'day_tour' as never, 'Anywhere')).toBe(200)
  })

  it('gives nothing for a city-only rate when pricing a different city', async () => {
    // Not a silent zero by accident: there is genuinely no rate that applies,
    // and inventing one from another city would be fabricated money.
    const rates = await load([{ role_type: 'driver', context: null, city: 'Aswan', rate_eur: 150 }])
    expect(rates.getRate('driver' as never, undefined, 'Cairo')).toBe(0)
  })
})
