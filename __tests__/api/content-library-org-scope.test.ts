// The content library, its categories, variations, writing rules and prompt
// templates are each company's own (migration 20261208). The routes run on
// the signed-in session, so RLS also applies — but a person in BOTH companies
// passes RLS for either, so every route filters by, and stamps, the ACTIVE
// company itself. These fixtures are two companies' rows behind a mock that
// applies no RLS at all: only the routes' own filters stand between them.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({
  orgId: 'org-a' as string | null,
  userId: 'ua1' as string | null,
  // Set to make the content count for a category delete fail.
  failCount: false,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const db = createMockClient()
    return {
      ...db,
      from: (t: string) => {
        if (ctx.failCount && t === 'content_library') {
          const failing: any = {
            select: () => failing,
            eq: () => failing,
            then: (ok: any, bad: any) => Promise.resolve({ data: null, count: null, error: { message: 'statement timeout' } }).then(ok, bad),
          }
          return failing
        }
        return db.from(t)
      },
      auth: { getUser: async () => ({ data: { user: ctx.userId ? { id: ctx.userId } : null }, error: null }) },
    }
  },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {}, get: () => undefined }) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => ctx.orgId }))
vi.mock('@/lib/vocabulary-server', () => ({ tierLadderForCurrentOrg: async () => ['budget', 'standard', 'deluxe', 'luxury'] }))

import * as list from '@/app/api/content-library/route'
import * as byId from '@/app/api/content-library/[id]/route'
import * as variations from '@/app/api/content-library/[id]/variations/route'
import * as categories from '@/app/api/content-library/categories/route'
import * as rules from '@/app/api/content-library/writing-rules/route'

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const table = async (t: string) => ((await createMockClient().from(t).select()) as { data: any[] }).data

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'ua1'
  ctx.failCount = false
  setMockTables({
    content_categories: [
      { id: 'cat-a', org_id: 'org-a', name: 'Sites', slug: 'sites', is_active: true, sort_order: 1 },
      { id: 'cat-a-empty', org_id: 'org-a', name: 'Empty', slug: 'empty', is_active: true, sort_order: 2 },
      { id: 'cat-b', org_id: 'org-b', name: 'Sites', slug: 'sites', is_active: true, sort_order: 1 },
    ],
    content_library: [
      { id: 'c-a', org_id: 'org-a', category_id: 'cat-a', name: 'Giza (A)', slug: 'giza', is_active: true },
      { id: 'c-b', org_id: 'org-b', category_id: 'cat-b', name: 'Giza (B)', slug: 'giza', is_active: true },
    ],
    content_variations: [
      { id: 'v-a', content_id: 'c-a', tier: 'standard', description: 'A text' },
      { id: 'v-b', content_id: 'c-b', tier: 'standard', description: 'B text' },
    ],
    destinations: [
      { id: 'dest-a', org_id: 'org-a', name: 'Egypt' },
      { id: 'dest-b', org_id: 'org-b', name: 'Egypt' },
    ],
    writing_rules: [
      { id: 'wr-a', org_id: 'org-a', name: 'A rule', category: 'tone', rule_type: 'enforce', description: 'a', is_active: true, priority: 5 },
      { id: 'wr-b', org_id: 'org-b', name: 'B rule', category: 'tone', rule_type: 'enforce', description: 'b', is_active: true, priority: 5 },
    ],
    prompt_templates: [
      { id: 'p-a', org_id: 'org-a', name: 'A email', purpose: 'email', is_default: true, is_active: true, version: 1 },
      { id: 'p-a2', org_id: 'org-a', name: 'A email 2', purpose: 'email', is_default: false, is_active: true, version: 1 },
      { id: 'p-b', org_id: 'org-b', name: 'B email', purpose: 'email', is_default: true, is_active: true, version: 1 },
    ],
  })
})

describe('content items', () => {
  it('lists only the active company’s items', async () => {
    const r = await (await list.GET(req('/api/content-library'))).json()
    expect(r.data.map((c: { id: string }) => c.id)).toEqual(['c-a'])
  })

  it('a person in both companies sees the active one’s only (the switcher decides)', async () => {
    ctx.orgId = 'org-b'
    const r = await (await list.GET(req('/api/content-library'))).json()
    expect(r.data.map((c: { id: string }) => c.id)).toEqual(['c-b'])
  })

  it("another company's item is 404 by id, and cannot be changed or deleted", async () => {
    expect((await byId.GET(req('/x'), params('c-b'))).status).toBe(404)
    expect((await byId.PATCH(req('/x', { method: 'PATCH', body: { name: 'hijacked' } }), params('c-b'))).status).toBe(404)
    expect((await byId.PUT(req('/x', { method: 'PUT', body: { name: 'hijacked' } }), params('c-b'))).status).toBe(404)
    expect((await list.PATCH(req('/x', { method: 'PATCH', body: { id: 'c-b', name: 'hijacked' } }))).status).toBe(404)
    await byId.DELETE(req('/x', { method: 'DELETE' }), params('c-b'))
    await list.DELETE(req('/api/content-library?id=c-b', { method: 'DELETE' }))
    expect((await table('content_library')).find(c => c.id === 'c-b')).toMatchObject({ name: 'Giza (B)' })
  })

  it('a new item is stamped with the company, and only its own category is accepted', async () => {
    const res = await list.POST(req('/x', { method: 'POST', body: { category_id: 'cat-a', name: 'Saqqara', org_id: 'org-b' } }))
    expect(res.status).toBe(201)
    expect((await table('content_library')).find(c => c.name === 'Saqqara')).toMatchObject({ org_id: 'org-a', created_by: 'ua1' })
    expect((await list.POST(req('/x', { method: 'POST', body: { category_id: 'cat-b', name: 'Elsewhere' } }))).status).toBe(404)
    expect((await list.POST(req('/x', { method: 'POST', body: { category_id: 'cat-a', name: 'X', destination_id: 'dest-b' } }))).status).toBe(404)
  })

  it('an edit cannot move an item to another company or file it under their category', async () => {
    const r = await byId.PATCH(req('/x', { method: 'PATCH', body: { org_id: 'org-b', name: 'Renamed' } }), params('c-a'))
    expect(r.status).toBe(200)
    expect((await table('content_library')).find(c => c.id === 'c-a')).toMatchObject({ org_id: 'org-a', name: 'Renamed' })
    expect((await byId.PATCH(req('/x', { method: 'PATCH', body: { category_id: 'cat-b' } }), params('c-a'))).status).toBe(404)
  })
})

