// Rates belong to one company (migration 20261206). Two companies' rows side
// by side in the mock database; every path below must read, change and price
// only the caller's company's — and stamp what it writes with it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null }))
const notified = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => 'admin',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/vocabulary-server', () => ({
  vocabularyItemsForCurrentOrg: vi.fn(async () => []),
  supplierTypesForCurrentOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/i18n/server-messages', () => ({
  getServerLocale: vi.fn(async () => 'en'),
  lookupServerMessage: vi.fn((_l: string, key: string) => key),
}))
vi.mock('@/lib/org-rate-currency', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-rate-currency')>()),
  getOrgRateCurrency: async () => 'EUR',
}))
vi.mock('@/lib/support/job-runs', () => ({
  withJobRun: (_name: string, _db: unknown, handler: unknown) => handler,
  jobRunHeaders: () => ({}),
}))
vi.mock('@/lib/notify-managers', () => ({
  orgManagerUserIds: async (_db: unknown, orgId: string) => (orgId === 'org-a' ? ['manager-a'] : ['manager-b']),
}))
vi.mock('@/lib/notifications', () => ({
  createNotifications: async (rows: Array<Record<string, unknown>>) => { notified.push(...rows); return { created: rows.length } },
}))
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: vi.fn(async () => ({ success: true })) }))

import { GET as listTips, POST as createTip } from '@/app/api/rates/tipping/route'
import { PUT as updateTip, DELETE as deleteTip } from '@/app/api/rates/tipping/[id]/route'
import { GET as getTrain } from '@/app/api/rates/trains/[id]/route'
import { POST as bulkImport } from '@/app/api/rates/bulk/import/route'
import { GET as gridRates } from '@/app/api/pricing-grid/rates/route'
import { POST as gridSave } from '@/app/api/pricing-grid/save/route'
import { GET as rateDigest } from '@/app/api/cron/rate-change-digest/route'
import { GET as invariants } from '@/app/api/cron/data-invariants/route'
import { POST as manageDestinations } from '@/app/api/destinations/manage/route'
import { calculateDayBasedPricing, getGuideRate, buildEntranceFeeCache, buildTransportCache } from '@/lib/auto-pricing-service'
import { getFixedDailyCosts, clearFixedCostsCache } from '@/lib/fixed-costs'
import { internalCronToken } from '@/lib/cron/auth'
import { sendEmailInternal } from '@/lib/email-send'

const json = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })
const db = () => createMockClient()
const rows = async (table: string) => (await db().from(table).select('*')) as unknown as { data: Array<Record<string, any>> }

beforeEach(() => {
  ctx.orgId = 'org-a'
  notified.length = 0
})

describe('rate routes: list, create, change — one company', () => {
  beforeEach(() => setMockTables({
    tipping_rates: [
      { id: 'tip-a', org_id: 'org-a', service_code: 'TIP-GUIDE', role_type: 'guide', rate_unit: 'per_day', rate_eur: 10, context: null, city: null },
      { id: 'tip-b', org_id: 'org-b', service_code: 'TIP-GUIDE', role_type: 'guide', rate_unit: 'per_day', rate_eur: 99, context: null, city: null },
    ],
    train_rates: [{ id: 'train-b', org_id: 'org-b', service_code: 'TRN-1' }],
  }))

  it('a list is the company\'s own rows', async () => {
    const res = await (await listTips()).json()
    expect(res.data.map((r: any) => r.id)).toEqual(['tip-a'])
    ctx.orgId = 'org-b'
    expect((await (await listTips()).json()).data.map((r: any) => r.id)).toEqual(['tip-b'])
  })

  it('a create is stamped with the caller\'s company, whatever the body says — and only its own rows are duplicates', async () => {
    ctx.orgId = 'org-b'
    const res = await createTip(json({ role_type: 'driver', rate_unit: 'per_day', rate_eur: 5, service_code: 'TIP-DRV', org_id: 'org-a' }))
    expect(res.status).toBe(200)
    const created = (await rows('tipping_rates')).data.find(r => r.service_code === 'TIP-DRV')
    expect(created?.org_id).toBe('org-b')
    // org-a has a guide tip with no context/city; org-b creating the same is not a duplicate of A's.
    ctx.orgId = 'org-a'
    expect((await createTip(json({ role_type: 'guide', rate_unit: 'per_day', rate_eur: 1 }))).status).toBe(409)
  })

  it("another company's rate is not found: no edit, no delete, no read", async () => {
    const put = await updateTip(json({ rate_eur: 1 }) as any, idParams('tip-b'))
    expect(put.status).toBe(404)
    expect((await deleteTip({} as any, idParams('tip-b'))).status).toBe(404)
    expect((await rows('tipping_rates')).data.find(r => r.id === 'tip-b')).toMatchObject({ rate_eur: 99, org_id: 'org-b' })
    expect((await getTrain({} as any, idParams('train-b'))).status).toBe(404)
    // Its own still works, and an org_id in the body moves nothing.
    expect((await updateTip(json({ rate_eur: 11, org_id: 'org-b' }) as any, idParams('tip-a'))).status).toBe(200)
    expect((await rows('tipping_rates')).data.find(r => r.id === 'tip-a')).toMatchObject({ rate_eur: 11, org_id: 'org-a' })
  })
})

