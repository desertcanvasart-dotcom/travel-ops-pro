// Supplier documents: one per supplier, split only for a real operational
// reason (lib/documents/plan-documents.ts). An 8-day trip shaped like
// ITN-26-009: Cairo arrival, a 4-night Nile cruise, Abu Simbel, Cairo again.
import { describe, it, expect } from 'vitest'
import { planDocuments, nextDay, serviceDocKeys, documentedKeys, missingDocuments, staleDocuments, type PlanDay } from '@/lib/documents/plan-documents'

const day = (n: number, city: string, overnight: string | null, services: PlanDay['services'], attractions: string[] = []): PlanDay => ({
  id: `d${n}`,
  day_number: n,
  date: `2026-12-${String(4 + n).padStart(2, '0')}`,
  city,
  overnight_city: overnight,
  attractions,
  services,
})

const TRIP: PlanDay[] = [
  day(1, 'Cairo', 'Cairo', [
    { id: 's1', service_type: 'airport_service', service_name: 'Airport Meet & Greet (CAI)' },
    { id: 's2', service_type: 'transportation', service_name: 'Sedan - Cairo airport transfer' },
    { id: 's3', service_type: 'accommodation', service_name: 'Hotel - Steigenberger Nile Palace (Cairo)' },
  ]),
  day(2, 'Giza', 'Cairo', [
    { id: 's4', service_type: 'transportation', service_name: 'Day tour vehicle' },
    { id: 's5', service_type: 'guide', service_name: 'Egyptologist guide' },
    { id: 's6', service_type: 'entrance', service_name: 'Entrance Fees (non-EUR)', notes: 'Sites: Pyramids, Sphinx' },
    { id: 's7', service_type: 'accommodation', service_name: 'Hotel - Steigenberger Nile Palace (Cairo)' },
  ]),
  day(3, 'Luxor', 'Luxor', [
    { id: 's8', service_type: 'transportation', service_name: 'Luxor airport to ship' },
    { id: 's9', service_type: 'cruise', service_name: 'Nile Cruise - Al Farida (night 1 of 4)', notes: 'Deluxe cabin, full board' },
    { id: 's10', service_type: 'guide', service_name: 'Egyptologist guide' },
    { id: 's11', service_type: 'entrance', service_name: 'Karnak Temple' },
  ]),
  day(4, 'Edfu', 'Edfu', [{ id: 's12', service_type: 'cruise', service_name: 'Nile Cruise - Al Farida (night 2 of 4)' }]),
  day(5, 'Kom Ombo', 'Kom Ombo', [{ id: 's13', service_type: 'cruise', service_name: 'Nile Cruise - Al Farida (night 3 of 4)' }]),
  day(6, 'Aswan', 'Aswan', [{ id: 's14', service_type: 'cruise', service_name: 'Nile Cruise - Al Farida (night 4 of 4)' }]),
  day(7, 'Cairo', 'Cairo', [
    { id: 's15', service_type: 'transportation', service_name: 'Cairo airport to hotel' },
    { id: 's16', service_type: 'accommodation', service_name: 'Hotel - Steigenberger Nile Palace (Cairo)' },
    { id: 's17', service_type: 'tips', service_name: 'Driver tip' },
  ]),
  day(8, 'Cairo', null, [{ id: 's18', service_type: 'transportation', service_name: 'Hotel to airport' }]),
]

const plan = (days = TRIP, extra: Partial<Parameters<typeof planDocuments>[0]> = {}) =>
  planDocuments({ days, suppliers: {}, ...extra })
const summary = (docs: ReturnType<typeof plan>) =>
  docs.map(d => `${d.docType}: ${d.supplierName} [${d.services.map(s => s.day_number).join(',')}]`)