describe('variations go through their content item', () => {
  it("another company's item's variations are 404", async () => {
    expect((await variations.GET(req('/x'), params('c-b'))).status).toBe(404)
    expect((await variations.POST(req('/x', { method: 'POST', body: { tier: 'luxury', description: 'x' } }), params('c-b'))).status).toBe(404)
    expect((await variations.DELETE(req('/x?tier=standard', { method: 'DELETE' }), params('c-b'))).status).toBe(404)
  })

  it("a variation id of another company's item, via one's own item, reaches nothing", async () => {
    const r = await variations.PATCH(req('/x', { method: 'PATCH', body: { variation_id: 'v-b', description: 'hijacked' } }), params('c-a'))
    expect(r.status).toBe(404)
    await variations.DELETE(req('/x?variation_id=v-b', { method: 'DELETE' }), params('c-a'))
    expect((await table('content_variations')).find(v => v.id === 'v-b')).toMatchObject({ description: 'B text' })
  })
})

describe('categories', () => {
  it('lists, creates and changes the company’s own', async () => {
    const r = await (await categories.GET(req('/api/content-library/categories'))).json()
    expect(r.map((c: { id: string }) => c.id)).toEqual(['cat-a', 'cat-a-empty'])
    expect((await categories.POST(req('/x', { method: 'POST', body: { name: 'Cruises', org_id: 'org-b' } }))).status).toBe(201)
    expect((await table('content_categories')).find(c => c.name === 'Cruises')).toMatchObject({ org_id: 'org-a' })
    expect((await categories.PATCH(req('/x', { method: 'PATCH', body: { id: 'cat-b', name: 'x' } }))).status).toBe(404)
  })

  it('a category with content is not deleted; another company’s is not deleted', async () => {
    expect((await categories.DELETE(req('/x?id=cat-a', { method: 'DELETE' }))).status).toBe(400)
    await categories.DELETE(req('/x?id=cat-b', { method: 'DELETE' }))
    expect((await table('content_categories')).map(c => c.id).sort()).toEqual(['cat-a', 'cat-a-empty', 'cat-b'])
    expect((await categories.DELETE(req('/x?id=cat-a-empty', { method: 'DELETE' }))).status).toBe(200)
    expect((await table('content_categories')).map(c => c.id).sort()).toEqual(['cat-a', 'cat-b'])
  })

  it('a content count that cannot be read stops the delete (it used to delete — and cascade — anyway)', async () => {
    ctx.failCount = true
    expect((await categories.DELETE(req('/x?id=cat-a', { method: 'DELETE' }))).status).toBe(500)
    expect((await table('content_categories')).map(c => c.id)).toContain('cat-a')
  })
})

describe('writing rules', () => {
  it('lists the company’s own; creates stamped; another company’s is 404', async () => {
    const r = await (await rules.GET(req('/api/content-library/writing-rules'))).json()
    expect(r.map((x: { id: string }) => x.id)).toEqual(['wr-a'])
    const res = await rules.POST(req('/x', { method: 'POST', body: { name: 'New', category: 'tone', rule_type: 'avoid', description: 'd', org_id: 'org-b' } }))
    expect(res.status).toBe(201)
    expect((await table('writing_rules')).find(x => x.name === 'New')).toMatchObject({ org_id: 'org-a', created_by: 'ua1' })
    expect((await rules.PATCH(req('/x', { method: 'PATCH', body: { id: 'wr-b', priority: 1 } }))).status).toBe(404)
    await rules.DELETE(req('/x?id=wr-b', { method: 'DELETE' }))
    expect((await table('writing_rules')).map(x => x.id)).toContain('wr-b')
  })
})

// The prompt templates screen and its API are gone (CL6): nothing linked to
// the screen and the itinerary generator never read prompt_templates. The
// table and its rows stay (per company since 20261208).
describe('prompt templates', () => {
  it('have no screen and no API any more', () => {
    for (const f of ['app/content-library/prompts/page.tsx', 'app/api/content-library/prompts/route.ts']) {
      expect(existsSync(join(process.cwd(), f)), f).toBe(false)
    }
  })
})

describe('no session, no company', () => {
  it('401 without a session, 403 without a company', async () => {
    ctx.userId = null
    expect((await list.GET(req('/api/content-library'))).status).toBe(401)
    ctx.userId = 'ua1'
    ctx.orgId = null
    expect((await rules.GET(req('/api/content-library/writing-rules'))).status).toBe(403)
  })
})
