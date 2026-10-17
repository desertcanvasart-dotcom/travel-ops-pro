import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { distinctiveHotelName, hotelsMentioned, namedHotelFor } from '@/lib/pricing/hotel-mentions'
import { hotelForTier } from '@/app/pricing-grid/lib/option-item'
import { applyPackageToDays, describeRemoved } from '@/app/pricing-grid/lib/package-apply'
import { transportTypeWarnings } from '@/app/pricing-grid/lib/transport-warnings'
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'
import { packageRules } from '@/lib/ai/package-prompt-rules'
import type { GridDay } from '@/app/pricing-grid/types'
import type { RateOption } from '@/app/pricing-grid/types'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const HOTELS = [
  { id: 'mena-std', name: 'Marriott Mena House', city: 'Giza', tier: 'standard' },
  { id: 'mena-lux', name: 'Marriott Mena House', city: 'Giza', tier: 'luxury' },
  { id: 'fs-cairo', name: 'Four Seasons Nile Plaza', city: 'Cairo', tier: 'luxury' },
  { id: 'steig-lux', name: 'Steigenberger Nile Palace', city: 'Luxor', tier: 'deluxe' },
  { id: 'grand', name: 'Grand Hotel', city: 'Aswan', tier: 'standard' },
]
const TEXT = '4-Day Stay at Marriott Mena House Tour Plan … transfer to the Mena House Hotel …'

describe('hotels named in the text', () => {
  it('keeps the words that identify the property', () => {
    expect(distinctiveHotelName('Marriott Mena House')).toBe('mena house')
    expect(distinctiveHotelName('Steigenberger Nile Palace')).toBe('nile palace')
    expect(distinctiveHotelName('Grand Hotel')).toBe('')
  })

  it('finds the named hotel, and only it', () => {
    expect(hotelsMentioned(TEXT, HOTELS).map(h => h.id)).toEqual(['mena-std', 'mena-lux'])
  })

  it('replaces another hotel the AI picked, preferring the selected tier', () => {
    const byId = new Map(HOTELS.map(h => [h.id, h]))
    const mentioned = hotelsMentioned(TEXT, HOTELS)
    // The AI took the first Cairo luxury hotel on a day it called "Cairo".
    expect(namedHotelFor('fs-cairo', 'Cairo', byId, mentioned, 'luxury')?.id).toBe('mena-lux')
    // Saved only as standard: still the named hotel.
    expect(namedHotelFor('fs-cairo', 'Cairo', byId, mentioned.filter(m => m.tier === 'standard'), 'luxury')?.id).toBe('mena-std')
    // Already right: nothing to change.
    expect(namedHotelFor('mena-lux', 'Giza', byId, mentioned, 'luxury')).toBeNull()
  })

  it('leaves the pick alone when the text names no hotel', () => {
    const byId = new Map(HOTELS.map(h => [h.id, h]))
    expect(namedHotelFor('fs-cairo', 'Cairo', byId, hotelsMentioned('A week in Egypt', HOTELS), 'luxury')).toBeNull()
  })
})


const opt = (id: string, name: string, extra: Partial<RateOption> & Record<string, unknown> = {}): RateOption =>
  ({ id, name, rateEur: 10, rateNonEur: 10, ...extra }) as RateOption

describe('switching tier on the grid', () => {
  const luxury = [
    opt('fs', 'Four Seasons Nile Plaza Cairo (luxury | BB)', { city: 'Cairo' }),
    opt('mena', 'Marriott Mena House Giza (luxury | BB)', { city: 'Giza' }),
  ]
  it('keeps the same hotel, whether picked in the grid or by the parser', () => {
    expect(hotelForTier({ name: 'Marriott Mena House Giza (standard | BB)' }, 'Cairo', luxury)?.id).toBe('mena')
    expect(hotelForTier({ name: 'Marriott Mena House (Giza)' }, 'Cairo', luxury)?.id).toBe('mena')
  })
  it('else a hotel of the day\'s city', () => {
    expect(hotelForTier({ name: 'Unknown Inn (Cairo)' }, 'Cairo', luxury)?.id).toBe('fs')
  })
})

