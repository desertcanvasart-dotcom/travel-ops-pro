// Saving a content item (Content Library editor).
//
// CL2: the editor sends a slot for every tier on the ladder, written or not,
// and every slot was stored — so every item "had" every tier and the list
// said "All Tiers". Blank tiers are not stored now, a cleared one is removed,
// and blank rows saved before are not counted.
// CL3: a failed variation write was ignored and the save reported success.
// CL4: the editor read error.message; the API answers { error }.
// CL5: PUT forced is_active true, so a deactivated item came back on at its
// next save.
// CL7: the tier count was "/4" whatever the company's ladder.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { planVariationWrites } from '@/lib/content-library/variations'

const ctx = vi.hoisted(() => ({ failVariationWrites: false }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const db = createMockClient()
    return {
      ...db,
      from: (t: string) => {
        const q = db.from(t)
        if (!(ctx.failVariationWrites && t === 'content_variations')) return q
        const fail = { error: { message: 'permission denied for table content_variations' }, data: null }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const failing: any = { eq: () => failing, in: () => failing, then: (r: (v: unknown) => unknown) => Promise.resolve(fail).then(r) }
        return { ...q, insert: () => failing, update: () => failing, delete: () => failing }
      },
      auth: { getUser: async () => ({ data: { user: { id: 'ua1' } }, error: null }) },
    }
  },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {}, get: () => undefined }) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-a' }))
vi.mock('@/lib/vocabulary-server', () => ({ tierLadderForCurrentOrg: async () => ['budget', 'standard', 'deluxe'] }))

import * as list from '@/app/api/content-library/route'
import * as byId from '@/app/api/content-library/[id]/route'

const req = (method: string, body?: unknown, url = '/x') =>
  new NextRequest(`http://x${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = async (t: string) => ((await createMockClient().from(t).select()) as { data: any[] }).data
const slot = (tier: string, description = '') => ({ tier, title: '', description, highlights: [], inclusions: [], internal_notes: '', is_active: true })

beforeEach(() => {
  ctx.failVariationWrites = false
  setMockTables({
    content_categories: [{ id: 'cat-a', org_id: 'org-a', name: 'Sites', slug: 'sites', is_active: true }],
    content_library: [{ id: 'c-a', org_id: 'org-a', category_id: 'cat-a', name: 'Giza', slug: 'giza', is_active: false }],
    content_variations: [
      { id: 'v-std', content_id: 'c-a', tier: 'standard', description: 'Written' },
      { id: 'v-bud', content_id: 'c-a', tier: 'budget', description: '' }, // saved blank before the fix
    ],
  })
})

describe('planVariationWrites', () => {
  it('updates written saved tiers, inserts written new ones, removes cleared ones, skips blank new ones', () => {
    const plan = planVariationWrites(
      [{ id: 'v1', tier: 'budget' }, { id: 'v2', tier: 'standard' }],
      [slot('budget', '  '), slot('standard', 'kept'), slot('deluxe', 'new'), slot('luxury')],
    )
    expect(plan.remove).toEqual(['v1'])
    expect(plan.update.map(u => u.id)).toEqual(['v2'])
    expect(plan.insert.map(v => v.tier)).toEqual(['deluxe'])
  })
})

describe('POST /api/content-library', () => {
  it('stores only the tiers that were written', async () => {
    const res = await list.POST(req('POST', { category_id: 'cat-a', name: 'Karnak', variations: [slot('budget'), slot('standard', 'Temple text'), slot('deluxe')] }))
    expect(res.status).toBe(201)
    const created = await res.json()
    expect((await table('content_variations')).filter(v => v.content_id === created.id).map(v => v.tier)).toEqual(['standard'])
  })

  it('a taken slug is a 409 that says the slug is taken in the company', async () => {
    const page = readFileSync(join(process.cwd(), 'app/api/content-library/route.ts'), 'utf8')
    expect(page).toContain('Your company already has content with this slug')
    expect(page).not.toContain('in this category')
  })
})

describe('PUT /api/content-library/[id]', () => {
  it('keeps written tiers, removes cleared and blank ones, adds new written ones', async () => {
    const res = await byId.PUT(req('PUT', {
      category_id: 'cat-a', name: 'Giza', slug: 'giza',
      variations: [slot('budget'), slot('standard', 'Rewritten'), slot('deluxe', 'Deluxe text')],
    }), params('c-a'))
    expect(res.status).toBe(200)
    const rows = (await table('content_variations')).filter(v => v.content_id === 'c-a')
    expect(rows.map(v => [v.tier, v.description]).sort()).toEqual([['deluxe', 'Deluxe text'], ['standard', 'Rewritten']])
  })

  it('a save that does not send is_active leaves a deactivated item off; sending it sets it', async () => {
    await byId.PUT(req('PUT', { category_id: 'cat-a', name: 'Giza', slug: 'giza' }), params('c-a'))
    expect((await table('content_library')).find(c => c.id === 'c-a')!.is_active).toBe(false)
    await byId.PUT(req('PUT', { category_id: 'cat-a', name: 'Giza', slug: 'giza', is_active: true }), params('c-a'))
    expect((await table('content_library')).find(c => c.id === 'c-a')!.is_active).toBe(true)
  })

  it('a failed variation write is an error, not a silent success', async () => {
    ctx.failVariationWrites = true
    const res = await byId.PUT(req('PUT', { category_id: 'cat-a', name: 'Giza', slug: 'giza', variations: [slot('deluxe', 'x')] }), params('c-a'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBeTruthy()
  })
})

describe('tier counts', () => {
  it('the list and the item count written tiers only (a blank saved row is missing)', async () => {
    const r = await (await list.GET(req('GET', undefined, '/api/content-library?active_only=false'))).json()
    expect(r.data[0]).toMatchObject({ variation_count: 1, missing_tiers: ['budget', 'deluxe'] })
    // The item route embeds its variations; the mock hands back what the row carries.
    const item = (await table('content_library'))[0]
    item.variations = await table('content_variations')
    const one = await (await byId.GET(req('GET'), params('c-a'))).json()
    expect(one).toMatchObject({ variation_count: 1, missing_tiers: ['budget', 'deluxe'] })
  })

  it('inactive items are listed only when asked for', async () => {
    expect((await (await list.GET(req('GET', undefined, '/api/content-library'))).json()).data).toEqual([])
    const page = readFileSync(join(process.cwd(), 'app/content-library/page.tsx'), 'utf8')
    expect(page).toContain("if (includeInactive) url += 'active_only=false&'")
  })
})

describe('the pages', () => {
  const editor = readFileSync(join(process.cwd(), 'app/content-library/[id]/page.tsx'), 'utf8')
  const listPage = readFileSync(join(process.cwd(), 'app/content-library/page.tsx'), 'utf8')
  it('the editor shows the API’s { error } and has an Active toggle', () => {
    expect(editor).toContain('error.error || t(\'errorSaving\')')
    expect(editor).not.toContain('error.message || t(\'errorSaving\')')
    expect(editor).toMatch(/checked=\{formData\.is_active\}/)
  })
  it('tier counts are out of the company’s ladder, not 4', () => {
    expect(listPage).toContain('total: tierOptions.length')
    expect(editor).toContain('total: tierKeys.length')
    for (const l of ['en', 'ja']) {
      const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), 'utf8'))
      expect(m.contentLibrary.tierCount).toContain('{total}')
      expect(m.contentEditor.tierVariations).toContain('{total}')
    }
  })
})