describe('planDocuments', () => {
  it('nextDay crosses months', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
  })

  it('a hotel stay of consecutive nights is one voucher, checking out the morning after the last night', () => {
    const hotels = plan().filter(d => d.docType === 'hotel_voucher')
    expect(hotels.map(h => [h.supplierName, h.checkIn, h.checkOut])).toEqual([
      ['Steigenberger Nile Palace', '2026-12-05', '2026-12-07'], // nights 1–2: two nights
      ['Steigenberger Nile Palace', '2026-12-11', '2026-12-12'], // back after the cruise: a second stay
    ])
  })

  it('a Nile cruise is one voucher for the whole sailing, with its ports and cabin', () => {
    const cruises = plan().filter(d => d.docType === 'cruise_voucher')
    expect(cruises).toHaveLength(1)
    expect(cruises[0].supplierName).toBe('Al Farida')
    expect([cruises[0].checkIn, cruises[0].checkOut]).toEqual(['2026-12-07', '2026-12-11'])
    expect(cruises[0].details).toContain('4 nights')
    expect(cruises[0].details).toContain('Edfu')
    expect(cruises[0].details).toMatch(/Cabin: Deluxe cabin/)
  })

  it('transport is one voucher per place, listing every route', () => {
    const transport = plan().filter(d => d.docType === 'transport_voucher')
    expect(summary(transport)).toEqual([
      'transport_voucher: Cairo Transportation [1,2,7,8]',
      'transport_voucher: Luxor Transportation [3]',
    ])
  })

  it('a supplier driving in two places gets one voucher per place', () => {
    const days = TRIP.map(d => ({ ...d, services: d.services.map(s => s.service_type === 'transportation' ? { ...s, supplier_id: 'sup-t' } : s) }))
    const transport = plan(days, { suppliers: { 'sup-t': { id: 'sup-t', name: 'Nile Wheels', type: 'transport' } } })
      .filter(d => d.docType === 'transport_voucher')
    expect(transport.map(t => `${t.supplierName} ${t.city}`)).toEqual(['Nile Wheels Cairo', 'Nile Wheels Luxor'])
  })

  it('entrance fees are one order for the whole booking, naming every site', () => {
    const entrance = plan().filter(d => d.docType === 'activity_voucher')
    expect(entrance).toHaveLength(1)
    expect(entrance[0].services.map(s => s.service_name)).toEqual(['Entrance Fees (non-EUR) — Pyramids, Sphinx', 'Karnak Temple'])
  })

  it('the assigned guide gets one assignment for the whole booking, with dates, places and languages', () => {
    const docs = plan(TRIP, {
      guides: [{ guide_id: 'g1', name: 'Ahmed Samir', languages: ['Japanese', 'English'], start_date: '2026-12-05', end_date: '2026-12-12' }],
    })
    const guides = docs.filter(d => d.docType === 'guide_assignment')
    expect(guides).toHaveLength(1)
    expect(guides[0].supplierName).toBe('Ahmed Samir')
    expect(guides[0].services.map(s => `${s.day_number} ${s.city}`)).toEqual(['2 Cairo', '3 Luxor'])
    expect(guides[0].details).toContain('Languages: Japanese, English')
  })

  it('guiding with nobody assigned is grouped per place', () => {
    const guides = plan().filter(d => d.docType === 'guide_assignment')
    expect(guides.map(g => g.supplierName)).toEqual(['Cairo Guide Services', 'Luxor Guide Services'])
  })

  it('tips and lines that need no document make none; the whole trip is nine documents, not one per line', () => {
    const docs = plan()
    expect(docs.flatMap(d => d.services).some(s => s.service_type === 'tips')).toBe(false)
    // 2 hotel stays, 1 cruise, 2 transport, 1 entrance, 2 guide (unassigned,
    // per place), 1 meet & assist (the airport meet & greet was on none).
    expect(docs).toHaveLength(9)
  })

  it('airport and hotel meet & assist go on their own order, never the driver’s voucher', () => {
    const days = [
      day(1, 'Cairo', 'Cairo', [
        { service_type: 'airport_service', service_name: 'Airport Meet & Greet (CAI)' },
        { service_type: 'hotel_service', service_name: 'Check-in assist' },
        { service_type: 'transportation', service_name: 'Sedan - Cairo airport transfer' },
        // Older grid rows: the slot tag says what it is, whatever the type.
        { service_type: 'transfer', service_name: 'full_service CAI', description: '[pricing-grid:airport_services] full_service CAI' },
      ]),
    ]
    expect(summary(plan(days))).toEqual([
      'service_order: Cairo Meet & Assist [1,1,1]',
      'transport_voucher: Cairo Transportation [1]',
    ])
  })

  it('a supplement joins the stay it falls in', () => {
    const days = [
      day(1, 'Cairo', 'Cairo', [
        { service_type: 'accommodation', service_name: 'Hotel - Mena House (Cairo)' },
        { service_type: 'accommodation', service_name: 'Single Supplement' },
      ]),
      day(2, 'Cairo', 'Cairo', [{ service_type: 'accommodation', service_name: 'Hotel - Mena House (Cairo)' }]),
    ]
    const hotels = plan(days).filter(d => d.docType === 'hotel_voucher')
    expect(hotels).toHaveLength(1)
    expect(hotels[0].services).toHaveLength(3)
    expect([hotels[0].checkIn, hotels[0].checkOut]).toEqual(['2026-12-05', '2026-12-07'])
  })

  it('two different hotels in one city are two vouchers', () => {
    const days = [
      day(1, 'Cairo', 'Cairo', [{ service_type: 'accommodation', service_name: 'Hotel - Mena House (Cairo)' }]),
      day(2, 'Cairo', 'Cairo', [{ service_type: 'accommodation', service_name: 'Hotel - Four Seasons (Cairo)' }]),
    ]
    expect(plan(days).map(d => d.supplierName)).toEqual(['Mena House', 'Four Seasons'])
  })

  it('one hotel supplier, two stays with a gap between them: two vouchers, not one spanning the gap', () => {
    const days = [
      day(1, 'Cairo', 'Cairo', [{ service_type: 'accommodation', service_name: 'Hotel - Old Cataract (Cairo)', supplier_id: 'h' }]),
      day(2, 'Aswan', 'Aswan', [{ service_type: 'accommodation', service_name: 'Hotel - Old Cataract (Aswan)', supplier_id: 'h' }]),
      day(4, 'Aswan', 'Aswan', [{ service_type: 'accommodation', service_name: 'Hotel - Old Cataract (Aswan)', supplier_id: 'h' }]),
    ]
    const hotels = plan(days, { suppliers: { h: { id: 'h', name: 'Sofitel Egypt', type: 'hotel_chain' } } })
    expect(hotels.map(h => `${h.checkIn}→${h.checkOut}`)).toEqual(['2026-12-05→2026-12-07', '2026-12-08→2026-12-09'])
    expect(new Set(hotels.map(h => h.supplierName))).toEqual(new Set(['Sofitel Egypt']))
  })

  it('serviceDocKeys matches a stored line by id, or by day, type and name', () => {
    expect(serviceDocKeys({ service_id: 'x', day_number: 2, service_type: 'guide', service_name: 'Guide' })).toEqual(['id:x', 'n:2|guide|guide'])
    expect(serviceDocKeys({ day_number: 2, service_type: 'Guide', service_name: ' Guide ' })).toEqual(['n:2|guide|guide'])
  })
})

