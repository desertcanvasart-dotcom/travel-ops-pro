// /api/clients and the routes under it, with two companies' fixtures: what each
// route lists, writes, refuses and counts. Company A is the caller unless a
// test says otherwise; nothing it does may reach company B's clients.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'ua1' as string | null, role: 'admin' as string }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => ctx.userId,
    getCurrentUserRole: async () => ctx.role,
    requireRole: async (allowed: string[]) =>
      ctx.role === 'owner' || allowed.includes(ctx.role)
        ? null
        : NextResponse.json({ success: false, error: 'Forbidden — insufficient role' }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import * as list from '@/app/api/clients/route'
import * as byId from '@/app/api/clients/[id]/route'
import * as stats from '@/app/api/clients/stats/route'
import * as notes from '@/app/api/clients/[id]/notes/route'
import * as noteById from '@/app/api/clients/[id]/notes/[noteId]/route'
import * as comms from '@/app/api/clients/[id]/communications/route'
import * as commById from '@/app/api/clients/[id]/communications/[commId]/route'
import * as timeline from '@/app/api/clients/[id]/timeline/route'
import * as followups from '@/app/api/clients/[id]/followups/route'
import * as trips from '@/app/api/clients/[id]/itineraries/route'

const db = createMockClient()
const table = async (t: string) => (await db.from(t).select('*')).data as Array<Record<string, any>>
const row = async (t: string, id: string) => (await table(t)).find(r => r.id === id)
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) })

const A1 = 'client-a1' // org A, has a trip linked and an email-only trip
const A2 = 'client-a2' // org A, nothing attached
const A3 = 'client-a3' // org A, an invoice
const B1 = 'client-b1' // org B

function seed() {
  setMockTables({
    clients: [
      { id: A1, org_id: 'org-a', client_code: 'CLI-0001', first_name: 'Ana', last_name: 'Silva', email: 'Ana@Example.com', phone: '1', status: 'lead', vip_status: false,
        total_revenue_generated: 100, total_bookings_count: 1, revenue_by_currency: { EUR: 100 }, collected_by_currency: { EUR: 40 }, created_at: '2026-01-01T00:00:00Z', last_contacted_at: null },
      { id: A2, org_id: 'org-a', client_code: 'CLI-0002', first_name: 'Ben', last_name: 'Okafor', email: 'ben@example.com', status: 'customer', vip_status: true,
        total_revenue_generated: 50000, revenue_by_currency: { JPY: 50000, EUR: 10 }, collected_by_currency: {}, created_at: '2026-02-01T00:00:00Z' },
      { id: A3, org_id: 'org-a', client_code: 'CLI-0003', first_name: 'Chi', last_name: 'Wong', email: null, status: 'inactive', vip_status: false,
        revenue_by_currency: {}, collected_by_currency: {}, created_at: '2026-03-01T00:00:00Z' },
      { id: B1, org_id: 'org-b', client_code: 'CLI-0001', first_name: 'Ana', last_name: 'Bravo', email: 'ana@example.com', status: 'prospect', vip_status: false,
        revenue_by_currency: { USD: 999 }, collected_by_currency: { USD: 999 }, created_at: '2026-01-01T00:00:00Z' },
    ],
    itineraries: [
      { id: 'i-a1', org_id: 'org-a', client_id: A1, client_email: null, itinerary_code: 'ITN-1', trip_name: 'Nile', status: 'confirmed', created_at: '2026-04-01', total_cost: 100, currency: 'EUR', margin: 5 },
      { id: 'i-a1-email', org_id: 'org-a', client_id: null, client_email: 'ana@example.com', itinerary_code: 'ITN-2', trip_name: 'Siwa', status: 'draft', created_at: '2026-05-01', total_cost: 50, currency: 'EUR' },
      { id: 'i-b-email', org_id: 'org-b', client_id: null, client_email: 'ana@example.com', itinerary_code: 'ITN-B', trip_name: 'Other co', status: 'draft', created_at: '2026-06-01' },
    ],
    bookings: [{ id: 'bk1', org_id: 'org-a', itinerary_id: 'i-a1' }],
    invoices: [{ id: 'inv1', org_id: 'org-a', client_id: A3 }],
    payments: [{ id: 'pay1', org_id: 'org-a', itinerary_id: 'i-a1-email' }],
    whatsapp_conversations: [],
    email_conversations: [],
    client_documents: [],
    template_send_log: [],
    client_notes: [
      { id: 'n-a1', client_id: A1, content: 'old', note_type: 'general', created_at: '2026-01-02' },
      { id: 'n-b1', client_id: B1, content: 'theirs', note_type: 'general', created_at: '2026-01-02' },
    ],
    communication_history: [
      { id: 'c-a1', client_id: A1, communication_type: 'phone', direction: 'inbound', content: 'hi', status: 'completed', communication_date: '2026-02-01T10:00:00Z' },
      { id: 'c-b1', client_id: B1, communication_type: 'phone', direction: 'inbound', content: 'yo', status: 'completed', communication_date: '2026-02-01T10:00:00Z' },
    ],
    client_followups: [{ id: 'f-a1', client_id: A1, title: 'Call', due_date: '2026-11-01', status: 'pending' }],
    user_profiles: [{ id: 'ua1', full_name: 'Aiko Sato', email: 'aiko@a.example' }, { id: 'ua2', full_name: null, email: 'noname@a.example' }],
  })
}

