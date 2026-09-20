// Operator, 2026-09-20: "Can't we make the engine prioritize hotel & cruise
// name over tier when the hotel name is mentioned. So tiers will be the
// fallback as long as the hotel name is mentioned and they exist within the
// database … because actually some destinations might do not have a certain
// category so we are obliged to use different categories depends on what the
// destinations offer."
//
// The data says the same thing: Marriott Mena House is the only `luxury`
// hotel on file, Abu Simbel's only hotels are standard or untiered, and all
// six cruise rows are standard. A luxury programme that names its real
// properties could not be priced at all — every stay came back a hole.
import { vi, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { fullRateTables } from '../fixtures/sample-templates'
import { ANY_TIER } from '@/lib/pricing/property-choice'
import { chosenRowDifference, chosenPropertyMessage, rateSourceNote } from '@/lib/auto-pricing-service'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

describe('a named property is a decision, not a mismatch', () => {
  it('reports the difference instead of refusing', () => {
    expect(chosenRowDifference({ tier: 'deluxe', city: 'Cairo' }, 'standard', 'Cairo')).toBe('other_tier')
    expect(chosenRowDifference({ tier: 'standard', city: 'Luxor' }, 'standard', 'Cairo')).toBe('other_city')
    expect(chosenRowDifference({ tier: 'standard', city: 'Cairo' }, 'standard', 'Cairo')).toBeUndefined()
    // A hotel resolver passes no city for a ship — it must not be judged on one.
    expect(chosenRowDifference({ tier: 'standard' }, 'standard')).toBeUndefined()
  })

  it('the hole message no longer offers tier or city as reasons', () => {
    // They are not holes any more; claiming they are would send the operator
    // to re-choose a property that is already priced.
    const messages = (['gone', 'inactive', 'bad_nights'] as const).map(p => chosenPropertyMessage('hotel', p, 'Cairo'))
    expect(messages.join(' ')).not.toMatch(/tier being priced|another city/)
    expect(chosenPropertyMessage('hotel', 'inactive', 'Cairo')).toMatch(/switched off/)
    expect(chosenPropertyMessage('cruise', 'bad_nights')).toMatch(/number of nights/)
  })

  it('the line names both tiers, so a quote can be read without opening the rates', () => {
    const note = rateSourceNote({
      chosen: true, period: 'Winter 2026/27', isEurPassport: false,
      basis: 'per person in a double, per night', differs: 'other_tier', actualTier: 'luxury', tier: 'standard',
    })
    expect(note).toBe('Chosen on the day · luxury property in a standard quote · period "Winter 2026/27" · non-EU passport · per person in a double, per night')
  })

  it('and says nothing extra when there is nothing unusual', () => {
    const note = rateSourceNote({ chosen: false, period: 'Summer 2026', isEurPassport: true, basis: 'x', tier: 'standard' })
    expect(note).toBe('Automatic pick · period "Summer 2026" · EU passport · x')
  })

  it('an untiered property still reads as a difference rather than blank', () => {
    const note = rateSourceNote({
      chosen: true, period: null, isEurPassport: false, basis: 'x', differs: 'other_tier', actualTier: null, tier: 'luxury',
    })
    expect(note).toMatch(/another tier in a luxury quote/)
  })
})

describe('the list the operator picks from spans every tier', () => {
  const db = async () => {
    const { createClient } = await import('@supabase/supabase-js')
    return createClient('http://localhost', 'k')
  }

  it('ANY_TIER returns hotels of every tier in the city; a tier still filters', async () => {
    const t = fullRateTables() as any
    t.accommodation_rates = [
      { id: 'std', tier: 'standard', is_active: true, city: 'Cairo', property_name: 'Std', created_at: '2026-01-02' },
      { id: 'lux', tier: 'luxury', is_active: true, city: 'Cairo', property_name: 'Mena House', created_at: '2026-01-01' },
      { id: 'none', tier: null, is_active: true, city: 'Cairo', property_name: 'Untiered', created_at: '2026-01-03' },
      { id: 'off', tier: 'luxury', is_active: false, city: 'Cairo', property_name: 'Closed', created_at: '2026-01-04' },
    ]
    setMockTables(t)
    const { hotelCandidates } = await import('@/lib/pricing/property-candidates')
    const all = await hotelCandidates(await db(), 'Cairo', ANY_TIER)
    expect(all.map(r => r.id).sort()).toEqual(['lux', 'none', 'std'])
    // Switched off is still excluded — ANY_TIER widens the tier, nothing else.
    expect(all.some(r => r.id === 'off')).toBe(false)
    expect((await hotelCandidates(await db(), 'Cairo', 'standard')).map(r => r.id)).toEqual(['std'])
  })

  it('ANY_TIER returns ships of every tier', async () => {
    const t = fullRateTables() as any
    t.nile_cruises = [
      { id: 'a', tier: 'standard', is_active: true, duration_nights: 3, embark_city: 'Aswan', created_at: '2026-01-01' },
      { id: 'b', tier: 'luxury', is_active: true, duration_nights: 3, embark_city: 'Aswan', created_at: '2026-01-02' },
    ]
    setMockTables(t)
    const { cruiseCandidates } = await import('@/lib/pricing/property-candidates')
    expect((await cruiseCandidates(await db(), ANY_TIER, null, null)).map(r => r.id).sort()).toEqual(['a', 'b'])
    expect((await cruiseCandidates(await db(), 'luxury', null, null)).map(r => r.id)).toEqual(['b'])
  })
})

describe('a template can name the property it actually uses', () => {
  const editor = readFileSync('app/tours/manage/TourManagerContent.tsx', 'utf8')

  it('the template day editor offers the picker, for all tiers', () => {
    expect(editor).toContain('<DayPropertyPicker')
    expect(editor).toContain('tier={ANY_TIER}')
  })

  it('the choice covers the whole stay, as it does in the calculator', () => {
    expect(editor).toContain('applyStayChoice(stayDays(itinerary), index, ANY_TIER, id)')
  })

  it('a template day is grouped the way the pricing parser will group it', () => {
    // is_cruise_day here, accommodation_type in the choice model — get this
    // wrong and a ship choice is filed as a hotel in a city called "Nile
    // Cruise", which then never reaches the cruise line.
    expect(editor).toContain("d.is_cruise_day ? 'cruise' : 'hotel'")
  })

  it('the save keeps the whole day, so a new day field cannot be dropped', () => {
    // transport_type was lost exactly this way (create-template-from-itinerary,
    // 2026-09-19) and overnight_kind before it.
    const route = readFileSync('app/api/tours/templates/[id]/route.ts', 'utf8')
    expect(route).toContain('updateData.itinerary = body.itinerary')
  })
})
