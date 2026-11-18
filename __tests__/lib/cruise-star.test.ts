import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// One starred Nile cruise per tier, route (embark → disembark) and length,
// and pricing that matches the sailing's length and end port (owner
// 2026-11-18, as autoura-saas #825 — lib/rates/cruise-star.ts).
//
//   OLD: any number of stars; two starred ships on one tier and port were
//        settled by whichever was entered last; where the sailing ends was
//        ignored, so an Aswan → Luxor ship could price a Luxor → Aswan trip.
//   NEW: starring a ship clears only the stars it competes with; pricing
//        narrows to the trip's length, then to its end port (each only when
//        a ship is left).

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-a',
    getCurrentUserId: async () => 'u1',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/i18n/server-messages', () => ({ tServer: async (key: string) => key }))

import { cruisesCompete, competingStars, narrowCruiseCandidates, describeCruiseScope, sailingEndCity } from '@/lib/rates/cruise-star'
import * as cruises from '@/app/api/rates/cruises/route'
import * as cruiseById from '@/app/api/rates/cruises/[id]/route'
import { resolveCruiseStay } from '@/lib/auto-pricing-service'

const json = (body: unknown) => ({ json: async () => body }) as never
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const rows = async (table: string) => ((await (createMockClient().from(table) as any).select('*')).data ?? []) as Record<string, any>[]

const ceilaUp = { id: 'up', tier: 'standard', embark_city: 'Aswan', disembark_city: 'Luxor', duration_nights: 3, ship_name: 'Ceila' }
const ceilaDown = { id: 'down', tier: 'standard', embark_city: 'Luxor', disembark_city: 'Aswan', duration_nights: 4, ship_name: 'Ceila' }

describe('which cruises compete', () => {
  it('opposite routes never compete (the Ceila case)', () => {
    expect(cruisesCompete(ceilaUp, ceilaDown)).toBe(false)
  })
  it('another length or tier does not; the same route and length does, case aside', () => {
    expect(cruisesCompete(ceilaUp, { ...ceilaUp, id: 'x', duration_nights: 4 })).toBe(false)
    expect(cruisesCompete(ceilaUp, { ...ceilaUp, id: 'x', tier: 'deluxe' })).toBe(false)
    expect(cruisesCompete(ceilaUp, { ...ceilaUp, id: 'x', ship_name: 'Farida', embark_city: ' aswan ', disembark_city: 'LUXOR' })).toBe(true)
  })
  it('a row stating no length competes with any length', () => {
    expect(cruisesCompete(ceilaUp, { ...ceilaUp, id: 'x', duration_nights: null })).toBe(true)
  })
  it('competingStars: starred rivals only, never itself', () => {
    const list = [{ ...ceilaUp, is_preferred: true }, { ...ceilaUp, id: 'f', ship_name: 'Farida', is_preferred: true }, { ...ceilaUp, id: 'g', is_preferred: false }, { ...ceilaDown, is_preferred: true }]
    expect(competingStars(ceilaUp, list).map(r => r.id)).toEqual(['f'])
  })
  it('describes the scope', () => {
    expect(describeCruiseScope(ceilaUp)).toBe('standard · Aswan → Luxor · 3 nights')
  })
})

