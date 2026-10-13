// Tours belong to one company (migration 20261207). Two companies' templates,
// variations and legacy tours side by side in the mock database — both may
// hold the same codes; every path below must read, change and delete only the
// caller's company's, stamp what it writes with it, and price each company's
// templates with that company's own rates.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, role: 'manager' as string, failDeleteOn: null as string | null }))
const priced = vi.hoisted(() => [] as Array<{ template: string; org: string | undefined }>)

// A client whose delete on one table fails — the partial-delete case.
function client() {
  const db = createMockClient()
  return {
    ...db,
    from: (table: string) => {
      const q = db.from(table)
      if (ctx.failDeleteOn !== table) return q
      return { ...q, delete: () => ({ in: async () => ({ error: { message: `${table} is locked` } }), eq: async () => ({ error: { message: `${table} is locked` } }) }) }
    },
  }
}

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => client(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => client(), supabaseServer: createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  const { roleAllows } = await import('@/lib/auth/roles')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => ctx.role,
    requireRole: async (allowed: string[]) =>
      roleAllows(ctx.role, allowed) ? null : NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/auth/org-auth', async () => ({
  orgAuth: async () => ({ supabase: client(), org_id: ctx.orgId, user: { id: 'u1' }, error: null, status: 200 }),
}))
vi.mock('@/lib/vocabulary-server', () => ({
  tierLadderForCurrentOrg: vi.fn(async () => ['standard']),
  tierLadderForOrg: vi.fn(async () => ['standard']),
  activeKeysForOrg: vi.fn(async () => []),
  vocabularyItemsForCurrentOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/tours/cached-price', () => ({
  loadCachedPriceSettings: async (_db: unknown, orgId: string | null) => ({ orgId: orgId ?? undefined }),
  refreshTemplateCachedPrice: async (_db: unknown, template: { id: string }, c: { pricingOptions: { orgId?: string } }) => {
    priced.push({ template: template.id, org: c.pricingOptions.orgId })
    return { price: 100, tier: 'standard' }
  },
}))

import { GET as listTemplates, POST as createTemplate } from '@/app/api/tours/templates/route'
import { GET as getTemplate, PUT as putTemplate, DELETE as deleteTemplate } from '@/app/api/tours/templates/[id]/route'
import { GET as tourDetail } from '@/app/api/tours/[code]/route'
import { POST as bulkImport } from '@/app/api/tours/bulk/import/route'
import { GET as bulkExport } from '@/app/api/tours/bulk/export/route'
import { POST as createVariations } from '@/app/api/tours/variations/route'
import { GET as getVariation } from '@/app/api/tours/variations/[id]/route'
import { GET as listServices, POST as addService } from '@/app/api/tours/variations/[id]/services/route'
import { POST as recalc } from '@/app/api/tours/recalculate-prices/route'
import { POST as createDeparture } from '@/app/api/departures/route'
import { POST as saveTour } from '@/app/api/tours/save/route'
import { GET as getDay } from '@/app/api/tours/days/[id]/route'
import { GET as templateDays, POST as addActivity, PATCH as patchActivity } from '@/app/api/tours/templates/[id]/days/route'
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'
import { matchTourTemplate } from '@/lib/tour-matcher-service'

const json = (body: unknown, url = 'http://localhost/api/x') =>
  ({ json: async () => body, url, headers: new Headers(), nextUrl: new URL(url) }) as unknown as NextRequest
const get = (url: string) => ({ url, headers: new Headers(), nextUrl: new URL(url), json: async () => ({}) }) as unknown as NextRequest
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })
const rows = async (table: string) => ((await createMockClient().from(table).select('*')) as unknown as { data: Array<Record<string, any>> }).data

