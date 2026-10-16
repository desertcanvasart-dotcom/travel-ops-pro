// People audit — Partners, Team Members, Departments (in-memory Supabase mock).
//
// Partners: POST/PUT take only the allowlisted columns with margin and
// commission in 0-100 and never store a blank code; a code is unique within a
// company (409 naming it) and generated codes avoid the taken ones; PUT/DELETE
// are manager-and-above in the route itself; DELETE is refused (409, counts)
// while quotes, trips or bookings use the partner.
// Team Members: the login is linked by email within the SAME company; a
// duplicate email is a 409; the role is one of the page's; deactivating
// unassigns WhatsApp and email conversations.
// Departments: managers write; a duplicate name is a 409; delete counts only
// active members.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { roleAllows } from '@/lib/auth/roles'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, role: 'manager' as string | null }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => 'u-1',
    getCurrentUserRole: async () => ctx.role,
    requireRole: async (allowed: string[]) =>
      roleAllows(ctx.role as never, allowed)
        ? null
        : NextResponse.json({ success: false, error: 'Forbidden — insufficient role' }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import * as partners from '@/app/api/b2b/partners/route'
import * as partnerById from '@/app/api/b2b/partners/[id]/route'
import * as teamMembers from '@/app/api/team-members/route'
import * as teamMemberById from '@/app/api/team-members/[id]/route'
import * as departments from '@/app/api/departments/route'
import * as departmentById from '@/app/api/departments/[id]/route'
import * as generateTasks from '@/app/api/itineraries/[id]/generate-tasks/route'

const A = 'org-a'
const B = 'org-b'
type Row = Record<string, unknown>
const rows = async (t: string) => ((await (createMockClient().from(t) as any).select('*')).data as Row[])
const json = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(new URL(url, 'http://localhost'), {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } } : {}),
  })
const ids = (id: string) => ({ params: Promise.resolve({ id }) })
const call = async (res: Response | Promise<Response>) => {
  const r = await res
  return { status: r.status, json: await r.json() }
}

beforeEach(() => {
  ctx.orgId = A
  ctx.role = 'manager'
  setMockTables({
    b2b_partners: [
      { id: 'p-a1', org_id: A, partner_code: 'ABC-123', company_name: 'Alpha Travel', default_margin_percent: 20, commission_percent: null, is_active: true, country: 'Japan' },
      { id: 'p-a2', org_id: A, partner_code: 'XYZ-001', company_name: 'Xyz Tours', default_margin_percent: 0, commission_percent: 10, is_active: false, country: 'Japan' },
      { id: 'p-b1', org_id: B, partner_code: 'ABC-123', company_name: 'Other Co Partner', default_margin_percent: 30, is_active: true },
    ],
    tour_quotes: [], itineraries: [], bookings: [],
    team_members: [
      { id: 'tm-a1', org_id: A, name: 'Aiko', email: 'Aiko@Example.com', role: 'sales', is_active: true, is_available: true, user_id: null },
      { id: 'tm-a2', org_id: A, name: 'Old Hand', email: 'old@example.com', role: 'staff', is_active: false, is_available: false, user_id: null },
      { id: 'tm-b1', org_id: B, name: 'Bea', email: 'bea@example.com', role: 'staff', is_active: true, user_id: null },
    ],
    organization_members: [
      { org_id: A, user_id: 'login-a1' },
      { org_id: B, user_id: 'login-b1' },
    ],
    user_profiles: [
      { id: 'login-a1', email: 'Carla@Example.com' },
      { id: 'login-b1', email: 'bea.login@example.com' },
    ],
    whatsapp_conversations: [
      { id: 'wc-1', org_id: A, assigned_team_member_id: 'tm-a1', assigned_agent_id: 'tm-a1', assigned_at: 'x' },
    ],
    email_conversations: [
      { id: 'ec-1', org_id: A, assigned_team_member_id: 'tm-a1', assigned_at: 'x' },
    ],
    departments: [
      { id: 'd-a1', org_id: A, name: 'Reservation', description: null, service_types: ['hotel'], is_active: true },
      { id: 'd-a2', org_id: A, name: 'Aviation', description: null, service_types: [], is_active: true },
      { id: 'd-b1', org_id: B, name: 'Operations', description: null, service_types: [], is_active: true },
    ],
  } as never)
})