describe('bulk import: per-company codes', () => {
  const csv = (code: string, rate: number) =>
    `service_code,role_type,rate_unit,rate_eur\n${code},guide,per_day,${rate}\n`

  it("an import in one company never overwrites the other's row with the same code", async () => {
    setMockTables({
      tipping_rates: [{ id: 'tip-a', org_id: 'org-a', service_code: 'TIP-SHARED', role_type: 'guide', rate_unit: 'per_day', rate_eur: 10 }],
      suppliers: [], supplier_properties: [],
    })
    ctx.orgId = 'org-b'
    const first = await (await bulkImport(json({ table: 'tipping_rates', csvData: csv('TIP-SHARED', 50) }) as any)).json()
    expect(first).toMatchObject({ success: true, inserted: 1, updated: 0 })
    let all = (await rows('tipping_rates')).data.filter(r => r.service_code === 'TIP-SHARED')
    expect(all.map(r => [r.org_id, Number(r.rate_eur)]).sort()).toEqual([['org-a', 10], ['org-b', 50]])

    // Importing again in org-b updates org-b's row — still not org-a's.
    const again = await (await bulkImport(json({ table: 'tipping_rates', csvData: csv('TIP-SHARED', 60) }) as any)).json()
    expect(again).toMatchObject({ success: true, inserted: 0, updated: 1 })
    all = (await rows('tipping_rates')).data.filter(r => r.service_code === 'TIP-SHARED')
    expect(all.map(r => [r.org_id, Number(r.rate_eur)]).sort()).toEqual([['org-a', 10], ['org-b', 60]])
  })
})

describe('the pricing engine reads one company\'s rates', () => {
  // Org A is the fixture catalogue; org B has the same rows (same codes) at
  // ten times the price. A's price must not move, B's must.
  function twoCompanies() {
    const a = fullRateTables() as Record<string, any[]>
    const b = fullRateTables() as Record<string, any[]>
    const tables: Record<string, any[]> = {}
    for (const [t, list] of Object.entries(a)) {
      const priced = (row: Record<string, any>) => Object.fromEntries(Object.entries(row).map(([k, v]) =>
        [k, typeof v === 'number' && /(rate|eur|price|cost|fee)/i.test(k) ? v * 10 : v]))
      tables[t] = [
        ...list.map(r => (t === 'tour_templates' ? r : { ...r, org_id: 'org-a' })),
        ...(t === 'tour_templates' ? [] : (b[t] ?? []).map(r => ({ ...priced(r), id: `b-${r.id}`, org_id: 'org-b' }))),
      ]
    }
    return tables
  }
  const params = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: true, language: 'English', marginPercent: 25 }

  it('the same trip prices from its own company\'s catalogue', async () => {
    setMockTables(Object.fromEntries(Object.entries(fullRateTables()).map(([t, l]) => [t, (l as any[]).map(r => (t === 'tour_templates' ? r : { ...r, org_id: 'org-a' }))])))
    const alone = await calculateDayBasedPricing({ ...params, orgId: 'org-a' })
    expect(alone.complete).toBe(true)

    setMockTables(twoCompanies())
    const a = await calculateDayBasedPricing({ ...params, orgId: 'org-a' })
    const b = await calculateDayBasedPricing({ ...params, orgId: 'org-b' })
    const pp = (r: typeof a, n: number) => r.paxPricing.find(p => p.numPax === n)!.withoutLeader.totalCost
    expect(pp(a, 2)).toBe(pp(alone, 2))
    expect(pp(b, 2)).toBeGreaterThan(pp(a, 2) * 5)
    // No service of A's price comes from one of B's rows.
    expect(a.services.some(s => String(s.id ?? '').includes('b-'))).toBe(false)
  })

  it('no company, no rates — holes, never someone else\'s numbers', async () => {
    setMockTables(twoCompanies())
    const r = await calculateDayBasedPricing({ ...params, orgId: undefined })
    expect(r.complete).toBe(false)
    expect(r.holes.length).toBeGreaterThan(0)
  })

  it('each reader filters by the company', async () => {
    setMockTables(twoCompanies())
    expect((await getGuideRate('org-a', 'English', 'standard'))?.id).not.toMatch(/^b-/)
    expect((await getGuideRate('org-b', 'English', 'standard'))?.id).toMatch(/^b-/)
    expect((await buildEntranceFeeCache('org-b')).every(f => f.id.startsWith('b-'))).toBe(true)
    expect([...(await buildTransportCache('org-a')).values()].every(r => !String(r.id).startsWith('b-'))).toBe(true)
  })

  it('fixed daily costs are cached per company', async () => {
    setMockTables({
      fixed_daily_costs: [
        { id: 'w-a', org_id: 'org-a', cost_type: 'Water Bottle', cost_per_person_per_day: 1, is_active: true },
        { id: 'w-b', org_id: 'org-b', cost_type: 'Water Bottle', cost_per_person_per_day: 3, is_active: true },
      ],
    })
    clearFixedCostsCache()
    expect((await getFixedDailyCosts('org-a')).waterPerPersonPerDay).toBe(1)
    expect((await getFixedDailyCosts('org-b')).waterPerPersonPerDay).toBe(3)
    expect((await getFixedDailyCosts('org-a')).waterPerPersonPerDay).toBe(1)
  })
})

