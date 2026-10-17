// Tours › Tour Templates audit (findings #1, #2, #5, #8, #9, #10, #11, #12,
// and the inventory audit's #3 — the same delete route). The routes run
// against the in-memory Supabase mock; a wrapper adds the two database rules
// the findings turn on and the mock does not know: tour_variations.inclusions
// / exclusions are text[] NOT NULL with no default, and template_code is
// UNIQUE per company (a clash is Postgres 23505).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a', role: 'manager' as string, failVariationInsert: false }))

function client() {
  const db = createMockClient()
  return {
    ...db,
    from: (table: string) => {
      const q = db.from(table)
      if (table === 'tour_variations') {
        const insert = q.insert
        q.insert = (payload: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(payload) ? payload : [payload]
          const bad = ctx.failVariationInsert || rows.some(r => r.inclusions == null || r.exclusions == null)
          if (bad) {
            const err = { data: null, error: { code: '23502', message: 'null value in column "inclusions" violates not-null constraint' } }
            const fail = { select: () => fail, single: async () => err, then: (f: (v: unknown) => unknown) => Promise.resolve(err).then(f) }
            return fail
          }
          return insert(payload)
        }
      }
      if (table === 'tour_templates') {
        const insert = q.insert
        q.insert = (payload: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(payload) ? payload : [payload]
          const taken = (rows as Array<Record<string, unknown>>).some(r => all('tour_templates').some(t => t.org_id === r.org_id && t.template_code === r.template_code))
          if (taken) {
            const err = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "tour_templates_org_id_template_code_key"' } }
            const fail = { select: () => fail, single: async () => err, maybeSingle: async () => err, then: (f: (v: unknown) => unknown) => Promise.resolve(err).then(f) }
            return fail
          }
          return insert(payload)
        }
      }
      return q
    },
  }
}

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => client(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => client() }))
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
vi.mock('@/lib/vocabulary-server', () => ({
  tierLadderForCurrentOrg: vi.fn(async () => ['standard']),
}))

import { DELETE as deleteTemplate, PUT as putTemplate } from '@/app/api/tours/templates/[id]/route'
import { POST as createTemplate } from '@/app/api/tours/templates/route'
import { DELETE as deleteVariation } from '@/app/api/tours/variations/[id]/route'
import { POST as fromItinerary } from '@/app/api/b2b/create-template-from-itinerary/route'
import { POST as duplicate } from '@/app/api/tours/templates/[id]/duplicate/route'
import { POST as bulkImport } from '@/app/api/tours/bulk/import/route'

const json = (body: unknown) => ({ json: async () => body, url: 'http://localhost/x', headers: new Headers() }) as unknown as NextRequest
const none = () => ({ json: async () => ({}), url: 'http://localhost/x', headers: new Headers() }) as unknown as NextRequest
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })
let T: Record<string, Array<Record<string, any>>>
const all = (table: string) => T[table] ?? []