function twoCompanies() {
  setMockTables({
    tour_templates: [
      { id: 'tpl-a', org_id: 'org-a', template_code: 'CAI-3D', template_name: 'Cairo (A)', tour_type: 'multi_day', duration_days: 3, is_active: true, created_at: '2026-01-02', itinerary: [], theme_key: null },
      { id: 'tpl-b', org_id: 'org-b', template_code: 'CAI-3D', template_name: 'Cairo (B)', tour_type: 'multi_day', duration_days: 3, is_active: true, created_at: '2026-01-01', itinerary: [], theme_key: null },
    ],
    tour_variations: [
      { id: 'var-a', org_id: 'org-a', template_id: 'tpl-a', variation_code: 'CAI-3D-STANDARD', variation_name: 'Std A', tier: 'standard', is_active: true,
        tour_templates: { id: 'tpl-a', template_code: 'CAI-3D', template_name: 'Cairo (A)', theme_key: null, itinerary: [] } },
      { id: 'var-b', org_id: 'org-b', template_id: 'tpl-b', variation_code: 'CAI-3D-STANDARD', variation_name: 'Std B', tier: 'standard', is_active: true,
        tour_templates: { id: 'tpl-b', template_code: 'CAI-3D', template_name: 'Cairo (B)', theme_key: null, itinerary: [] } },
    ],
    tour_template_versions: [
      { id: 'tv-a', template_id: 'tpl-a', language: 'en', template_name: 'Cairo (A)' },
      { id: 'tv-b', template_id: 'tpl-b', language: 'en', template_name: 'Cairo (B)' },
    ],
    tour_variation_services: [
      { id: 'svc-a', variation_id: 'var-a', service_name: 'Hotel A', sequence_order: 1 },
      { id: 'svc-b', variation_id: 'var-b', service_name: 'Hotel B', sequence_order: 1 },
    ],
    variation_daily_itinerary: [],
    variation_services: [],
    tour_day_activities: [
      // An activity pointing at another company's item. The route reads the
      // content with its own query (no FK to embed through) and must not
      // return it — nor this stale copy on the row.
      { id: 'act-a', template_id: 'tpl-a', day_number: 1, sequence_order: 1, content_id: 'content-b', activity_type: 'attraction', activity_name: 'Pyramids',
        content_library: { id: 'content-b', org_id: 'org-b', name: 'B secret write-up' } },
    ],
    content_library: [
      { id: 'content-a', org_id: 'org-a', name: 'Giza (A)', location: 'Giza', duration: '3h' },
      { id: 'content-b', org_id: 'org-b', name: 'Giza (B)', location: 'Giza', duration: '3h' },
    ],
    tour_quotes: [],
    accommodation_rates: [
      { id: 'rate-a', org_id: 'org-a', service_code: 'HTL-1' },
      { id: 'rate-b', org_id: 'org-b', service_code: 'HTL-1' },
    ],
    meal_rates: [], guide_rates: [],
    tours: [
      { id: 'tour-a', org_id: 'org-a', tour_code: 'LEG-1' },
      { id: 'tour-b', org_id: 'org-b', tour_code: 'LEG-1' },
    ],
    tour_days: [
      { id: 'day-a', tour_id: 'tour-a', day_number: 1, city: 'Cairo' },
      { id: 'day-b', tour_id: 'tour-b', day_number: 1, city: 'Cairo' },
    ],
    tour_departures: [],
    organizations: [{ id: 'org-a', created_at: '2025-01-01' }, { id: 'org-b', created_at: '2026-01-01' }],
    org_vocabularies: [],
  } as never)
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.role = 'manager'
  ctx.failDeleteOn = null
  priced.length = 0
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  twoCompanies()
})

describe('templates: list, read, change, delete — one company', () => {
  it("lists only the caller's company's templates (full and slim), with only their variations", async () => {
    const full = await (await listTemplates(get('http://localhost/api/tours/templates'))).json()
    expect(full.data.map((t: any) => t.id)).toEqual(['tpl-a'])
    expect(full.data[0].variations.map((v: any) => v.id)).toEqual(['var-a'])
    const slim = await (await listTemplates(get('http://localhost/api/tours/templates?slim=1'))).json()
    expect(slim.data.map((t: any) => t.id)).toEqual(['tpl-a'])
  })

  it("another company's template is not found — read, change or delete", async () => {
    expect((await getTemplate(get('http://localhost/x'), idParams('tpl-b'))).status).toBe(404)
    expect((await putTemplate(json({ template_name: 'Hijacked' }), idParams('tpl-b'))).status).toBe(404)
    expect((await deleteTemplate(get('http://localhost/x'), idParams('tpl-b'))).status).toBe(404)
    const b = (await rows('tour_templates')).find(t => t.id === 'tpl-b')
    expect(b?.template_name).toBe('Cairo (B)')
    expect((await rows('tour_variations')).map(v => v.id)).toContain('var-b')
  })

  it('deleting is manager-and-above; a manager deletes their own template and its variations', async () => {
    ctx.role = 'agent'
    expect((await deleteTemplate(get('http://localhost/x'), idParams('tpl-a'))).status).toBe(403)
    ctx.role = 'manager'
    const res = await deleteTemplate(get('http://localhost/x'), idParams('tpl-a'))
    expect(res.status).toBe(200)
    expect((await rows('tour_templates')).map(t => t.id)).toEqual(['tpl-b'])
    expect((await rows('tour_variations')).map(v => v.id)).toEqual(['var-b'])
    expect((await rows('tour_variation_services')).map(s => s.id)).toEqual(['svc-b'])
  })

  it('a step that fails stops the delete and is reported, not answered 200', async () => {
    ctx.failDeleteOn = 'variation_daily_itinerary'
    const res = await deleteTemplate(get('http://localhost/x'), idParams('tpl-a'))
    expect(res.status).toBe(500)
    expect((await res.json()).step).toBe('variation daily itinerary')
    expect((await rows('tour_templates')).map(t => t.id)).toContain('tpl-a')
  })

  it('a new template is stamped with the caller\'s company', async () => {
    const res = await createTemplate(json({ template_name: 'Luxor day', tour_type: 'day_tour', template_code: 'CAI-3D' }))
    expect(res.status).toBe(201)
    const made = (await rows('tour_templates')).find(t => t.template_name === 'Luxor day')
    expect(made?.org_id).toBe('org-a')
    expect(made).not.toHaveProperty('category_id')
  })
})