describe('the pricing grid', () => {
  beforeEach(() => setMockTables({
    guide_rates: [
      { id: 'g-a', org_id: 'org-a', is_active: true, guide_language: 'english', guide_type: 'egyptologist', base_rate_eur: 50, base_rate_non_eur: 50 },
      { id: 'g-b', org_id: 'org-b', is_active: true, guide_language: 'english', guide_type: 'egyptologist', base_rate_eur: 80, base_rate_non_eur: 80 },
    ],
    accommodation_rates: [
      { id: '11111111-1111-4111-8111-11111111111a', org_id: 'org-a', is_active: true, tier: 'standard', property_name: 'A Hotel', city: 'Cairo' },
      { id: '11111111-1111-4111-8111-11111111111b', org_id: 'org-b', is_active: true, tier: 'standard', property_name: 'B Hotel', city: 'Cairo' },
    ],
    b2b_transport_packages: [], org_vocabularies: [], tipping_rates: [], itineraries: [],
  }))

  it('offers only the company\'s rates', async () => {
    const res = await (await gridRates(new NextRequest('http://x/api/pricing-grid/rates?tier=standard'))).json()
    expect(res.data.guide.map((g: any) => g.id)).toEqual(['g-a'])
    expect(res.data.accommodation.map((h: any) => h.id)).toEqual(['11111111-1111-4111-8111-11111111111a'])
  })

  it("refuses to save a trip that names another company's rate — before writing anything", async () => {
    const res = await gridSave(json({
      config: { pax: 2, startDate: '2026-11-01', tier: 'standard', clientName: 'X' },
      days: [{ dayNumber: 1, slots: [{ slotId: 'accommodation', selectedItems: [{ rateId: '11111111-1111-4111-8111-11111111111b_supp', name: 'B Hotel', rateEur: 1, rateNonEur: 1 }] }] }],
    }) as any)
    expect(res.status).toBe(400)
    expect((await rows('itineraries')).data).toEqual([])
  })
})

describe('the rate-change digest', () => {
  it('each company hears only about its own rates', async () => {
    const at = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    setMockTables({
      cron_watermarks: [],
      user_profiles: [{ id: 'editor-a', full_name: 'Aya' }, { id: 'editor-b', full_name: 'Bob' }],
      organizations: [{ id: 'org-a', rate_change_alerts: 'in_app' }, { id: 'org-b', rate_change_alerts: 'in_app' }],
      rate_audit_log: [
        { id: 'l1', org_id: 'org-a', table_name: 'guide_rates', record_id: 'g-a', action: 'UPDATE', changed_fields: { base_rate_eur: { old: 1, new: 2 } }, full_new_record: { id: 'g-a' }, full_old_record: null, changed_by: 'editor-a', changed_at: at },
        { id: 'l2', org_id: 'org-b', table_name: 'meal_rates', record_id: 'm-b', action: 'INSERT', changed_fields: null, full_new_record: { id: 'm-b' }, full_old_record: null, changed_by: 'editor-b', changed_at: at },
      ],
    })
    const res = await rateDigest(new NextRequest('http://x/api/cron/rate-change-digest', { headers: { authorization: `Bearer ${internalCronToken()}` } }))
    expect(res.status).toBe(200)
    const to = (org: string) => notified.filter(n => n.org_id === org)
    expect(to('org-a').map(n => n.user_id)).toEqual(['manager-a'])
    expect(to('org-b').map(n => n.user_id)).toEqual(['manager-b'])
    expect(String(to('org-a')[0].message) + String(to('org-a')[0].title)).not.toMatch(/meal/i)
  })
})