beforeEach(() => {
  ctx.orgId = 'org-a'; ctx.userId = 'ua1'; ctx.role = 'admin'
  seed()
})

describe('GET /api/clients', () => {
  it("lists only the caller's company, with the fields the screens need and the exact total", async () => {
    const res = await list.GET(req('/api/clients?limit=50'))
    const body = await res.json()
    expect(body.clients.map((c: any) => c.id).sort()).toEqual([A1, A2, A3])
    expect(body.total).toBe(3)
    const ana = body.clients.find((c: any) => c.id === A1)
    expect(ana).toMatchObject({ name: 'Ana Silva', first_name: 'Ana', last_name: 'Silva', client_code: 'CLI-0001', revenue_by_currency: { EUR: 100 }, collected_by_currency: { EUR: 40 } })
  })

  it('filters by status, VIP and search, still inside the company', async () => {
    const ids = async (qs: string) => (await (await list.GET(req(`/api/clients?${qs}`))).json()).clients.map((c: any) => c.id)
    expect(await ids('status=customer')).toEqual([A2])
    expect(await ids('status=lead')).toEqual([A1])
    expect(await ids('vip=1')).toEqual([A2])
    expect(await ids('search=ana')).toEqual([A1]) // B's Ana is another company's
    expect(await ids('status=active')).toHaveLength(3) // not a status: ignored, not "no rows"
  })

  it('pages: page 2 of 2 per page holds the third client', async () => {
    const body = await (await list.GET(req('/api/clients?limit=2&page=2&sort=name'))).json()
    expect(body.clients.map((c: any) => c.id)).toEqual([A3])
    expect(body).toMatchObject({ page: 2, limit: 2 })
  })

  it('answers 403 with no company', async () => {
    ctx.orgId = null
    expect((await list.GET(req('/api/clients'))).status).toBe(403)
  })
})

describe('GET /api/clients/stats', () => {
  it('counts every status, VIPs and the money per currency for the company only', async () => {
    const body = await (await stats.GET()).json()
    expect(body.total).toBe(3)
    expect(body.byStatus).toEqual({ lead: 1, prospect: 0, customer: 1, inactive: 1 })
    expect(body.vip).toBe(1)
    expect(body.invoiced).toEqual({ EUR: 110, JPY: 50000 })
    expect(body.collected).toEqual({ EUR: 40 })
  })
})

