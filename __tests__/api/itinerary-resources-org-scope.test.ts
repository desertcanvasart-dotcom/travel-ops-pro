// A trip's assignments are its organisation's (lib/itinerary-resources/
// org-scope.ts). The routes read with the service-role client, which bypasses
// RLS, and only the date change used to check: listing, adding and deleting an
// assignment, and the double-booking check, worked on any organisation's trip.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db: { tables: Record<string, any[]>; inserted: any[]; deleted: string[] } = { tables: {}, inserted: [], deleted: [] }

// Each itinerary_resources row carries its trip as `itinerary`, as the
// !inner join would return it; `itineraries` holds the trips.
function chain(table: string) {
  const filters: Array<(r: any) => boolean> = []
  let op: 'select' | 'insert' | 'delete' = 'select'
  let row: any = null
  const get = (r: any, k: string) => k.includes('.') ? r[k.split('.')[0]]?.[k.split('.')[1]] : r[k]
  const rows = () => (db.tables[table] ?? []).filter(r => filters.every(f => f(r)))
  const result = () => {
    if (op === 'insert') { db.inserted.push(row); return { data: { id: 'new', ...row }, error: null } }
    if (op === 'delete') { db.deleted.push(...rows().map(r => r.id)); return { data: null, error: null } }
    return { data: rows(), error: null }
  }
  const p: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: any) => resolve(result())
      if (prop === 'eq') return (k: string, v: unknown) => { filters.push(r => get(r, k) === v); return p }
      if (prop === 'neq') return (k: string, v: unknown) => { filters.push(r => get(r, k) !== v); return p }
      if (prop === 'in') return (k: string, v: unknown[]) => { filters.push(r => v.includes(get(r, k))); return p }
      if (prop === 'insert') return (r: any) => { op = 'insert'; row = r; return p }
      if (prop === 'delete') return () => { op = 'delete'; return p }
      if (prop === 'maybeSingle') return async () => ({ data: rows()[0] ?? null, error: null })
      if (prop === 'single') return async () => op === 'insert' ? result() : ({ data: rows()[0] ?? null, error: null })
      return () => p
    },
  })
  return p
}
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({ from: (t: string) => chain(t) }) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-1', noOrgResponse: () => new Response(null, { status: 403 }) }))

import { GET, POST, DELETE } from '@/app/api/itinerary-resources/route'
import { GET as CONFLICTS } from '@/app/api/itinerary-resources/conflicts/route'

const mine = { org_id: 'org-1' }
const theirs = { org_id: 'org-2' }
beforeEach(() => {
  db.inserted = []; db.deleted = []
  db.tables = {
    itineraries: [{ id: 'itn-1', org_id: 'org-1' }, { id: 'itn-9', org_id: 'org-2' }],
    itinerary_resources: [
      { id: 'r1', itinerary_id: 'itn-1', resource_id: 'drv', itinerary: mine },
      { id: 'r9', itinerary_id: 'itn-9', resource_id: 'drv', itinerary: theirs },
    ],
  }
})

describe('the assignments', () => {
  it('lists only the organisation’s, as plain rows', async () => {
    const all = await (await GET(new Request('http://x/api/itinerary-resources') as never)).json()
    expect(all.data.map((r: any) => r.id)).toEqual(['r1'])
    expect(all.data[0]).not.toHaveProperty('itinerary')
    const other = await (await GET(new Request('http://x/api/itinerary-resources?itinerary_id=itn-9') as never)).json()
    expect(other.data).toEqual([])
  })

  it('adds one only to the organisation’s trip', async () => {
    const add = (itinerary_id: string) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify({
      itinerary_id, resource_type: 'guide', resource_id: 'g1', start_date: '2026-10-01',
    }) }) as never)
    expect((await add('itn-9')).status).toBe(404)
    expect(db.inserted).toEqual([])
    expect((await add('itn-1')).status).toBe(200)
    expect(db.inserted).toHaveLength(1)
  })

  it('deletes one only from the organisation’s trip', async () => {
    const del = (id: string) => DELETE(new Request(`http://x/api/itinerary-resources?id=${id}`, { method: 'DELETE' }) as never)
    expect((await del('r9')).status).toBe(404)
    expect(db.deleted).toEqual([])
    expect((await del('r1')).status).toBe(200)
    expect(db.deleted).toEqual(['r1'])
  })
})

describe('double bookings', () => {
  const check = async (id: string) => CONFLICTS(new Request(`http://x/api/itinerary-resources/conflicts?itinerary_id=${id}`) as never)

  it('another organisation’s trip cannot be checked', async () => {
    expect((await check('itn-9')).status).toBe(404)
  })

  it('a clash with another organisation’s trip is reported, without naming it', async () => {
    db.tables.itineraries.push({ id: 'itn-2', org_id: 'org-1' })
    db.tables.resource_conflicts = [
      { resource_id: 'drv', resource_name: 'Ahmed', itinerary_1_id: 'itn-1', itinerary_2_id: 'itn-9', itinerary_2_code: 'THEIRS-9', conflict_start: '2026-10-01', conflict_end: '2026-10-01' },
      { resource_id: 'drv', resource_name: 'Ahmed', itinerary_1_id: 'itn-2', itinerary_1_code: 'OURS-2', itinerary_2_id: 'itn-1', conflict_start: '2026-10-02', conflict_end: '2026-10-02' },
    ]
    const { data } = await (await check('itn-1')).json()
    expect(data.map((c: any) => [c.conflicting_itinerary, c.other_workspace])).toEqual([[null, true], ['OURS-2', false]])
  })
})