describe('POST /api/b2b/partners', () => {
  it('stores only the allowlisted columns, stamped with the caller org', async () => {
    const r = await call(partners.POST(json({
      company_name: '  Nile Travel ', org_id: B, id: 'forced', created_by: 'x', credit_limit: 5, currency: 'USD',
      default_margin_percent: '15', commission_percent: 8,
    })))
    expect(r.status).toBe(201)
    const row = (await rows('b2b_partners')).find(p => p.company_name === 'Nile Travel')!
    expect(row.org_id).toBe(A)
    expect(row.id).not.toBe('forced')
    expect(row).not.toHaveProperty('created_by')
    expect(row).not.toHaveProperty('credit_limit')
    expect(row).not.toHaveProperty('currency')
    expect(row.default_margin_percent).toBe(15)
    expect(row.commission_percent).toBe(8)
    expect(row.partner_code).toMatch(/^NIL-\d{3}$/)
  })

  it.each([
    ['margin over 100', { default_margin_percent: 150 }],
    ['negative margin', { default_margin_percent: -1 }],
    ['commission over 100', { commission_percent: 101 }],
    ['margin that is not a number', { default_margin_percent: 'lots' }],
    ['is_active as text', { is_active: 'yes' }],
  ])('refuses %s with 400 and stores nothing', async (_l, over) => {
    const before = (await rows('b2b_partners')).length
    const r = await call(partners.POST(json({ company_name: 'New Co', ...over })))
    expect(r.status).toBe(400)
    expect((await rows('b2b_partners')).length).toBe(before)
  })

  it('a blank margin is "none" (null), not 0', async () => {
    await partners.POST(json({ company_name: 'Blank Margin', default_margin_percent: '', commission_percent: null }))
    const row = (await rows('b2b_partners')).find(p => p.company_name === 'Blank Margin')!
    expect(row.default_margin_percent).toBeNull()
  })

  it("a code the company already uses is a 409 naming it, in any case; the other company's same code does not block", async () => {
    const taken = await call(partners.POST(json({ company_name: 'Dup', partner_code: 'abc-123' })))
    expect(taken.status).toBe(409)
    expect(taken.json.error).toContain('abc-123')
    // ABC-123 exists in org-b as well; org-a using a free code is fine, and so is org-b's own.
    const free = await call(partners.POST(json({ company_name: 'Free', partner_code: 'FREE-1' })))
    expect(free.status).toBe(201)
    ctx.orgId = B
    const sameAsA = await call(partners.POST(json({ company_name: 'B Dup', partner_code: 'XYZ-001' })))
    expect(sameAsA.status).toBe(201)
  })

  it('a blank code is generated and never stored empty', async () => {
    const r = await call(partners.POST(json({ company_name: 'Karnak Tours', partner_code: '   ' })))
    expect(r.status).toBe(201)
    expect(r.json.data.partner_code).toMatch(/^KAR-\d{3}$/)
  })
})

describe('GET /api/b2b/partners', () => {
  it('counts every partner of the company whatever the list is filtered to', async () => {
    const r = await call(partners.GET(req('/api/b2b/partners?active_only=true')))
    expect(r.json.data.map((p: Row) => p.id)).toEqual(['p-a1'])
    // Total 2 vs Active 1; avg over partners with a margin set (p-a2 has 0).
    expect(r.json.counts).toEqual({ total: 2, active: 1, countries: 1, avg_margin: 20 })
  })
})