describe('the parse route', () => {
  const src = read('app/api/pricing-grid/parse/route.ts')
  it('sees hotels of every tier, priced from their rate periods', () => {
    expect(src).toContain(".from('accommodation_rates').select('*').eq('org_id', orgId).eq('is_active', true),")
    expect(src).toContain('hotelPpDouble(r)')
  })
  it('enforces the named hotel and returns notes', () => {
    expect(src).toContain('namedHotelFor(')
    expect(src).toMatch(/notes,\n\s*\}\)/)
  })
  it('keeps layover tours off ordinary arrivals', () => {
    expect(src).toContain('(layoverTrip || !isLayoverRoute(t))')
    expect(src).toContain('plainTransferFor(')
  })
})

const day = (n: number, slots: GridDay['slots']): GridDay =>
  ({ id: `d${n}`, dayNumber: n, title: '', city: 'Cairo', description: '', isExpanded: false, slots })
const item = (rateId: string, name = rateId) => ({ rateId, name, rateEur: 1, rateNonEur: 1 })

describe('changing the package on a built grid', () => {
  const days = [day(1, [
    { slotId: 'route', selectedItems: [item('apt__sedan'), item('tour__sedan')], customAmount: 0 },
    { slotId: 'accommodation', selectedItems: [item('h1'), item('h1_supp')], customAmount: 0 },
    { slotId: 'airport_services', selectedItems: [item('as1')], customAmount: 0 },
  ])]
  const typeOf = (id: string) => (id.startsWith('apt') ? 'airport_transfer' : 'day_tour')
  it('removes what Tours Only does not sell, and says what', () => {
    const pkg = PACKAGE_TYPE_CONFIGS.find(p => p.slug === 'tours-only')!
    const r = applyPackageToDays(days, pkg, typeOf)
    const slot = (id: string) => r.days[0].slots.find(s => s.slotId === id)!.selectedItems.map(i => i.rateId)
    expect(slot('route')).toEqual(['tour__sedan'])
    expect(slot('accommodation')).toEqual([])
    expect(describeRemoved(r.removed)).toBe('1 hotel night and 2 airport services')
  })
  it('leaves a full package alone', () => {
    const pkg = PACKAGE_TYPE_CONFIGS.find(p => p.slug === 'full-package')!
    expect(describeRemoved(applyPackageToDays(days, pkg, typeOf).removed)).toBe('')
  })
})

describe('package types that differ', () => {
  const of = (slug: string) => PACKAGE_TYPE_CONFIGS.find(p => p.slug === slug)!
  it('day trips and shore excursions keep one base; shore excursions start at the port', () => {
    expect(of('day-trips').includes.overnightMoves).toBe(false)
    expect(of('shore-excursions').includes.startPoint).toBe('port')
    expect(packageRules(of('day-trips'))).toContain('ONE base')
  })
  it('the cruise packages expect a cruise', () => {
    expect(of('cruise-land').includes.cruise).toBe(true)
    expect(of('cruise-package').includes.cruise).toBe(true)
    expect(of('full-package').includes.cruise).toBe(false)
  })
})

describe('airport route type warning', () => {
  const routes = [
    opt('a__van', 'Van (3-7 pax) — Cairo Airport · Day Tour', { service_type: 'day_tour', origin_city: 'Cairo Airport' }),
    opt('l__van', 'Van (3-7 pax) — Airport → Full Day → Airport', { service_type: 'day_tour', origin_city: 'Cairo Airport' }),
    opt('t__van', 'Van (3-7 pax) — Cairo Airport Transfer', { service_type: 'airport_transfer', origin_city: 'Cairo Airport' }),
  ]
  it('flags an airport route saved as a day tour, not a layover tour or a transfer', () => {
    const d = [day(1, [{ slotId: 'route', selectedItems: routes.map(r => item(r.id)), customAmount: 0 }])]
    const w = transportTypeWarnings(d, routes)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('"Cairo Airport"')
  })
})