describe('POST /api/clients', () => {
  it('creates under the caller\'s company, ignoring an org_id in the body, with blanks as NULL and no invented last name', async () => {
    const res = await list.POST(req('/api/clients', { method: 'POST', body: { first_name: 'Dana', org_id: 'org-b', client_code: 'CLI-7777', email: '', phone: '  ', internal_notes: 'window seat', total_revenue_generated: 1e9 } }))
    expect(res.status).toBe(201)
    const made = (await res.json()).data
    expect(made).toMatchObject({ org_id: 'org-a', first_name: 'Dana', last_name: '', email: null, phone: null, internal_notes: 'window seat', status: 'prospect' })
    expect(made.client_code).not.toBe('CLI-7777')
    expect(made.total_revenue_generated).toBeUndefined()
  })

  it('refuses a second client with the same email in the company, in any capitalisation, and names the first', async () => {
    const res = await list.POST(req('/api/clients', { method: 'POST', body: { first_name: 'Anna', email: ' ANA@example.COM ' } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'duplicate_email', existing: { id: A1, client_code: 'CLI-0001', name: 'Ana Silva' } })
    expect((await table('clients')).filter(c => c.org_id === 'org-a')).toHaveLength(3)
  })

  it('another company holding the address is not a duplicate; "create anyway" goes through', async () => {
    ctx.orgId = 'org-b'
    const own = await list.POST(req('/api/clients', { method: 'POST', body: { first_name: 'Eli', email: 'ben@example.com' } }))
    expect(own.status).toBe(201)
    ctx.orgId = 'org-a'
    const forced = await list.POST(req('/api/clients', { method: 'POST', body: { first_name: 'Anna', email: 'ana@example.com', allow_duplicate: true } }))
    expect(forced.status).toBe(201)
  })

  it('refuses a status the database does not have, and a missing first name', async () => {
    expect((await list.POST(req('/api/clients', { method: 'POST', body: { first_name: 'X', status: 'active' } }))).status).toBe(400)
    expect((await list.POST(req('/api/clients', { method: 'POST', body: { last_name: 'X' } }))).status).toBe(400)
  })

  it('stores a note with its author', async () => {
    const res = await list.POST(req('/api/clients', { method: 'POST', body: { first_name: 'Fay', note: 'asked for a quote' } }))
    expect(res.status).toBe(201)
    const saved = (await table('client_notes')).find(n => n.content === 'asked for a quote')
    expect(saved).toMatchObject({ note_type: 'general', created_by: 'Aiko Sato' })
  })
})

describe('PUT and PATCH /api/clients/[id]', () => {
  it('writes the form columns and nothing the database owns', async () => {
    const res = await byId.PUT(req(`/api/clients/${A1}`, { method: 'PUT', body: {
      first_name: 'Anita', phone: '', client_code: 'HACKED', total_revenue_generated: 1e9, revenue_by_currency: { EUR: 1e9 },
      total_bookings_count: 99, org_id: 'org-b', created_by: 'x',
    } }), p({ id: A1 }))
    expect(res.status).toBe(200)
    expect(await row('clients', A1)).toMatchObject({
      first_name: 'Anita', phone: null, client_code: 'CLI-0001', total_revenue_generated: 100,
      revenue_by_currency: { EUR: 100 }, total_bookings_count: 1, org_id: 'org-a',
    })
    expect((await row('clients', A1))!.created_by).toBeUndefined()
  })

  it('PATCH moves the status among the four, and only those', async () => {
    expect((await byId.PATCH(req(`/api/clients/${A1}`, { method: 'PATCH', body: { status: 'inactive' } }), p({ id: A1 }))).status).toBe(200)
    expect((await row('clients', A1))!.status).toBe('inactive')
    for (const bad of ['active', 'blacklisted', 'vip']) {
      expect((await byId.PATCH(req(`/api/clients/${A1}`, { method: 'PATCH', body: { status: bad } }), p({ id: A1 }))).status, bad).toBe(400)
    }
    expect((await row('clients', A1))!.status).toBe('inactive')
  })

  it('an empty body is refused, and another company\'s client is a 404', async () => {
    expect((await byId.PATCH(req(`/api/clients/${A1}`, { method: 'PATCH', body: { client_code: 'x' } }), p({ id: A1 }))).status).toBe(400)
    expect((await byId.PUT(req(`/api/clients/${B1}`, { method: 'PUT', body: { first_name: 'Hijack' } }), p({ id: B1 }))).status).toBe(404)
    expect((await row('clients', B1))!.first_name).toBe('Ana')
  })
})

describe('DELETE /api/clients/[id]', () => {
  const del = (id: string) => byId.DELETE(req(`/api/clients/${id}`, { method: 'DELETE' }), p({ id }))

  it('is for managers and admins: an agent is refused before anything is read', async () => {
    ctx.role = 'agent'
    expect((await del(A2)).status).toBe(403)
    expect(await row('clients', A2)).toBeTruthy()
  })

  it('deletes a client with nothing attached (a manager, and the owner)', async () => {
    ctx.role = 'manager'
    expect((await del(A2)).status).toBe(200)
    expect(await row('clients', A2)).toBeUndefined()
    ctx.role = 'owner'
    expect((await del(A3)).status).toBe(409) // …the owner clears the role gate, not the invoice on A3
  })

  it('refuses with 409 and the counts when trips, bookings, payments or invoices are attached — nothing is removed', async () => {
    const trip = await del(A1)
    expect(trip.status).toBe(409)
    const body = await trip.json()
    // two trips: one linked, one carrying the same email
    expect(body.counts).toEqual({ trips: 2, bookings: 1, invoices: 0, payments: 1, conversations: 0, documents: 0 })
    expect(body.error).toContain('2 trips')
    expect(body.error).toContain('Mark the client inactive')
    expect((await table('itineraries')).map(i => i.id).sort()).toEqual(['i-a1', 'i-a1-email', 'i-b-email'])
    expect(await row('clients', A1)).toBeTruthy()

    const inv = await del(A3)
    expect(inv.status).toBe(409)
    expect((await inv.json()).counts).toMatchObject({ invoices: 1 })
  })

  it('refuses for conversations and documents too', async () => {
    setMockTables({ ...Object.fromEntries(await Promise.all(['clients', 'itineraries', 'bookings', 'invoices', 'payments', 'template_send_log', 'client_notes'].map(async t => [t, await table(t)]))),
      whatsapp_conversations: [{ id: 'wa1', org_id: 'org-a', client_id: A2 }], email_conversations: [], client_documents: [] })
    const res = await del(A2)
    expect(res.status).toBe(409)
    expect((await res.json()).counts).toMatchObject({ conversations: 1 })
    setMockTables({ clients: await table('clients'), itineraries: [], bookings: [], invoices: [], payments: [], whatsapp_conversations: [], email_conversations: [], template_send_log: [],
      client_documents: [{ id: 'd1', client_id: A2 }] })
    const docs = await del(A2)
    expect(docs.status).toBe(409)
    expect((await docs.json()).counts).toMatchObject({ documents: 1 })
  })

  it('there is no force option any more', async () => {
    const res = await byId.DELETE(req(`/api/clients/${A1}?force=true`, { method: 'DELETE' }), p({ id: A1 }))
    expect(res.status).toBe(409)
    expect((await table('itineraries')).length).toBe(3)
    expect(await row('clients', A1)).toBeTruthy()
  })

  it("another company's client is a 404", async () => {
    expect((await del(B1)).status).toBe(404)
    expect(await row('clients', B1)).toBeTruthy()
  })
})

describe('notes', () => {
  it('stores a note against the company\'s client, with its author', async () => {
    const res = await notes.POST(req(`/api/clients/${A1}/notes`, { method: 'POST', body: { content: ' Likes quiet rooms ', note_type: 'preference', is_important: true, created_by: 'forged' } }), p({ id: A1 }))
    expect(res.status).toBe(201)
    const saved = (await table('client_notes')).find(n => n.content === 'Likes quiet rooms')
    expect(saved).toMatchObject({ client_id: A1, note_type: 'preference', is_important: true, created_by: 'Aiko Sato' })
  })

  it('the author falls back to the email when the profile has no name', async () => {
    ctx.userId = 'ua2'
    await notes.POST(req(`/api/clients/${A1}/notes`, { method: 'POST', body: { content: 'x' } }), p({ id: A1 }))
    expect((await table('client_notes')).find(n => n.content === 'x')!.created_by).toBe('noname@a.example')
  })

  it("will not read, add to, edit or delete another company's client's notes — or another client's note by id", async () => {
    expect((await notes.GET(req(`/api/clients/${B1}/notes`), p({ id: B1 }))).status).toBe(404)
    expect((await notes.POST(req(`/api/clients/${B1}/notes`, { method: 'POST', body: { content: 'x' } }), p({ id: B1 }))).status).toBe(404)
    // a note id from client B through client A's URL
    expect((await noteById.PATCH(req(`/api/clients/${A1}/notes/n-b1`, { method: 'PATCH', body: { content: 'hijack' } }), p({ id: A1, noteId: 'n-b1' }))).status).toBe(404)
    expect((await noteById.DELETE(req(`/api/clients/${A1}/notes/n-b1`, { method: 'DELETE' }), p({ id: A1, noteId: 'n-b1' }))).status).toBe(404)
    expect((await noteById.PATCH(req(`/api/clients/${B1}/notes/n-b1`, { method: 'PATCH', body: { content: 'hijack' } }), p({ id: B1, noteId: 'n-b1' }))).status).toBe(404)
    expect((await row('client_notes', 'n-b1'))!.content).toBe('theirs')
  })

  it('edits and deletes its own', async () => {
    expect((await noteById.PATCH(req(`/api/clients/${A1}/notes/n-a1`, { method: 'PATCH', body: { content: 'new text' } }), p({ id: A1, noteId: 'n-a1' }))).status).toBe(200)
    expect((await row('client_notes', 'n-a1'))!.content).toBe('new text')
    expect((await noteById.DELETE(req(`/api/clients/${A1}/notes/n-a1`, { method: 'DELETE' }), p({ id: A1, noteId: 'n-a1' }))).status).toBe(200)
    expect(await row('client_notes', 'n-a1')).toBeUndefined()
  })

  it('a viewer is refused', async () => {
    ctx.role = 'viewer'
    expect((await notes.GET(req(`/api/clients/${A1}/notes`), p({ id: A1 }))).status).toBe(403)
  })
})

describe('communications', () => {
  const log = (id: string, body: unknown) => comms.POST(req(`/api/clients/${id}/communications`, { method: 'POST', body }), p({ id }))

  it('logs one with who logged it, and the client\'s last contact moves to it', async () => {
    const res = await log(A1, { communication_type: 'phone', direction: 'outbound', content: 'Confirmed dates', communication_date: '2026-10-01T09:00:00.000Z', status: 'completed', handled_by: 'forged' })
    expect(res.status).toBe(201)
    expect((await table('communication_history')).find(c => c.content === 'Confirmed dates')).toMatchObject({ client_id: A1, handled_by: 'Aiko Sato' })
    expect((await row('clients', A1))!.last_contacted_at).toBe('2026-10-01T09:00:00.000Z')
  })

  it('an older one does not pull last contact back; a pending one is not a contact', async () => {
    await log(A1, { content: 'a', communication_date: '2026-10-01T09:00:00.000Z' })
    await log(A1, { content: 'older', communication_date: '2026-09-01T09:00:00.000Z' })
    expect((await row('clients', A1))!.last_contacted_at).toBe('2026-10-01T09:00:00.000Z')
    await log(A2, { content: 'planned', status: 'scheduled', communication_date: '2026-12-01T09:00:00.000Z' })
    expect((await row('clients', A2))!.last_contacted_at).toBeUndefined()
  })

  it("is scoped: another company's client, or another client's entry by id, is a 404", async () => {
    expect((await log(B1, { content: 'x' })).status).toBe(404)
    expect((await comms.GET(req(`/api/clients/${B1}/communications`), p({ id: B1 }))).status).toBe(404)
    expect((await commById.PATCH(req(`/api/clients/${A1}/communications/c-b1`, { method: 'PATCH', body: { content: 'hijack' } }), p({ id: A1, commId: 'c-b1' }))).status).toBe(404)
    expect((await commById.DELETE(req(`/api/clients/${A1}/communications/c-b1`, { method: 'DELETE' }), p({ id: A1, commId: 'c-b1' }))).status).toBe(404)
    expect((await row('communication_history', 'c-b1'))!.content).toBe('yo')
  })

  it('lists with the exact total, and edits and deletes its own', async () => {
    const body = await (await comms.GET(req(`/api/clients/${A1}/communications?limit=20`), p({ id: A1 }))).json()
    expect(body.data.map((c: any) => c.id)).toEqual(['c-a1'])
    expect(body.total).toBe(1)
    expect((await commById.PATCH(req(`/api/clients/${A1}/communications/c-a1`, { method: 'PATCH', body: { content: 'edited' } }), p({ id: A1, commId: 'c-a1' }))).status).toBe(200)
    expect((await row('communication_history', 'c-a1'))!.content).toBe('edited')
    expect((await commById.DELETE(req(`/api/clients/${A1}/communications/c-a1`, { method: 'DELETE' }), p({ id: A1, commId: 'c-a1' }))).status).toBe(200)
  })
})

describe('trips, timeline and follow-ups', () => {
  it('the Bookings tab and the timeline list the same trips: by client_id and by email, in the company, without costs in the timeline', async () => {
    const tab = await (await trips.GET(req(`/api/clients/${A1}/itineraries`), p({ id: A1 }))).json()
    expect(tab.data.map((t: any) => t.id).sort()).toEqual(['i-a1', 'i-a1-email'])

    const tl = await (await timeline.GET(req(`/api/clients/${A1}/timeline`), p({ id: A1 }))).json()
    expect(tl.trips.map((t: any) => t.id).sort()).toEqual(['i-a1', 'i-a1-email'])
    // the columns a client page needs; not margins or other internals
    expect(tl.trips[0].margin).toBeUndefined()
    expect(tl.communications.map((c: any) => c.id)).toEqual(['c-a1'])
    expect(tl.notes.map((n: any) => n.id)).toEqual(['n-a1'])
    expect(tl.followups.map((f: any) => f.id)).toEqual(['f-a1'])
  })

  it("nothing of another company's client comes back", async () => {
    expect((await timeline.GET(req(`/api/clients/${B1}/timeline`), p({ id: B1 }))).status).toBe(404)
    expect((await followups.GET(req(`/api/clients/${B1}/followups`), p({ id: B1 }))).status).toBe(404)
    expect((await trips.GET(req(`/api/clients/${B1}/itineraries`), p({ id: B1 }))).status).toBe(404)
  })

  it('lists a client\'s follow-ups', async () => {
    const body = await (await followups.GET(req(`/api/clients/${A1}/followups`), p({ id: A1 }))).json()
    expect(body.data.map((f: any) => f.id)).toEqual(['f-a1'])
  })
})