describe('PUT /api/b2b/partners/[id]', () => {
  const put = (id: string, body: unknown) => call(partnerById.PUT(json(body), ids(id)))

  it('is manager-and-above in the route itself', async () => {
    ctx.role = 'agent'
    expect((await put('p-a1', { is_active: false })).status).toBe(403)
    ctx.role = 'viewer'
    expect((await put('p-a1', { is_active: false })).status).toBe(403)
    expect((await rows('b2b_partners')).find(p => p.id === 'p-a1')!.is_active).toBe(true)
    ctx.role = 'manager'
    expect((await put('p-a1', { is_active: false })).status).toBe(200)
  })

  it('refuses a margin of 150 and keeps the stored one', async () => {
    expect((await put('p-a1', { default_margin_percent: 150 })).status).toBe(400)
    expect((await rows('b2b_partners')).find(p => p.id === 'p-a1')!.default_margin_percent).toBe(20)
  })

  it('a blank partner_code keeps the old code; commission is saved', async () => {
    const r = await put('p-a1', { partner_code: '', commission_percent: 12.5, company_name: 'Alpha Travel Ltd' })
    expect(r.status).toBe(200)
    const row = (await rows('b2b_partners')).find(p => p.id === 'p-a1')!
    expect(row.partner_code).toBe('ABC-123')
    expect(row.commission_percent).toBe(12.5)
    expect(row.company_name).toBe('Alpha Travel Ltd')
  })

  it("another partner's code in the same company is a 409; unknown columns are not written", async () => {
    const clash = await put('p-a1', { partner_code: 'xyz-001' })
    expect(clash.status).toBe(409)
    expect(clash.json.error).toContain('xyz-001')
    await put('p-a1', { org_id: B, created_by: 'x', pricing_model: 'fixed', notes: 'ok' })
    const row = (await rows('b2b_partners')).find(p => p.id === 'p-a1')!
    expect(row.org_id).toBe(A)
    expect(row).not.toHaveProperty('created_by')
    expect(row).not.toHaveProperty('pricing_model')
    expect(row.notes).toBe('ok')
  })

  it("is a 404 for another company's partner", async () => {
    expect((await put('p-b1', { notes: 'x' })).status).toBe(404)
  })
})

describe('DELETE /api/b2b/partners/[id]', () => {
  const del = (id: string) => call(partnerById.DELETE(req('/x', { method: 'DELETE' }), ids(id)))

  it('is manager-and-above in the route itself', async () => {
    ctx.role = 'agent'
    expect((await del('p-a1')).status).toBe(403)
    expect((await rows('b2b_partners')).some(p => p.id === 'p-a1')).toBe(true)
  })

  it('is refused with counts while a trip, a quote or a booking uses the partner, and the trip keeps its partner', async () => {
    setMockTables({
      b2b_partners: [{ id: 'p-a1', org_id: A, company_name: 'Alpha Travel', partner_code: 'A-1' }],
      itineraries: [{ id: 'i-1', org_id: A, partner_id: 'p-a1' }],
      bookings: [{ id: 'bk-1', org_id: A, partner_id: 'p-a1' }, { id: 'bk-2', org_id: A, partner_id: 'p-a1' }],
      tour_quotes: [{ id: 'q-1', org_id: A, partner_id: 'p-a1' }],
    } as never)
    const r = await del('p-a1')
    expect(r.status).toBe(409)
    expect(r.json.counts).toEqual({ quotes: 1, trips: 1, bookings: 2 })
    expect(r.json.error).toContain('Deactivate')
    expect((await rows('b2b_partners')).length).toBe(1)
    expect((await rows('itineraries'))[0].partner_id).toBe('p-a1')
  })

  it('deletes an unused partner, and only in its own company', async () => {
    expect((await del('p-b1')).status).toBe(404)
    expect((await del('p-a1')).status).toBe(200)
    expect((await rows('b2b_partners')).map(p => p.id).sort()).toEqual(['p-a2', 'p-b1'])
  })
})

describe('inactive partners on new records', () => {
  it('quotes, quote-from-itinerary and the Pricing Grid save refuse an inactive partner; existing records are not re-checked', () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
    for (const f of ['app/api/b2b/quotes/route.ts', 'app/api/b2b/quote-from-itinerary/route.ts', 'app/api/pricing-grid/save/route.ts']) {
      expect(read(f), f).toMatch(/partnerIsInactive\(/)
      expect(read(f), f).toMatch(/inactivePartnerResponse\(\)/)
    }
    // A trip that already has the partner keeps re-saving.
    expect(read('app/api/pricing-grid/save/route.ts')).toMatch(/partnerId !== currentPartnerId/)
    // Revert, convert and the price calculator are not new records: untouched.
    expect(read('app/api/b2b/quotes/[id]/revisions/revert/route.ts')).not.toMatch(/partnerIsInactive/)
    expect(read('app/api/b2b/quotes/[id]/convert/route.ts')).not.toMatch(/partnerIsInactive/)
  })
})