describe('the sailing the trip prices', () => {
  const ships = [
    { id: 'a', duration_nights: 4, disembark_city: 'Aswan' },
    { id: 'b', duration_nights: 3, disembark_city: 'Luxor' },
    { id: 'c', duration_nights: 3, disembark_city: 'Aswan' },
  ]
  it('narrows to the length, then to the end port, keeping order', () => {
    expect(narrowCruiseCandidates(ships, { nights: 3, disembark: 'Aswan' }).map(r => r.id)).toEqual(['c'])
    expect(narrowCruiseCandidates(ships, { nights: 3 }).map(r => r.id)).toEqual(['b', 'c'])
  })
  it('a length or port no ship matches keeps the wider list', () => {
    expect(narrowCruiseCandidates(ships, { nights: 7, disembark: 'Edfu' }).map(r => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('the end port is the first day ashore after the sailing', () => {
    expect(sailingEndCity([
      { accommodation_type: 'hotel', city: 'Cairo' },
      { accommodation_type: 'cruise', city: 'Luxor' }, { accommodation_type: 'cruise', city: 'Edfu' },
      { accommodation_type: 'hotel', city: 'Aswan' },
    ])).toBe('Aswan')
    expect(sailingEndCity([{ accommodation_type: 'cruise', city: 'Luxor' }])).toBeNull()
    expect(sailingEndCity([{ accommodation_type: 'hotel', city: 'Cairo' }])).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The star, through the Rates › Cruises routes.
// ---------------------------------------------------------------------------
const stored = (over: Record<string, unknown>) => ({
  org_id: 'org-a', cruise_code: `C-${String(over.id)}`, tier: 'standard', is_active: true, cabin_type: 'standard', ...over,
})

beforeEach(() => {
  setMockTables({
    suppliers: [], supplier_properties: [], tour_days: [], tour_templates: [], itinerary_services: [],
    nile_cruises: [
      stored({ ...ceilaUp, is_preferred: true }),
      stored({ ...ceilaDown, is_preferred: true }),
      stored({ id: 'farida', ship_name: 'Farida', embark_city: 'Aswan', disembark_city: 'Luxor', duration_nights: 3, is_preferred: false }),
      stored({ id: 'other-org', org_id: 'org-b', ship_name: 'B Ship', embark_city: 'Aswan', disembark_city: 'Luxor', duration_nights: 3, is_preferred: true }),
    ],
  })
})

describe('starring a cruise', () => {
  it('OLD kept both stars; NEW: starring Farida clears Ceila (same route and length) only, and says so', async () => {
    const res = await cruiseById.PUT(json({ is_preferred: true }), params({ id: 'farida' }))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.star).toEqual({ scope: 'standard · Aswan → Luxor · 3 nights', cleared: ['Ceila'] })
    const all = await rows('nile_cruises')
    const starred = (id: string) => all.find(r => r.id === id)!.is_preferred
    expect(starred('farida')).toBe(true)
    expect(starred('up')).toBe(false)
    expect(starred('down')).toBe(true)      // the other route keeps its star
    expect(starred('other-org')).toBe(true) // another company's star is never touched
  })

  it('an edit that does not star clears nothing', async () => {
    const res = await cruiseById.PUT(json({ ship_name: 'Farida' }), params({ id: 'farida' }))
    expect((await res.json()).star).toBeUndefined()
    expect((await rows('nile_cruises')).find(r => r.id === 'up')!.is_preferred).toBe(true)
  })

  it('a new starred cruise clears the one it competes with', async () => {
    const res = await cruises.POST(json({ cruise_code: 'NEW-1', ship_name: 'Nile Goddess', tier: 'standard', cabin_type: 'standard', embark_city: 'Luxor', disembark_city: 'Aswan', duration_nights: 4, is_preferred: true, is_active: true }))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.star?.cleared).toEqual(['Ceila'])
    expect((await rows('nile_cruises')).find(r => r.id === 'down')!.is_preferred).toBe(false)
    expect((await rows('nile_cruises')).find(r => r.id === 'up')!.is_preferred).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Pricing: the ship the trip is priced from.
// ---------------------------------------------------------------------------
describe('pricing picks the sailing that ends where the trip goes ashore', () => {
  const priced = (over: Record<string, unknown>) => stored({ org_id: 'org-1', rate_low_double_eur: 100, rate_low_single_eur: 150, created_at: '2026-01-01', ...over })

  it('OLD priced the starred Luxor → Aswan ship for a Luxor round trip; NEW prices the ship that returns to Luxor', async () => {
    setMockTables({
      nile_cruises: [
        priced({ id: 'to-aswan', ship_name: 'Downstream', embark_city: 'Luxor', disembark_city: 'Aswan', duration_nights: 4, is_preferred: true, rate_low_double_eur: 120 }),
        priced({ id: 'round', ship_name: 'Round Trip', embark_city: 'Luxor', disembark_city: 'Luxor', duration_nights: 4, is_preferred: false, rate_low_double_eur: 90 }),
      ],
    })
    // No end port known: as before, the starred ship.
    expect((await resolveCruiseStay('org-1', 'standard', 'Luxor', true, null, undefined, undefined, 4)).rates?.shipName).toBe('Downstream')
    // Going ashore in Luxor: the ship that ends there.
    const r = await resolveCruiseStay('org-1', 'standard', 'Luxor', true, null, undefined, undefined, 4, 'Luxor')
    expect(r.rates?.shipName).toBe('Round Trip')
    expect(r.rates?.ppdNight).toBe(90)
  })

  it('an end port no ship matches prices as before (no cruise lost)', async () => {
    setMockTables({
      nile_cruises: [priced({ id: 'to-aswan', ship_name: 'Downstream', embark_city: 'Luxor', disembark_city: 'Aswan', duration_nights: 4, is_preferred: true })],
    })
    expect((await resolveCruiseStay('org-1', 'standard', 'Luxor', true, null, undefined, undefined, 4, 'Hurghada')).rates?.shipName).toBe('Downstream')
  })
})
