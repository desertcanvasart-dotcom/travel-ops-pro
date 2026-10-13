import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

// The Guides & Services rate routes (Rates audit, Guides & Services):
//   #3  a company's first meal keeps every column it was saved with
//   #4  the database's natural-key refusal (23505) is a 409, not a 500
//   #5  one service may hold two validity periods; the same period twice is a 409
//   #11 a delete is refused, with the reason, while something uses the rate
//   #13 an attraction's supplier must be the company's own
//   #14 an edit runs the same money checks as a create
//   #15 the lists read past 1000 rows; the Japanese names go in batches
//   #1  ?in_rate_currency=true hands the pickers rows in the company currency

// The next insert into `failInsertOn` answers as Postgres would on a unique
// index (the mock has none).
let failInsertOn: string | null = null
vi.mock('@/lib/supabase-actor', async () => {
  const mock = await import('../_mock-supabase')
  return {
    createActorAdminClient: () => {
      const client = mock.createMockClient() as any
      return {
        ...client,
        from: (table: string) => {
          const q = client.from(table)
          if (table !== failInsertOn) return q
          // Any write chain ends in the unique-index refusal.
          const refused = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_guide_rates_natural_key"' } }
          const chain: any = new Proxy({}, {
            get: (_t, prop) => prop === 'then'
              ? (resolve: (v: unknown) => void) => resolve(refused)
              : prop === 'single' || prop === 'maybeSingle' ? async () => refused : () => chain,
          })
          return { ...q, insert: () => chain, update: () => chain }
        },
      }
    },
  }
})
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-1',
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => 'admin',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/i18n/server-messages', () => ({ tServer: async (key: string) => key }))
vi.mock('@/lib/org-rate-currency', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-rate-currency')>()),
  getOrgRateCurrency: async () => 'USD',
}))
vi.mock('@/lib/rates/fx-source', async (orig) => ({
  ...(await orig<typeof import('@/lib/rates/fx-source')>()),
  fetchRunExchangeRates: async () => ({ base: 'USD', date: '2027-01-01', rates: { USD: 1, EGP: 50 } }),
}))

import { GET as getGuides, POST as postGuide } from '@/app/api/rates/guides/route'
import { PUT as putGuide, DELETE as deleteGuide } from '@/app/api/rates/guides/[id]/route'
import { POST as postMeal } from '@/app/api/rates/meals/route'
import { PUT as putMeal, DELETE as deleteMeal } from '@/app/api/rates/meals/[id]/route'
import { PUT as putActivity, DELETE as deleteActivity } from '@/app/api/rates/activities/[id]/route'
import { GET as getAttractions, POST as postAttraction } from '@/app/api/rates/attractions/route'
import { PUT as putAttraction, DELETE as deleteAttraction } from '@/app/api/rates/attractions/[id]/route'
import { POST as postFee } from '@/app/api/rates/entrance-fees/route'
import { entranceFeeVersions } from '@/lib/rates/entrance-fee-versions'