describe('POST /api/team-members', () => {
  const post = (body: unknown) => call(teamMembers.POST(json(body)))

  it("links the login of the SAME company whose email matches (any case), never another company's", async () => {
    const mine = await post({ name: 'Carla', email: 'carla@example.COM', user_id: 'login-b1' })
    expect(mine.status).toBe(200)
    expect(mine.json.data.user_id).toBe('login-a1')

    ctx.orgId = A
    const theirs = await post({ name: 'Imposter', email: 'bea.login@example.com' })
    expect(theirs.json.data.user_id).toBeNull()
  })

  it('a body user_id is never taken', async () => {
    const r = await post({ name: 'No Email', user_id: 'login-a1' })
    expect(r.json.data.user_id).toBeNull()
  })

  it('a duplicate email in the company is a 409 (any case, inactive members too); another company may reuse it', async () => {
    expect((await post({ name: 'Dup', email: 'AIKO@example.com' })).status).toBe(409)
    expect((await post({ name: 'Dup2', email: 'old@example.com' })).status).toBe(409)
    ctx.orgId = B
    expect((await post({ name: 'Other co', email: 'aiko@example.com' })).status).toBe(200)
  })

  it('refuses a role the page does not offer', async () => {
    const r = await post({ name: 'X', role: 'wizard' })
    expect(r.status).toBe(400)
    expect(r.json.error).toContain('Role must be one of')
    expect((await post({ name: 'Y', role: 'driver' })).status).toBe(200)
  })

  it('does not link a login that already belongs to another member', async () => {
    await post({ name: 'First', email: 'carla@example.com' })
    const second = await post({ name: 'Second', email: 'carla@example.com' })
    // 409 on the duplicate address, so nothing is linked twice.
    expect(second.status).toBe(409)
  })
})

describe('PUT /api/team-members/[id]', () => {
  const put = (id: string, body: unknown) => call(teamMemberById.PUT(json(body), ids(id)))

  it('relinks when the email changes, and clears the link when it no longer matches a login', async () => {
    const linked = await put('tm-a1', { email: 'carla@example.com' })
    expect(linked.json.data.user_id).toBe('login-a1')
    const moved = await put('tm-a1', { email: 'someone.else@example.com' })
    expect(moved.json.data.user_id).toBeNull()
  })

  it('links an existing unlinked member whose unchanged email already is a login', async () => {
    ;(await rows('team_members')).find(m => m.id === 'tm-a1')!.email = 'carla@example.com'
    const r = await put('tm-a1', { email: 'carla@example.com', notes: 'hi' })
    expect(r.json.data.user_id).toBe('login-a1')
  })

  it('a duplicate email is a 409, a bad role or is_active is a 400, and reactivating needs no email', async () => {
    expect((await put('tm-a1', { email: 'OLD@example.com' })).status).toBe(409)
    expect((await put('tm-a1', { role: 'wizard' })).status).toBe(400)
    expect((await put('tm-a1', { is_active: 'no' })).status).toBe(400)
    expect((await put('tm-a2', { is_active: true })).status).toBe(200)
  })

  it('is a 404 for another company', async () => {
    expect((await put('tm-b1', { notes: 'x' })).status).toBe(404)
  })

  it('deactivating through PUT is the same as DELETE', async () => {
    await put('tm-a1', { is_active: false })
    expect((await rows('whatsapp_conversations'))[0].assigned_team_member_id).toBeNull()
  })
})