describe('the same code in both companies', () => {
  it("the tour detail by code is the caller's company's programme", async () => {
    const a = await (await tourDetail(get('http://localhost/x'), { params: Promise.resolve({ code: 'CAI-3D-STANDARD' }) } as never)).json()
    expect(a.data.variation_id).toBe('var-a')
    ctx.orgId = 'org-b'
    const b = await (await tourDetail(get('http://localhost/x'), { params: Promise.resolve({ code: 'CAI-3D' }) } as never)).json()
    expect(b.data.template_id).toBe('tpl-b')
  })

  it("a bulk import updates only the caller's company's template with that code, and creates in the caller's company", async () => {
    const csvData = 'template_code,template_name,tour_type,duration_days\nCAI-3D,Cairo renamed,multi_day,3\nNEW-1,Brand new,day_tour,1\n'
    const res = await bulkImport(json({ csvData }))
    const body = await res.json()
    expect(body).toMatchObject({ success: true, created: 1, updated: 1 })
    const all = await rows('tour_templates')
    expect(all.find(t => t.id === 'tpl-a')?.template_name).toBe('Cairo renamed')
    expect(all.find(t => t.id === 'tpl-b')?.template_name).toBe('Cairo (B)')
    expect(all.find(t => t.template_code === 'NEW-1')?.org_id).toBe('org-a')
  })

  it("the export is the caller's company's sheet", async () => {
    const res = await bulkExport()
    const text = await res.text()
    expect(text).toContain('Cairo (A)')
    expect(text).not.toContain('Cairo (B)')
  })
})

describe('variations and their services', () => {
  it("a variation cannot be added to another company's template; one added to your own is stamped", async () => {
    const refused = await createVariations(json({ template_id: 'tpl-b', variation_name: 'Sneak', tier: 'luxury' }))
    expect(refused.status).toBe(404)
    const ok = await createVariations(json({ template_id: 'tpl-a', variation_name: 'Lux', tier: 'luxury' }))
    expect(ok.status).toBe(201)
    expect((await rows('tour_variations')).find(v => v.variation_name === 'Lux')?.org_id).toBe('org-a')
  })

  it("another company's variation and its services are not found", async () => {
    expect((await getVariation(get('http://localhost/x'), idParams('var-b'))).status).toBe(404)
    expect((await listServices(get('http://localhost/x'), idParams('var-b'))).status).toBe(404)
    const mine = await (await listServices(get('http://localhost/x'), idParams('var-a'))).json()
    expect(mine.data.map((s: any) => s.id)).toEqual(['svc-a'])
  })

  it("a service may only name the variation's company's rate", async () => {
    const refused = await addService(json({ service_name: 'Hotel', service_category: 'accommodation', rate_type: 'accommodation', rate_id: 'rate-b' }), idParams('var-a'))
    expect(refused.status).toBe(400)
    const ok = await addService(json({ service_name: 'Hotel', service_category: 'accommodation', rate_type: 'accommodation', rate_id: 'rate-a' }), idParams('var-a'))
    expect(ok.status).toBe(201)
  })
})