const req = (url: string, body?: unknown, method = 'POST') =>
  new NextRequest(`http://localhost${url}`, body === undefined ? { method: 'GET' } : { method, body: JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const rows = async (t: string) => ((await (createMockClient().from(t) as any).select('*')).data ?? []) as any[]

const GUIDE = {
  guide_language: 'japanese', guide_type: 'egyptologist', tour_duration: 'full_day', city: 'Luxor',
  guide_mode: 'spot', base_rate_eur: 100,
}

beforeEach(() => {
  failInsertOn = null
  setMockTables({
    guide_rates: [], meal_rates: [], activity_rates: [], entrance_fees: [], entrance_fee_versions: [],
    tour_days: [], tour_variation_services: [], itinerary_services: [], tour_templates: [],
    suppliers: [
      { id: 'sup-mine', name: 'Mine', org_id: 'org-1' },
      { id: 'sup-theirs', name: 'Theirs', org_id: 'org-2' },
    ],
  } as any)
})

describe('guides: the natural key (#4, #5)', () => {
  it("the database's unique-index refusal is a 409 with a reason, not Internal server error", async () => {
    failInsertOn = 'guide_rates'
    const res = await postGuide(req('/api/rates/guides', { ...GUIDE, guide_mode: 'throughout' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already exists/)
  })

  it('Spot and Throughout for the same guide are two rates', async () => {
    expect((await postGuide(req('/api/rates/guides', GUIDE))).status).toBe(200)
    expect((await postGuide(req('/api/rates/guides', { ...GUIDE, guide_mode: 'throughout' }))).status).toBe(200)
  })

  it('a second validity period is a new rate; the same period again is a 409', async () => {
    const y26 = { ...GUIDE, rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31' }
    const y27 = { ...GUIDE, rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' }
    expect((await postGuide(req('/api/rates/guides', y26))).status).toBe(200)
    expect((await postGuide(req('/api/rates/guides', y27))).status).toBe(200)
    expect((await postGuide(req('/api/rates/guides', y27))).status).toBe(409)
    expect(await rows('guide_rates')).toHaveLength(2)
  })

  it('switching an edit onto another rate (23505) is a 409', async () => {
    await postGuide(req('/api/rates/guides', GUIDE))
    const [row] = await rows('guide_rates')
    failInsertOn = 'guide_rates'
    const res = await putGuide(req(`/api/rates/guides/${row.id}`, { guide_mode: 'throughout' }, 'PUT'), ctx(row.id))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Another rate already has these details/)
  })
})

describe('an edit runs the money checks (#14)', () => {
  it('a negative rate is refused on every PUT', async () => {
    setMockTables({
      guide_rates: [{ id: 'g1', ...GUIDE }],
      meal_rates: [{ id: 'm1', restaurant_name: 'Sofra', base_rate_eur: 20 }],
      activity_rates: [{ id: 'a1', activity_name: 'Felucca', base_rate_eur: 20 }],
      entrance_fees: [{ id: 'f1', attraction_name: 'Karnak', city: 'Luxor', eur_rate: 20 }],
    } as any)
    expect((await putGuide(req('/api/rates/guides/g1', { base_rate_eur: -5 }, 'PUT'), ctx('g1'))).status).toBe(400)
    expect((await putMeal(req('/api/rates/meals/m1', { base_rate_eur: -5 }, 'PUT'), ctx('m1'))).status).toBe(400)
    expect((await putActivity(req('/api/rates/activities/a1', { activity_name: 'Felucca', base_rate_eur: -5 }, 'PUT'), ctx('a1'))).status).toBe(400)
    expect((await putAttraction(req('/api/rates/attractions/f1', { eur_rate: -5 }, 'PUT'), ctx('f1'))).status).toBe(400)
    expect((await rows('guide_rates'))[0].base_rate_eur).toBe(100)
  })
})

describe("a company's first meal keeps every column (#3)", () => {
  it('rate currency, per group, category, dietary and preferred are stored', async () => {
    const res = await postMeal(req('/api/rates/meals', {
      restaurant_name: 'Felucca Lunch', meal_type: 'lunch', city: 'Luxor', tier: 'standard',
      base_rate_eur: 600, rate_currency: 'EGP', per_person_rate: false,
      meal_category: 'buffet', restaurant_type: 'casual_dining', dietary_options: ['vegetarian'], is_preferred: true,
    }))
    expect(res.status).toBe(200)
    expect((await rows('meal_rates'))[0]).toMatchObject({
      rate_currency: 'EGP', per_person_rate: false, meal_category: 'buffet',
      restaurant_type: 'casual_dining', dietary_options: ['vegetarian'], is_preferred: true, org_id: 'org-1',
    })
  })
})

describe('deletes are refused while the rate is used (#11)', () => {
  it('a guide on a tour day', async () => {
    setMockTables({ guide_rates: [{ id: 'g1', ...GUIDE }], tour_days: [{ id: 'd1', guide_id: 'g1' }], tour_variation_services: [], itinerary_services: [] } as any)
    const res = await deleteGuide(req('/api/rates/guides/g1', {}, 'DELETE'), ctx('g1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/used by a day of a tour.*Deactivate/)
    expect(await rows('guide_rates')).toHaveLength(1)
  })

  it('an activity on a variation, a meal pinned on a trip line', async () => {
    setMockTables({
      activity_rates: [{ id: 'a1', activity_name: 'Felucca' }],
      meal_rates: [{ id: 'm1', restaurant_name: 'Sofra' }],
      tour_variation_services: [{ id: 's1', rate_id: 'a1' }],
      tour_days: [],
      itinerary_services: [{ id: 'i1', notes: '__grid:slot:meals|rate_id:m1', itinerary_days: { itineraries: { org_id: 'org-1' } } }],
    } as any)
    expect((await deleteActivity(req('/api/rates/activities/a1', {}, 'DELETE'), ctx('a1'))).status).toBe(409)
    const meal = await deleteMeal(req('/api/rates/meals/m1', {}, 'DELETE'), ctx('m1'))
    expect(meal.status).toBe(409)
    expect((await meal.json()).error).toMatch(/Pricing Grid/)
  })

  it("an attraction picked as a programme day's ticket; an unused one deletes", async () => {
    setMockTables({
      entrance_fees: [{ id: 'f1', attraction_name: 'Karnak', city: 'Luxor' }, { id: 'f3', attraction_name: 'Luxor Temple', city: 'Luxor' }],
      tour_templates: [{ id: 't1', template_name: 'Luxor Classic', itinerary: [{ day: 1, attraction_ids: ['f1'] }] }],
      tour_variation_services: [], tour_days: [],
      itinerary_services: [{ id: 'i1', service_name: 'Karnak Sound & Light', notes: null, itinerary_days: { itineraries: { org_id: 'org-1' } } }],
    } as any)
    const used = await deleteAttraction(req('/api/rates/attractions/f1', {}, 'DELETE'), ctx('f1'))
    expect(used.status).toBe(409)
    expect((await used.json()).error).toMatch(/Luxor Classic/)
    expect((await deleteAttraction(req('/api/rates/attractions/f3', {}, 'DELETE'), ctx('f3'))).status).toBe(200)
    expect((await rows('entrance_fees')).map(f => f.id)).toEqual(['f1'])
  })
})

describe("an attraction's supplier is the company's own (#13)", () => {
  it("another company's supplier id is refused on create and edit", async () => {
    const base = { attraction_name: 'Karnak', city: 'Luxor', eur_rate: 20, rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' }
    expect((await postAttraction(req('/api/rates/attractions', { ...base, supplier_id: 'sup-theirs' }))).status).toBe(400)
    expect((await postFee(req('/api/rates/entrance-fees', { ...base, supplier_id: 'sup-theirs' }))).status).toBe(400)
    expect((await postAttraction(req('/api/rates/attractions', { ...base, supplier_id: 'sup-mine' }))).status).toBe(200)
    const [fee] = await rows('entrance_fees')
    expect(fee.supplier_id).toBe('sup-mine')
    expect((await putAttraction(req(`/api/rates/attractions/${fee.id}`, { supplier_id: 'sup-theirs' }, 'PUT'), ctx(fee.id))).status).toBe(400)
  })

  it('a new fee no longer invents a 50% child and student discount', async () => {
    await postFee(req('/api/rates/entrance-fees', { attraction_name: 'Philae', city: 'Aswan', eur_rate: 20 }))
    expect((await rows('entrance_fees'))[0]).toMatchObject({ child_discount_percent: null, student_discount_percentage: null })
  })
})

describe('lists (#15) and picker currency (#1)', () => {
  it('the guide list reads past 1000 rows', async () => {
    setMockTables({ guide_rates: Array.from({ length: 1205 }, (_, i) => ({ id: `g${String(i).padStart(4, '0')}`, ...GUIDE })) } as any)
    const json = await (await getGuides(req('/api/rates/guides'))).json()
    expect(json.data).toHaveLength(1205)
  })

  it('in_rate_currency=true converts each row from its own currency; the page list stays as entered', async () => {
    setMockTables({ guide_rates: [{ id: 'g1', ...GUIDE, base_rate_eur: 1500, base_rate_non_eur: 1500, rate_currency: 'EGP' }] } as any)
    const picker = (await (await getGuides(req('/api/rates/guides?in_rate_currency=true'))).json()).data[0]
    expect(picker).toMatchObject({ base_rate_eur: 30, rate_currency: 'USD', entered_currency: 'EGP' })
    const page = (await (await getGuides(req('/api/rates/guides'))).json()).data[0]
    expect(page).toMatchObject({ base_rate_eur: 1500, rate_currency: 'EGP' })
  })

  it('the attractions picker gets fees in the company currency', async () => {
    setMockTables({ entrance_fees: [{ id: 'f1', attraction_name: 'Karnak', city: 'Luxor', eur_rate: 600, non_eur_rate: 600, rate_currency: 'EGP' }], entrance_fee_versions: [] } as any)
    const fee = (await (await getAttractions(req('/api/rates/attractions?in_rate_currency=true'))).json()).data[0]
    expect(fee).toMatchObject({ eur_rate: 12, rate_currency: 'USD', entered_currency: 'EGP' })
  })

  it('the Japanese names are read in batches of ids', async () => {
    const calls: number[] = []
    const db = { from: () => ({ select: () => ({ in: (_c: string, ids: string[]) => { calls.push(ids.length); return { eq: async () => ({ data: [], error: null }) } } }) }) }
    await entranceFeeVersions(db, Array.from({ length: 400 }, (_, i) => `id-${i}`), 'ja')
    expect(calls).toEqual([150, 150, 100])
  })
})
