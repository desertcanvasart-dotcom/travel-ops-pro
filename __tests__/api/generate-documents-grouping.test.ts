// Generate documents, end to end against a fake database: Cairo, Giza, an
// Alexandria day trip from the Cairo hotel, Cairo. One transport voucher, one
// hotel voucher (Cairo, Giza folded in), the Alexandria sites on their own
// voucher naming them — and a second Generate makes nothing new.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store: { docs: any[] } = { docs: [] }

const DAYS = [
  { day_number: 1, date: '2026-10-01', city: 'Cairo', overnight_city: 'Cairo', attractions: [], services: [
    { service_type: 'transportation', service_name: 'Airport transfer', total_cost: 30 },
    { service_type: 'accommodation', service_name: 'Mena House', total_cost: 200 },
  ] },
  { day_number: 2, date: '2026-10-02', city: 'Giza', overnight_city: 'Cairo', attractions: [], services: [
    { service_type: 'transportation', service_name: 'Day tour', total_cost: 60 },
    { service_type: 'accommodation', service_name: 'Mena House', total_cost: 200 },
  ] },
  { day_number: 3, date: '2026-10-03', city: 'Alexandria', overnight_city: 'Cairo', attractions: ['Catacombs', "Pompey's Pillar"], services: [
    { service_type: 'transportation', service_name: 'Intercity day trip', total_cost: 120 },
    { service_type: 'entrance', service_name: 'Entrance Fees (non-EUR)', notes: "Sites: Catacombs, Pompey's Pillar", total_cost: 40 },
    { service_type: 'accommodation', service_name: 'Mena House', total_cost: 200 },
    { service_type: 'tips', service_name: 'Driver tip', total_cost: 5 },
  ] },
]

function chain(table: string) {
  const ops: Record<string, unknown[]> = {}
  const result = () => {
    if (table === 'itineraries') return { data: { id: 'itn-1', itinerary_code: 'ITN-1', total_cost: 1000, currency: 'EUR', client_name: 'T', start_date: '2026-10-01' }, error: null }
    if (table === 'itinerary_days') return { data: DAYS, error: null }
    if (table === 'suppliers') return { data: [], error: null }
    if (table === 'supplier_documents') {
      if (ops.insert) {
        const rows = (ops.insert[0] as any[]).map((r, i) => ({ ...r, id: `doc-${store.docs.length + i}` }))
        store.docs.push(...rows)
        return { data: rows, error: null }
      }
      if (ops.like) return { data: [], error: null }
      return { data: store.docs.filter(d => d.status !== 'cancelled'), error: null }
    }
    return { data: null, error: null }
  }
  const proxy: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: any) => resolve(result())
      if (prop === 'single') return async () => result()
      return (...args: unknown[]) => { ops[prop] = args; return proxy }
    },
  })
  return proxy
}

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({ from: (t: string) => chain(t) }) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-1', noOrgResponse: () => new Response(null, { status: 403 }) }))

import { POST } from '@/app/api/itineraries/[id]/generate-documents/route'

const generate = async (body: Record<string, unknown> = {}) => {
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: 'itn-1' }) } as never)
  return res.json()
}

beforeEach(() => { store.docs = [] })

describe('one document per supplier, split only where it must be', () => {
  it('Cairo transport and the hotel stay on one voucher each; the sites named on one entrance order; no tips', async () => {
    const out = await generate()
    expect(out.success).toBe(true)
    const titles = store.docs.map(d => `${d.document_type}: ${d.supplier_name} (${d.services.length})`).sort()
    expect(titles).toEqual([
      'activity_voucher: Entrance Fees (1)',
      'hotel_voucher: Cairo Hotel (3)',
      'transport_voucher: Cairo Transportation (3)',
    ])
    const entrance = store.docs.find(d => d.document_type === 'activity_voucher')
    expect(entrance.services[0].service_name).toBe("Entrance Fees (non-EUR) — Catacombs, Pompey's Pillar")
  })

  it('a second Generate makes nothing new', async () => {
    await generate()
    const again = await generate()
    expect(again.count).toBe(0)
    expect(store.docs).toHaveLength(3)
  })

  it('asking for one kind makes only that kind (the button sends documentTypes)', async () => {
    await generate({ documentTypes: ['hotel_voucher'] })
    expect(store.docs.map(d => d.document_type)).toEqual(['hotel_voucher'])
  })
})

describe('a trip documented before the grouping changed', () => {
  it('regenerating puts no service on a second document, whatever the old ones were called', async () => {
    // What the old per-kind-per-place grouping made, under its own names.
    store.docs = [
      { id: 'old-1', status: 'draft', document_type: 'hotel_voucher', supplier_name: 'Cairo Hotel',
        services: DAYS.flatMap(d => d.services.filter(s => s.service_type === 'accommodation').map(s => ({ ...s, day_number: d.day_number }))) },
      { id: 'old-2', status: 'sent', document_type: 'activity_voucher', supplier_name: 'Alexandria Entrance Fees',
        services: [{ day_number: 3, service_type: 'entrance', service_name: "Entrance Fees (non-EUR) — Catacombs, Pompey's Pillar" }] },
    ]
    const out = await generate()
    // Only the transport, which no document carried yet.
    expect(out.count).toBe(1)
    expect(store.docs.slice(2).map(d => d.document_type)).toEqual(['transport_voucher'])
  })
})