describe('what the trip has that no document carries, and documents it no longer matches', () => {
  // The documents Generate writes for TRIP, as stored.
  const stored = plan().map((p, i) => ({ id: `doc${i}`, document_number: `D-${i}`, supplier_name: p.supplierName, services: p.services }))

  it('a trip whose documents are all generated has nothing missing and nothing out of date', () => {
    expect(missingDocuments(plan(), documentedKeys(stored))).toEqual([])
    expect(staleDocuments(plan(), stored)).toEqual([])
  })

  it('a line added after Generate is missing; only that line', () => {
    const days = structuredClone(TRIP)
    days[1].services!.push({ id: 's99', service_type: 'meal', service_name: 'Abou El Sid dinner' })
    const missing = missingDocuments(plan(days), documentedKeys(stored))
    expect(missing.map(m => [m.supplierName, m.services.map(s => s.service_name)])).toEqual([
      ['Cairo Restaurant & Meals', ['Abou El Sid dinner']],
    ])
  })

  it('a line removed from the trip leaves its document out of date; a hand-made document never is', () => {
    const days = structuredClone(TRIP)
    days[1].services = days[1].services!.filter(s => s.id !== 's6')
    const handMade = { id: 'manual', document_number: 'SO-9', supplier_name: 'Extra', services: [{ description: 'Felucca', quantity: 1 }] }
    expect(staleDocuments(plan(days), [...stored, handMade])).toEqual([
      { id: expect.any(String), document_number: expect.any(String), supplier_name: 'Entrance Fees', gone: 1 },
    ])
  })

  it('the grid saving the trip again (new line ids, same lines) is not a change', () => {
    const days = TRIP.map(d => ({ ...d, services: d.services!.map(s => ({ ...s, id: `new-${s.id}` })) }))
    expect(staleDocuments(plan(days), stored)).toEqual([])
    expect(missingDocuments(plan(days), documentedKeys(stored))).toEqual([])
  })
})