describe('DELETE /api/team-members/[id] (deactivate)', () => {
  it("clears availability and unassigns the member's WhatsApp and email conversations; trips and tasks are untouched", async () => {
    setMockTables({
      ...Object.fromEntries(await Promise.all(['team_members', 'whatsapp_conversations', 'email_conversations'].map(async t => [t, await rows(t)]))),
      itineraries: [{ id: 'i-1', org_id: A, assigned_to: 'tm-a1' }],
      tasks: [{ id: 't-1', org_id: A, assigned_to: 'tm-a1' }],
    } as never)
    const r = await call(teamMemberById.DELETE(req('/x', { method: 'DELETE' }), ids('tm-a1')))
    expect(r.status).toBe(200)
    const m = (await rows('team_members')).find(x => x.id === 'tm-a1')!
    expect(m.is_active).toBe(false)
    expect(m.is_available).toBe(false)
    expect((await rows('whatsapp_conversations'))[0]).toMatchObject({ assigned_team_member_id: null, assigned_agent_id: null })
    expect((await rows('email_conversations'))[0].assigned_team_member_id).toBeNull()
    expect((await rows('itineraries'))[0].assigned_to).toBe('tm-a1')
    expect((await rows('tasks'))[0].assigned_to).toBe('tm-a1')
  })

  it('does not touch another company', async () => {
    expect((await call(teamMemberById.DELETE(req('/x', { method: 'DELETE' }), ids('tm-b1')))).status).toBe(404)
    expect((await rows('team_members')).find(x => x.id === 'tm-b1')!.is_active).toBe(true)
  })
})

describe('departments', () => {
  it('a manager creates, edits and deletes; an agent is refused', async () => {
    ctx.role = 'manager'
    expect((await call(departments.POST(json({ name: 'Accounting' })))).status).toBe(201)
    expect((await call(departmentById.PUT(json({ description: 'books' }), ids('d-a2')))).status).toBe(200)
    expect((await call(departmentById.DELETE(req('/x?reassign_to=none', { method: 'DELETE' }), ids('d-a2')))).status).toBe(200)
    ctx.role = 'agent'
    expect((await call(departments.POST(json({ name: 'Nope' })))).status).toBe(403)
    expect((await call(departmentById.PUT(json({ description: 'x' }), ids('d-a1')))).status).toBe(403)
    expect((await call(departmentById.DELETE(req('/x', { method: 'DELETE' }), ids('d-a1')))).status).toBe(403)
  })

  it('the Create form takes service types', async () => {
    const r = await call(departments.POST(json({ name: 'Accounting', service_types: ['Invoice', 'payment'] })))
    expect(r.json.data.service_types).toEqual(['invoice', 'payment'])
  })

  it('a duplicate name (any case, own company) is a 409 on create and rename; another company may reuse it', async () => {
    const dup = await call(departments.POST(json({ name: ' reservation ' })))
    expect(dup.status).toBe(409)
    expect(dup.json.error).toMatch(/already exists/)
    expect((await call(departmentById.PUT(json({ name: 'RESERVATION' }), ids('d-a2')))).status).toBe(409)
    expect((await call(departmentById.PUT(json({ name: 'Reservation' }), ids('d-a1')))).status).toBe(200)
    ctx.orgId = B
    expect((await call(departments.POST(json({ name: 'Reservation' })))).status).toBe(201)
  })

  it('delete counts active members only: a department of deactivated people needs no target', async () => {
    setMockTables({
      departments: [{ id: 'd-1', org_id: A, name: 'Gone', service_types: [], is_active: true }],
      team_members: [{ id: 'm-1', org_id: A, name: 'Ex', department_id: 'd-1', is_active: false }],
      tasks: [],
    } as never)
    const r = await call(departmentById.DELETE(req('/x', { method: 'DELETE' }), ids('d-1')))
    expect(r.status).toBe(200)
    expect((await rows('team_members'))[0].department_id).toBeNull()

    setMockTables({
      departments: [{ id: 'd-1', org_id: A, name: 'Busy', service_types: [], is_active: true }],
      team_members: [{ id: 'm-1', org_id: A, name: 'Here', department_id: 'd-1', is_active: true }],
      tasks: [],
    } as never)
    expect((await call(departmentById.DELETE(req('/x', { method: 'DELETE' }), ids('d-1')))).status).toBe(409)
  })
})

describe('generate-tasks', () => {
  it('refuses a deactivated assignee, as POST /api/tasks does', async () => {
    const r = await call(generateTasks.POST(
      req('/api/itineraries/i-1/generate-tasks', { method: 'POST', body: { assignments: { 'd-a1': 'tm-a2' }, dry_run: true } }),
      ids('i-1'),
    ))
    expect(r.status).toBe(400)
    expect(r.json.error).toMatch(/no longer active/)
  })
})
