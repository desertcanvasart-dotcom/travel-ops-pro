import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  assembleProgramItinerary,
  type SourceProgramDay,
  type SourceProgramHotel,
  type TripStay,
} from '@/lib/documents/assemble-program-itinerary'

// A customer's 日程表 lists the TRIP's own hotels and names its ship (operator,
// 2026-09-17, option C). The bare programme keeps its imported list.

// NMS803-CR-ABS as stored: a night in the air, four nights aboard, Abu Simbel,
// Cairo, departure. The imported rows are the office's own.
const DAYS: SourceProgramDay[] = [
  { day: 1, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
  ...[2, 3, 4, 5].map(day => ({ day, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', is_cruise_day: true })),
  { day: 6, description: null, attractions: null, meals: null, overnight_city: 'Abu Simbel' },
  { day: 7, description: null, attractions: null, meals: null, overnight_city: 'Cairo' },
  { day: 8, description: null, attractions: null, meals: null, overnight_city: null },
]
const IMPORTED: SourceProgramHotel[] = [
  { hotel: 'ナイル川クルーズ船', phone: null, address: 'クルーズ船名：' },
  { hotel: 'セティ アブシンベル レイク リゾート', phone: '097 3400727', address: 'Abu Simbel, Aswan Governorate 1211126' },
  { hotel: 'シュタイゲンベルガー ピラミッズ カイロ', phone: '02 25993999', address: 'Cairo - Alexandria Desert Rd, Giza' },
]

const assemble = (trip_stays: TripStay[] | null, start_date: string | null = '2026-12-05') =>
  assembleProgramItinerary({
    template_code: 'NMS803-CR-ABS', itinerary: DAYS, hotels: IMPORTED, trip_stays,
    created_date: '17 September 2026', font_face_css: '', org: null,
    departure: { start_date, cairo_guide: null, south_guide: null, author: null, customer_name: '鈴木' },
  }).hotel_rows

describe('利用ホテル for a customer trip', () => {
  const trip: TripStay[] = [
    ...[2, 3, 4, 5].map(day => ({ day, kind: 'cruise' as const, name: 'Al Farida Nile Cruise', name_ja: 'アル・ファリダ', phone: null, address: null })),
    { day: 6, kind: 'hotel', name: 'Seti Abu Simbel Lake Resort', name_ja: null, phone: '097 3400727', address: 'Abu Simbel' },
    { day: 7, kind: 'hotel', name: 'Steigenberger Nile Palace', name_ja: 'シュタイゲンベルガー ナイル パレス', phone: '02 0000', address: 'Corniche, Cairo' },
  ]

  it('names the ship where the office leaves クルーズ船名： blank, and prints the trip\'s hotels with their dates', () => {
    expect(assemble(trip)).toEqual([
      { hotel: 'ナイル川クルーズ船', check_in: '12/6', check_out: '12/10', phone: '', address: 'クルーズ船名：アル・ファリダ' },
      // No Japanese name on file: the English name prints, never a guess.
      { hotel: 'Seti Abu Simbel Lake Resort', check_in: '12/10', check_out: '12/11', phone: '097 3400727', address: 'Abu Simbel' },
      // The trip's hotel, not the programme's standard Steigenberger Pyramids.
      { hotel: 'シュタイゲンベルガー ナイル パレス', check_in: '12/11', check_out: '12/12', phone: '02 0000', address: 'Corniche, Cairo' },
    ])
  })

  it('a stay the trip names no property for keeps the imported row for that stay', () => {
    // ITN-26-010: converted before its cruise nights were priced.
    const rows = assemble(trip.filter(s => s.kind === 'hotel'))
    expect(rows[0]).toMatchObject({ hotel: 'ナイル川クルーズ船', address: 'クルーズ船名：', check_in: '12/6' })
    expect(rows[2].hotel).toBe('シュタイゲンベルガー ナイル パレス')
  })

  it('without imported rows that pair with the stays, an unnamed stay is dates only', () => {
    const rows = assembleProgramItinerary({
      template_code: 'X', itinerary: DAYS, hotels: IMPORTED.slice(0, 2), trip_stays: trip.filter(s => s.day === 7),
      created_date: '', font_face_css: '', org: null,
      departure: { start_date: '2026-12-05', cairo_guide: null, south_guide: null, author: null, customer_name: null },
    }).hotel_rows
    expect(rows.map(r => r.hotel)).toEqual(['', '', 'シュタイゲンベルガー ナイル パレス'])
    expect(rows[0].check_in).toBe('12/6')
  })

  it('two different hotels inside one programme stay are two rows with their own dates', () => {
    const cairoTwice: SourceProgramDay[] = [
      { day: 1, description: null, attractions: null, meals: null, overnight_city: 'Cairo' },
      { day: 2, description: null, attractions: null, meals: null, overnight_city: 'Cairo' },
      { day: 3, description: null, attractions: null, meals: null, overnight_city: 'Cairo' },
      { day: 4, description: null, attractions: null, meals: null, overnight_city: null },
    ]
    const rows = assembleProgramItinerary({
      template_code: 'X', itinerary: cairoTwice, hotels: [{ hotel: 'メナ ハウス ホテル' }],
      trip_stays: [
        { day: 1, kind: 'hotel', name: 'Mena House', name_ja: null, phone: null, address: null },
        { day: 2, kind: 'hotel', name: 'Nile Ritz', name_ja: null, phone: null, address: null },
        { day: 3, kind: 'hotel', name: 'Nile Ritz', name_ja: null, phone: null, address: null },
      ],
      created_date: '', font_face_css: '', org: null,
      departure: { start_date: '2026-12-01', cairo_guide: null, south_guide: null, author: null, customer_name: null },
    }).hotel_rows
    expect(rows.map(r => `${r.hotel}:${r.check_in}→${r.check_out}`)).toEqual(['Mena House:12/1→12/2', 'Nile Ritz:12/2→12/4'])
  })

  it('the bare programme (no trip) is unchanged: the imported list', () => {
    expect(assemble(null).map(r => r.hotel)).toEqual(IMPORTED.map(h => h.hotel))
  })
})

describe('both 日程表 doors pass the trip', () => {
  it('the office route and the customer portal give the builder the itinerary', () => {
    expect(readFileSync('app/api/documents/program-itinerary/route.ts', 'utf8')).toMatch(/templateId,\s+itineraryId,/)
    expect(readFileSync('app/api/portal/[token]/documents/[key]/route.ts', 'utf8')).toContain('itineraryId: booking.itinerary_id')
    expect(readFileSync('lib/documents/program-itinerary-doc.ts', 'utf8')).toContain('loadTripStays(supabase, input.itineraryId, orgId)')
  })

  it('the property form saves the Japanese name and address', () => {
    for (const f of ['app/api/suppliers/[id]/properties/route.ts', 'app/api/suppliers/[id]/properties/[propertyId]/route.ts']) {
      expect(readFileSync(f, 'utf8')).toContain("'name_ja', 'address'")
    }
  })
})

describe('which property record prints (Greptile on #457)', () => {
  it('a name linked to more than one property picks none rather than the wrong phone and address', async () => {
    const { vi } = await import('vitest')
    const tables: Record<string, unknown[]> = {
      itineraries: [{ id: 'it1', org_id: 'org' }],
      itinerary_days: [{ itinerary_id: 'it1', day_number: 2, services: [{ service_type: 'accommodation', service_code: 'day2-hotel', service_name: 'Hotel - Steigenberger Nile Palace (Cairo)', supplier_name: null }] }],
      accommodation_rates: [
        { property_name: 'Steigenberger Nile Palace', property_id: 'p-cairo' },
        { property_name: 'Steigenberger Nile Palace', property_id: 'p-luxor' },
      ],
      nile_cruises: [],
      supplier_properties: [
        { id: 'p-cairo', name: 'Steigenberger Nile Palace', property_type: 'hotel', name_ja: 'カイロ', contact_phone: '02', address: 'Cairo' },
        { id: 'p-luxor', name: 'Steigenberger Nile Palace', property_type: 'hotel', name_ja: 'ルクソール', contact_phone: '095', address: 'Luxor' },
      ],
    }
    // Minimal chainable client: filters are ignored except eq on id/itinerary.
    const client = {
      from: (table: string) => {
        let rows = [...(tables[table] ?? [])] as Record<string, unknown>[]
        const q: Record<string, unknown> = {
          select: () => q,
          eq: (col: string, val: unknown) => { rows = rows.filter(r => !(col in r) || r[col] === val); return q },
          in: () => q,
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        }
        return q
      },
    }
    const { loadTripStays } = await import('@/lib/documents/trip-stays')
    const stays = await loadTripStays(client as never, 'it1', 'org')
    expect(stays).toEqual([{ day: 2, kind: 'hotel', name: 'Steigenberger Nile Palace', name_ja: null, phone: null, address: null }])
    vi.restoreAllMocks()
  })
})