function fixture() {
  T = {
    tour_templates: [
      { id: 'tpl-a', org_id: 'org-a', template_code: 'CAI-DAY-001', template_name: 'Cairo day', tour_type: 'day_tour', duration_days: 1,
        cities_covered: ['Luxor'], is_active: true, itinerary: [{ day: 1, title: 'Giza' }], meals_included: ['Lunch'], pickup_required: false,
        short_description: 'Old text', cached_starting_price: 99 },
      { id: 'tpl-free', org_id: 'org-a', template_code: 'CAI-DAY-002', template_name: 'Unused', tour_type: 'day_tour', duration_days: 1, is_active: true },
    ],
    tour_variations: [
      { id: 'var-a', org_id: 'org-a', template_id: 'tpl-a', variation_code: 'CAI-DAY-001-STANDARD', variation_name: 'Cairo day - Standard', tier: 'standard', inclusions: [], exclusions: [], is_active: true },
      { id: 'var-free', org_id: 'org-a', template_id: 'tpl-free', variation_code: 'CAI-DAY-002-STANDARD', variation_name: 'Unused - Standard', tier: 'standard', inclusions: [], exclusions: [], is_active: true },
    ],
    tour_template_versions: [
      { id: 'tv-en', template_id: 'tpl-a', language: 'en', template_name: 'Cairo day', short_description: 'Old text' },
      { id: 'tv-ja', template_id: 'tpl-a', language: 'ja', template_name: 'カイロ日帰り' },
    ],
    tour_variation_versions: [{ id: 'vv-ja', variation_id: 'var-a', language: 'ja', variation_name: 'スタンダード' }],
    tour_variation_services: [{ id: 'svc-a', variation_id: 'var-a', service_name: 'Guide', service_category: 'guide' }],
    variation_daily_itinerary: [], variation_pricing: [], variation_services: [], tour_template_defaults: [],
    tour_day_activities: [{ id: 'act-a', template_id: 'tpl-a', day_number: 1, sequence_order: 1, activity_name: 'Pyramids' }],
    tour_quotes: [], tour_departures: [], departure_bookings: [], itineraries: [], b2b_partner_pricing: [],
    itinerary_days: [{ id: 'd1', itinerary_id: 'it-a', day_number: 1, city: 'Cairo', title: 'Giza' }],
    itinerary_services: [],
  }
  T.itineraries.push({ id: 'it-a', org_id: 'org-a', trip_name: 'WhatsApp trip', total_days: 1 })
  setMockTables(T as never)
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.role = 'manager'
  ctx.failVariationInsert = false
  fixture()
})