describe('the invariants sweep', () => {
  const guide = (id: string, org: string) => ({ id, org_id: org, supplier_id: null, guide_language: 'English', guide_type: 'egyptologist', tour_duration: 'full_day', city: 'Cairo' })
  const sweep = async () => (await invariants({ headers: new Headers({ authorization: `Bearer ${internalCronToken()}` }) } as any)).json()

  it('two companies with the same rate is no duplicate; one company twice is, and the alert names the company', async () => {
    setMockTables({
      itineraries: [], itinerary_days: [], itinerary_services: [], invoices: [], invoice_payments: [], activity_rates: [], transportation_rates: [],
      guide_rates: [guide('g1', 'org-a'), guide('g2', 'org-b')],
      organizations: [{ id: 'org-a', name: 'ATS' }, { id: 'org-b', name: 'Travel2Egypt' }],
    })
    expect((await sweep()).violations).toEqual([])

    setMockTables({
      itineraries: [], itinerary_days: [], itinerary_services: [], invoices: [], invoice_payments: [], activity_rates: [], transportation_rates: [],
      guide_rates: [guide('g1', 'org-a'), guide('g2', 'org-b'), guide('g3', 'org-b')],
      organizations: [{ id: 'org-a', name: 'ATS' }, { id: 'org-b', name: 'Travel2Egypt' }],
    })
    vi.stubEnv('BUSINESS_EMAIL', 'ops@example.com')
    const r = await sweep()
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]).toMatchObject({ check: 'rate_duplicate_natural_key', org: 'org-b' })
    const html = String(vi.mocked(sendEmailInternal).mock.calls.at(-1)?.[0]?.html ?? '')
    expect(html).toContain('Travel2Egypt')
    expect(html).not.toContain('ATS —')
    vi.unstubAllEnvs()
  })
})

describe('destinations', () => {
  beforeEach(() => setMockTables({
    destinations: [
      { id: 'd-a', org_id: 'org-a', country_code: 'EG', name: 'Egypt' },
      { id: 'd-b', org_id: 'org-b', country_code: 'EG', name: 'Egypt' },
    ],
    destination_cities: [{ id: 'c-b', destination_id: 'd-b', name: 'Luxor', destinations: { org_id: 'org-b' } }],
    transportation_rates: [], guide_rates: [], meal_rates: [], activity_rates: [], entrance_fees: [], accommodation_rates: [],
  }))

  it("a company cannot add a city to, or delete a city of, another company's destination", async () => {
    const add = await manageDestinations(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ action: 'add_city', destination_id: 'd-b', name: 'Aswan' }) }))
    expect(add.status).toBe(404)
    const del = await manageDestinations(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ action: 'delete_city', id: 'c-b' }) }))
    expect(del.status).toBe(404)
    expect((await rows('destination_cities')).data.map(c => c.id)).toEqual(['c-b'])
    // Its own company deletes it.
    ctx.orgId = 'org-b'
    const own = await manageDestinations(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ action: 'delete_city', id: 'c-b' }) }))
    expect(own.status).toBe(200)
    expect((await rows('destination_cities')).data).toEqual([])
  })

  it("delete_city counts only the company's own rates naming the city", async () => {
    setMockTables({
      destinations: [{ id: 'd-a', org_id: 'org-a', country_code: 'EG', name: 'Egypt' }],
      destination_cities: [{ id: 'c-a', destination_id: 'd-a', name: 'Luxor', destinations: { org_id: 'org-a' } }],
      // Another company's rate in Luxor is no reason to keep org-a's city.
      transportation_rates: [{ id: 't-b', org_id: 'org-b', city: 'Luxor' }],
      guide_rates: [], meal_rates: [], activity_rates: [], entrance_fees: [], accommodation_rates: [],
    })
    const res = await manageDestinations(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ action: 'delete_city', id: 'c-a' }) }))
    expect(res.status).toBe(200)
  })

  it('a new destination is the caller\'s', async () => {
    ctx.orgId = 'org-b'
    const res = await manageDestinations(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ action: 'create_destination', country_code: 'JO', name: 'Jordan' }) }))
    expect(res.status).toBe(200)
    expect((await rows('destinations')).data.find(d => d.country_code === 'JO')?.org_id).toBe('org-b')
  })
})
