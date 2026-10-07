// Assignments (ported from autoura-saas #577, #578, #611): a hotel or
// restaurant listed once in its picker; an assignment's dates changed in place;
// a restaurant's WhatsApp notice reaches the meal rate's supplier.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onePerPlace } from '@/lib/resources/one-per-place'

describe('a place is listed once', () => {
  it('one hotel per name and city, whatever its rooms and seasons; an active row preferred', () => {
    const rows = [
      { id: 'a', name: 'Mena House', city: 'Cairo', is_active: false },
      { id: 'b', name: 'Mena House', city: 'Cairo', is_active: true },
      { id: 'c', name: 'mena house ', city: 'Cairo', is_active: true },
      { id: 'd', name: 'Mena House', city: 'Luxor', is_active: true },
      { id: 'e', name: '', city: 'Cairo' },
    ]
    expect(onePerPlace(rows).map(r => r.id)).toEqual(['b', 'd'])
  })
})

// ── The routes, against a fake database ─────────────────────────────────────
const db: { tables: Record<string, any[]>; updates: any[] } = { tables: {}, updates: [] }
function chain(table: string) {
  const filters: Array<[string, unknown]> = []
  let update: any = null
  const rows = () => (db.tables[table] ?? []).filter(r => filters.every(([k, v]) => k.includes('.') ? r[k.split('.')[0]]?.[k.split('.')[1]] === v : r[k] === v))
  const p: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: any) => {
        if (update) { const hit = rows(); db.updates.push({ table, update, ids: hit.map(r => r.id) }); return resolve({ data: hit.map(r => ({ ...r, ...update })), error: null }) }
        return resolve({ data: rows(), error: null })
      }
      if (prop === 'eq') return (k: string, v: unknown) => { filters.push([k, v]); return p }
      if (prop === 'update') return (u: any) => { update = u; return p }
      if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: rows()[0] ?? null, error: rows()[0] ? null : { message: 'none' } })
      return () => p
    },
  })
  return p
}
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({ from: (t: string) => chain(t) }) }))
vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => ({ from: (t: string) => chain(t) }) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-1', noOrgResponse: () => new Response(null, { status: 403 }) }))
const sent: Array<{ to: string; body: string }> = []
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: async (o: any) => { sent.push({ to: o.to, body: o.body }); return { success: true } } }))

beforeEach(() => { db.tables = {}; db.updates = []; sent.length = 0 })

describe('Change dates on an assignment', () => {
  const patch = async (id: string, body: unknown) => {
    const { PATCH } = await import('@/app/api/itinerary-resources/route')
    return PATCH(new Request(`http://x/api/itinerary-resources?id=${id}`, { method: 'PATCH', body: JSON.stringify(body) }) as never)
  }
  beforeEach(() => {
    db.tables.itinerary_resources = [
      { id: 'r1', itinerary: { org_id: 'org-1' } },
      { id: 'r2', itinerary: { org_id: 'org-2' } },
    ]
  })
  it('moves the dates; the end defaults to the start', async () => {
    const res = await patch('r1', { start_date: '2026-10-01' })
    expect(res.status).toBe(200)
    expect(db.updates[0]).toMatchObject({ ids: ['r1'], update: { start_date: '2026-10-01', end_date: '2026-10-01' } })
  })
  it('refuses an end before the start, a non-date, and another organisation’s assignment', async () => {
    expect((await patch('r1', { start_date: '2026-10-04', end_date: '2026-10-01' })).status).toBe(400)
    expect((await patch('r1', { start_date: 'tomorrow' })).status).toBe(400)
    expect((await patch('r2', { start_date: '2026-10-01' })).status).toBe(404)
    expect(db.updates).toEqual([])
  })
})

describe('a restaurant’s WhatsApp notice', () => {
  const notify = async (resourceId: string) => {
    const { POST } = await import('@/app/api/whatsapp/notify-resource/route')
    return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({
      itineraryId: 'itn-1', resourceId, resourceType: 'restaurant', resourceName: 'Fish Market', startDate: '2026-10-03',
    }) }) as never)
  }
  beforeEach(() => {
    db.tables.itineraries = [{ id: 'itn-1', client_name: 'Tersa', num_adults: 2 }]
    db.tables.meal_rates = [{ id: 'meal-1', restaurant_name: 'Fish Market', supplier: { name: 'Fish Market Alexandria', whatsapp: '+201000000001' } }]
    db.tables.restaurant_contacts = [{ id: 'rc-1', name: 'Kebabgy', phone: '+201000000002', whatsapp: null }]
  })
  it('a restaurant picked from Rates → Meals reaches its meal rate’s supplier (it was "Resource not found")', async () => {
    const res = await notify('meal-1')
    expect(res.status).toBe(200)
    expect(sent[0]).toMatchObject({ to: '+201000000001' })
    expect(sent[0].body).toContain('Fish Market Alexandria')
  })
  it('a directory restaurant reaches its own number', async () => {
    expect((await notify('rc-1')).status).toBe(200)
    expect(sent[0].to).toBe('+201000000002')
  })
  it('an unknown id is still "not found"', async () => {
    expect((await notify('nope')).status).toBe(404)
  })
})