describe('#1 (+ inventory #3): a template or variation in use is never deleted', () => {
  it('refuses with 409 and the counts by kind, and deletes nothing — an accepted quote stays', async () => {
    T.tour_quotes.push({ id: 'q1', org_id: 'org-a', variation_id: 'var-a', itinerary_id: null, status: 'accepted' })
    T.tour_departures.push({ id: 'dep1', org_id: 'org-a', template_id: 'tpl-a', variation_id: 'var-a', status: 'open' })
    T.departure_bookings.push({ id: 'h1', org_id: 'org-a', departure_id: 'dep1', pax: 2, status: 'pending' })
    T.b2b_partner_pricing.push({ id: 'pp1', variation_id: 'var-a', partner_id: 'p1' })
    T.itineraries.push({ id: 'trip1', org_id: 'org-a', template_id: 'tpl-a' })
    const res = await deleteTemplate(none(), idParams('tpl-a'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.references).toEqual({ quotes: 1, departures: 1, itineraries: 1, partner_prices: 1, holds: 1 })
    expect(body.can_deactivate).toBe(true)
    expect(body.error).toContain('1 quote, 1 departure, 1 trip, 1 partner price, 1 seat hold')
    expect(all('tour_quotes').map(q => q.id)).toEqual(['q1'])
    expect(all('tour_templates').map(t => t.id)).toContain('tpl-a')
    expect(all('tour_variations').map(v => v.id)).toContain('var-a')
    expect(all('tour_day_activities')).toHaveLength(1)
    expect(all('b2b_partner_pricing')).toHaveLength(1)
  })

  it('a draft quote alone is enough to refuse', async () => {
    T.tour_quotes.push({ id: 'q2', org_id: 'org-a', variation_id: 'var-a', itinerary_id: null, status: 'draft' })
    expect((await deleteTemplate(none(), idParams('tpl-a'))).status).toBe(409)
    expect(all('tour_quotes')).toHaveLength(1)
  })

  it('an unreferenced template deletes as before', async () => {
    const res = await deleteTemplate(none(), idParams('tpl-free'))
    expect(res.status).toBe(200)
    expect(all('tour_templates').map(t => t.id)).toEqual(['tpl-a'])
    expect(all('tour_variations').map(v => v.id)).toEqual(['var-a'])
  })

  it('Deactivate (PUT is_active false) is what the refused template gets instead', async () => {
    const res = await putTemplate(json({ is_active: false }), idParams('tpl-a'))
    expect(res.status).toBe(200)
    expect(all('tour_templates').find(t => t.id === 'tpl-a')?.is_active).toBe(false)
  })

  it('a variation in use is refused the same way; an unused one deletes', async () => {
    T.b2b_partner_pricing.push({ id: 'pp1', variation_id: 'var-a', partner_id: 'p1' })
    const refused = await deleteVariation(none(), idParams('var-a'))
    expect(refused.status).toBe(409)
    expect((await refused.json()).references.partner_prices).toBe(1)
    expect(all('b2b_partner_pricing')).toHaveLength(1)
    expect((await deleteVariation(none(), idParams('var-free'))).status).toBe(200)
    expect(all('tour_variations').map(v => v.id)).toEqual(['var-a'])
  })
})

describe('#2 / #5: create a template from an itinerary', () => {
  it('a manager gets an ACTIVE template and its variation, with valid inclusions / exclusions', async () => {
    const res = await fromItinerary(json({ itinerary_id: 'it-a', tier: 'standard' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.variation_id).toBeTruthy()
    expect(body.data.pending_review).toBe(false)
    const tpl = all('tour_templates').find(t => t.id === body.data.template_id)
    expect(tpl?.is_active).toBe(true)
    const v = all('tour_variations').find(x => x.id === body.data.variation_id)
    expect(v).toMatchObject({ inclusions: [], exclusions: [], template_id: tpl?.id, org_id: 'org-a' })
  })

  it("an agent's template is created INACTIVE for a manager to review, and says so", async () => {
    ctx.role = 'agent'
    const res = await fromItinerary(json({ itinerary_id: 'it-a' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toMatchObject({ is_active: false, pending_review: true })
    expect(body.message).toMatch(/inactive/i)
    expect(all('tour_templates').find(t => t.id === body.data.template_id)?.is_active).toBe(false)
  })

  it('when the variation insert fails, no template is left behind', async () => {
    ctx.failVariationInsert = true
    const before = all('tour_templates').length
    const res = await fromItinerary(json({ itinerary_id: 'it-a' }))
    expect(res.status).toBe(500)
    expect(all('tour_templates')).toHaveLength(before)
    expect(all('tour_templates').some(t => t.short_description === 'Custom tour created from WhatsApp inquiry')).toBe(false)
  })
})

describe('#9: editing a template updates its English version', () => {
  it('a PUT renaming a template rewrites tour_template_versions(en)', async () => {
    const res = await putTemplate(json({ template_name: 'Cairo highlights', short_description: 'New text' }), idParams('tpl-a'))
    expect(res.status).toBe(200)
    const en = all('tour_template_versions').find(v => v.template_id === 'tpl-a' && v.language === 'en')
    expect(en).toMatchObject({ template_name: 'Cairo highlights', short_description: 'New text' })
    expect(all('tour_template_versions').filter(v => v.template_id === 'tpl-a' && v.language === 'en')).toHaveLength(1)
    expect(all('tour_template_versions').find(v => v.language === 'ja')?.template_name).toBe('カイロ日帰り')
  })
})

describe('#6: a PUT keeps what it is not sent', () => {
  it('meals_included and pickup_required survive an edit that does not send them', async () => {
    await putTemplate(json({ template_name: 'Renamed' }), idParams('tpl-a'))
    const tpl = all('tour_templates').find(t => t.id === 'tpl-a')
    expect(tpl).toMatchObject({ template_name: 'Renamed', meals_included: ['Lunch'], pickup_required: false })
  })
})

describe('#10: the Auto-Pricing box is saved as pricing_mode', () => {
  it('POST and PUT store auto / manual', async () => {
    const res = await createTemplate(json({ template_name: 'Manual one', tour_type: 'day_tour', pricing_mode: 'manual' }))
    expect((await res.json()).data.pricing_mode).toBe('manual')
    await putTemplate(json({ pricing_mode: 'auto' }), idParams('tpl-a'))
    expect(all('tour_templates').find(t => t.id === 'tpl-a')?.pricing_mode).toBe('auto')
    await putTemplate(json({ pricing_mode: 'nonsense' }), idParams('tpl-a'))
    expect(all('tour_templates').find(t => t.id === 'tpl-a')?.pricing_mode).toBe('auto')
  })
})

describe('#12: codes', () => {
  it('a typed code that is taken is a 409 naming it, not a 500', async () => {
    const res = await createTemplate(json({ template_name: 'Clash', tour_type: 'day_tour', template_code: 'CAI-DAY-001' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('CAI-DAY-001')
  })

  it('a generated code that clashes is drawn again', async () => {
    const rnd = vi.spyOn(Math, 'random')
    rnd.mockReturnValueOnce(0.001).mockReturnValueOnce(0.5)
    // LUX-DAY-001 is free; make it taken so the first draw clashes.
    T.tour_templates.push({ id: 'tpl-x', org_id: 'org-a', template_code: 'LUX-DAY-001', template_name: 'x', tour_type: 'day_tour' })
    const res = await createTemplate(json({ template_name: 'Luxor day', tour_type: 'day_tour', cities_covered: ['Luxor'] }))
    rnd.mockRestore()
    expect(res.status).toBe(201)
    expect((await res.json()).data.template_code).toBe('LUX-DAY-500')
  })

  it('the bulk import matches a code ignoring case, keeps the stored spelling, and writes an EN version for a new template', async () => {
    const csvData = 'template_code,template_name,tour_type,duration_days\ncai-day-001,Cairo renamed,day_tour,1\nNEW-1,Brand new,day_tour,1\n'
    const res = await bulkImport(json({ csvData }))
    const body = await res.json()
    expect(body).toMatchObject({ success: true, created: 1, updated: 1 })
    expect(all('tour_templates').filter(t => t.template_code.toLowerCase() === 'cai-day-001')).toHaveLength(1)
    expect(all('tour_templates').find(t => t.id === 'tpl-a')).toMatchObject({ template_code: 'CAI-DAY-001', template_name: 'Cairo renamed' })
    const made = all('tour_templates').find(t => t.template_code === 'NEW-1')!
    expect(all('tour_template_versions').find(v => v.template_id === made.id && v.language === 'en')?.template_name).toBe('Brand new')
  })
})

describe('#11: Duplicate copies the whole programme', () => {
  it('variations (with services and translations), day activities and versions, under a code from the SOURCE', async () => {
    const res = await duplicate(none(), idParams('tpl-a'))
    expect(res.status).toBe(201)
    const body = await res.json()
    const copy = all('tour_templates').find(t => t.id === body.data.id)!
    expect(copy.template_name).toBe('Cairo day (Copy)')
    expect(copy.template_code).toMatch(/^LUX-DAY-\d{3}$/)
    expect(copy.cached_starting_price).toBeUndefined()
    expect(body.data.variations_copied).toBe(1)
    const v = all('tour_variations').find(x => x.template_id === copy.id)!
    expect(v.variation_code).toBe(`${copy.template_code}-STANDARD`)
    expect(all('tour_variation_services').filter(s => s.variation_id === v.id)).toHaveLength(1)
    expect(all('tour_variation_versions').filter(s => s.variation_id === v.id)).toHaveLength(1)
    expect(all('tour_day_activities').filter(a => a.template_id === copy.id)).toHaveLength(1)
    const langs = all('tour_template_versions').filter(x => x.template_id === copy.id)
    expect(langs.map(l => l.language).sort()).toEqual(['en', 'ja'])
    expect(langs.find(l => l.language === 'en')?.template_name).toBe('Cairo day (Copy)')
    // The source is untouched.
    expect(all('tour_variations').filter(x => x.template_id === 'tpl-a')).toHaveLength(1)
  })

  it("is manager-and-above, and another company's template is not found", async () => {
    ctx.role = 'agent'
    expect((await duplicate(none(), idParams('tpl-a'))).status).toBe(403)
    ctx.role = 'manager'
    ctx.orgId = 'org-b'
    expect((await duplicate(none(), idParams('tpl-a'))).status).toBe(404)
  })
})