describe('recalculate-prices: each company priced with its own rates', () => {
  it('the scheduler prices every company in turn, each template with its company’s settings', async () => {
    const req = { url: 'http://localhost/api/tours/recalculate-prices', headers: new Headers({ authorization: 'Bearer cron-secret' }), json: async () => ({}) } as unknown as NextRequest
    const res = await recalc(req)
    expect(res.status).toBe(200)
    expect(priced).toEqual([{ template: 'tpl-a', org: 'org-a' }, { template: 'tpl-b', org: 'org-b' }])
  })
  it("a signed-in manager prices only their own company's templates — another company's id finds nothing", async () => {
    const req = (body: unknown) => ({ url: 'http://localhost/api/tours/recalculate-prices', headers: new Headers(), json: async () => body }) as unknown as NextRequest
    await recalc(req({}))
    expect(priced).toEqual([{ template: 'tpl-a', org: 'org-a' }])
    priced.length = 0
    await recalc(req({ templateId: 'tpl-b' }))
    expect(priced).toEqual([])
  })
})

describe('everything else that names a template', () => {
  it("a departure cannot be made from another company's template or variation", async () => {
    expect((await createDeparture(json({ template_id: 'tpl-b', start_date: '2026-05-01' }))).status).toBe(404)
    expect((await createDeparture(json({ template_id: 'tpl-a', variation_id: 'var-b', start_date: '2026-05-01' }))).status).toBe(404)
  })

  it("the pricing engine prices only the pricing company's template", async () => {
    setMockTables(fullRateTables())
    const params = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: true, language: 'English', marginPercent: 25 }
    expect((await calculateDayBasedPricing({ ...params, orgId: 'org-1' })).success).toBe(true)
    const other = await calculateDayBasedPricing({ ...params, orgId: 'org-b' })
    expect(other.success).toBe(false)
    expect(other.warnings).toContain('Template not found')
  })

  it("the AI quote builder's matcher sees only the caller's company's programmes", async () => {
    const r = await matchTourTemplate(createMockClient() as never, { tour_requested: 'Cairo tour', cities: ['Cairo'], duration_days: 3 } as never, 'org-b')
    expect(r.matches.map(m => m.template_id)).toEqual(['tpl-b'])
  })

  it("the legacy builder stamps its tour and refuses another company's rate; a day of another company's tour is not found", async () => {
    const refused = await saveTour(json({ tour: { tour_code: 'LEG-2', tour_name: 'x', duration_days: 1, cities: [], days: [{ day_number: 1, city: 'Cairo', accommodation: { id: 'rate-b' } }] }, pax: 2, is_euro_passport: true }))
    expect(refused.status).toBe(400)
    const ok = await saveTour(json({ tour: { tour_code: 'LEG-2', tour_name: 'x', duration_days: 1, cities: [], days: [] }, pax: 2, is_euro_passport: true }))
    expect(ok.status).toBe(200)
    expect((await rows('tours')).find(t => t.tour_code === 'LEG-2')?.org_id).toBe('org-a')
    expect((await getDay(get('http://localhost/x'), idParams('day-b'))).status).toBe(404)
  })
})

describe("the day builder links only the template's company's content (content_library.org_id, 20261208)", () => {
  it("another company's content item is never returned in an activity", async () => {
    const res = await (await templateDays(get('http://localhost/x'), idParams('tpl-a'))).json()
    const act = res.data.days[0].activities[0]
    expect(act.id).toBe('act-a')
    expect(act.content_library).toBeNull()
    expect(JSON.stringify(res)).not.toContain('B secret write-up')
  })

  it("an activity cannot link another company's content — single, batch or edit", async () => {
    expect((await addActivity(json({ day_number: 1, activity_type: 'attraction', activity_name: 'x', content_id: 'content-b' }), idParams('tpl-a'))).status).toBe(404)
    expect((await addActivity(json({ activities: [{ day_number: 1, activity_type: 'attraction', activity_name: 'x', content_id: 'content-b' }] }), idParams('tpl-a'))).status).toBe(404)
    expect((await patchActivity(json({ activity_id: 'act-a', content_id: 'content-b' }), idParams('tpl-a'))).status).toBe(404)
    const ok = await addActivity(json({ day_number: 1, activity_type: 'attraction', activity_name: 'Giza (A)', content_id: 'content-a' }), idParams('tpl-a'))
    expect(ok.status).toBe(201)
    expect((await rows('tour_day_activities')).find(a => a.content_id === 'content-a')?.activity_name).toBe('Giza (A)')
  })

  it("another company's template's day plan is not found", async () => {
    expect((await templateDays(get('http://localhost/x'), idParams('tpl-b'))).status).toBe(404)
  })
})
