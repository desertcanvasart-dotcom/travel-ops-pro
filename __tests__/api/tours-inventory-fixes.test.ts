// ============================================
// Ready-made Packages (/tours, /tours/[code]) — audit fixes
// ============================================
// The tour page priced at cost under "Price per person", opened (and priced)
// a withdrawn variation picked alphabetically, let an agent write language
// versions and spend AI translation, ignored the minimum group size, threw
// away translated days and reported a failed save as success, and told a tour
// with no version rows that English was missing. The catalogue's legacy
// variation_pricing fallback took the cheapest number of any band, any year,
// any currency. Each is pinned here — through the real routes over the mock
// database where it can be exercised, by source where it is page markup.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({
  role: 'manager' as string,
  aiLimited: false,
  failInsertOn: null as string | null,
  translated: [] as string[],
}))

// A client whose insert on one table fails — the failed-save case.
function client() {
  const db = createMockClient()
  return {
    ...db,
    from: (table: string) => {
      const q = db.from(table)
      if (ctx.failInsertOn !== table) return q
      const failed = { data: null, error: { message: `${table} is locked` } }
      return { ...q, insert: () => ({ select: () => ({ single: async () => failed }) }) }
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
    getCurrentOrgId: async () => 'org-1',
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => ctx.role,
    requireRole: async (allowed: string[]) =>
      roleAllows(ctx.role, allowed) ? null : NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/rate-limit/ai-limit', async () => {
  const { NextResponse } = await import('next/server')
  return {
    guardAiRate: vi.fn(async () =>
      ctx.aiLimited ? NextResponse.json({ success: false, error: 'Too many AI draft requests' }, { status: 429 }) : null),
  }
})
vi.mock('@/lib/translation-utils', async (orig) => {
  const real = await orig<typeof import('@/lib/translation-utils')>()
  return {
    ...real,
    // One AI call per field group; the label names which group it was.
    translateFields: vi.fn(async (content: Record<string, unknown>, fields: { field: string }[]) => {
      ctx.translated.push(fields.map(f => f.field).join(','))
      return content
    }),
  }
})
vi.mock('@/lib/i18n/server-messages', () => ({
  getServerLocale: async () => 'en',
  lookupServerMessage: (_l: string, key: string) => key,
}))
vi.mock('@/lib/vocabulary-server', () => ({
  // The company's ladder, lowest first.
  tierLadderForOrg: vi.fn(async () => ['budget', 'standard', 'deluxe', 'luxury']),
  tierLadderForCurrentOrg: vi.fn(async () => ['budget', 'standard', 'deluxe', 'luxury']),
  activeKeysForOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/org-rate-currency', () => ({ DEFAULT_RATE_CURRENCY: 'EUR', getOrgRateCurrency: async () => 'EUR' }))
vi.mock('@/lib/auto-pricing-service', async (orig) => {
  const real = await orig<typeof import('@/lib/auto-pricing-service')>()
  // Cost 1000, plus the margin the route hands the engine.
  const price = async (p: { marginPercent: number; numPax: number }) => {
    const marginAmount = Math.round(1000 * p.marginPercent) / 100
    return {
      success: true, complete: true, holes: [], warnings: [],
      services: [{ id: 'd1-guide', serviceName: 'Guide', serviceType: 'guide', rateSource: 'guide_rates', quantityMode: 'fixed', quantity: 1, unitCost: 1000, lineTotal: 1000, isOptional: false, dayNumber: 1 }],
      optionalServices: [], accommodationNights: [],
      subtotalCost: 1000, optionalTotal: 0, totalCost: 1000, tourLeaderCost: 0,
      marginPercent: p.marginPercent, marginAmount, sellingPrice: 1000 + marginAmount,
      pricePerPerson: (1000 + marginAmount) / p.numPax, singleSupplement: 0, currency: 'EUR',
      baseSellingPrice: 1000 + marginAmount, seasonUplift: null, paxPricingTable: [],
    }
  }
  return { ...real, calculateAutoPricing: vi.fn(price), calculatePricingWithPassengerBreakdown: vi.fn(price) }
})

import { GET as tourDetail } from '@/app/api/tours/[code]/route'
import { GET as getVersions, POST as postVersion } from '@/app/api/tours/[code]/versions/route'
import { POST as copyTranslate, versionInsertFailed } from '@/app/api/tours/[code]/versions/copy-translate/route'
import { POST as calculatePrice } from '@/app/api/b2b/calculate-price/route'
import { orderVariationsForDefault, pickDefaultVariation } from '@/lib/tours/default-variation'
import { belowMinPaxMessage, paxChoices } from '@/lib/tours/min-pax'
import { tourLanguages, needsVersion } from '@/lib/tours/version-languages'
import { cheapestLegacyPrice } from '@/lib/tours/cached-price'
import { buildFxIndex } from '@/lib/fx-conversion'
import { guardAiRate } from '@/lib/rate-limit/ai-limit'

const get = (url: string) => new NextRequest(`http://localhost${url}`)
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) })
const code = (c: string) => ({ params: Promise.resolve({ code: c }) })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const TPL = { id: '11111111-1111-4111-8111-111111111111', template_code: 'NILE-5D', template_name: 'Nile 5D', duration_days: 5, is_active: true, itinerary: [], theme_key: null, uses_day_builder: true }
const embed = { ...TPL }

beforeEach(() => {
  ctx.role = 'manager'
  ctx.aiLimited = false
  ctx.failInsertOn = null
  ctx.translated = []
  vi.mocked(guardAiRate).mockClear()
  setMockTables({
    organizations: [{ id: 'org-1', default_margin_percent: 18 }],
    tour_templates: [
      { ...TPL },
      { id: 'tpl-off', template_code: 'OLD-3D', template_name: 'Old 3D', duration_days: 3, is_active: false, itinerary: [], theme_key: null },
    ],
    tour_variations: [
      // Alphabetically first, and withdrawn — the page used to open on it.
      { id: 'var-budget', template_id: TPL.id, variation_code: 'NILE-5D-BUDGET', variation_name: 'Nile Budget', tier: 'budget', is_active: false, min_pax: 1, max_pax: 10, tour_templates: embed },
      { id: 'var-luxury', template_id: TPL.id, variation_code: 'NILE-5D-LUXURY', variation_name: 'Nile Luxury', tier: 'luxury', is_active: true, min_pax: 1, max_pax: 10, tour_templates: embed },
      { id: 'var-standard', template_id: TPL.id, variation_code: 'NILE-5D-STANDARD', variation_name: 'Nile Standard', tier: 'standard', is_active: true, min_pax: 4, max_pax: 10, tour_templates: embed },
    ],
    tour_variation_services: [],
    variation_services: [],
    variation_daily_itinerary: [
      { id: 'd1', variation_id: 'var-standard', day_number: 1, day_title: 'Luxor', day_description: 'East bank' },
      { id: 'd2', variation_id: 'var-standard', day_number: 2, day_title: 'Edfu', day_description: 'Sail' },
    ],
    tour_variation_versions: [],
    tour_template_versions: [],
    org_vocabularies: [],
    b2b_partners: [],
    b2b_partner_pricing: [],
    extras_catalogue: [],
  })
})

// ---------- #2 which variation, and only an active one ----------
describe('#2 the tour opens on an active variation, by the company tier ladder', () => {
  it('picks the default tier, never a withdrawn one, never alphabetical', () => {
    const ladder = ['budget', 'standard', 'deluxe', 'luxury']
    const vs = [
      { id: 'b', tier: 'budget', is_active: false },
      { id: 'l', tier: 'luxury', is_active: true },
      { id: 's', tier: 'standard', is_active: true },
    ]
    expect(pickDefaultVariation(vs, ladder)?.id).toBe('s')
    expect(orderVariationsForDefault(vs, ladder).map(v => v.id)).toEqual(['s', 'l'])
    expect(pickDefaultVariation([{ id: 'b', tier: 'budget', is_active: false }], ladder)).toBeNull()
  })

  it("follows a custom ladder: its 'standard' first, then lowest up, unknown tiers last", () => {
    const ladder = ['economy', 'classic', 'premium']
    const vs = [
      { id: 'x', tier: 'zzz-retired', is_active: true },
      { id: 'p', tier: 'premium', is_active: true },
      { id: 'e', tier: 'economy', is_active: true },
      { id: 'c', tier: 'classic', is_active: true },
    ]
    expect(orderVariationsForDefault(vs, ladder).map(v => v.id)).toEqual(['c', 'e', 'p', 'x'])
  })

  it('GET /api/tours/<template id> opens the active standard variation, not the withdrawn budget one', async () => {
    const res = await tourDetail(get(`/api/tours/${TPL.id}`), code(TPL.id))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.variation_id).toBe('var-standard')
  })

  it('a template code opens the same variation', async () => {
    const body = await (await tourDetail(get('/api/tours/NILE-5D'), code('NILE-5D'))).json()
    expect(body.data.variation_id).toBe('var-standard')
  })

  it('a withdrawn variation opened by its code says it is withdrawn (410), it is not priced', async () => {
    const res = await tourDetail(get('/api/tours/NILE-5D-BUDGET'), code('NILE-5D-BUDGET'))
    expect(res.status).toBe(410)
    expect((await res.json()).withdrawn).toBe(true)
  })

  it('a withdrawn tour opened by its code says it is withdrawn', async () => {
    const res = await tourDetail(get('/api/tours/OLD-3D'), code('OLD-3D'))
    expect(res.status).toBe(410)
  })

  it('an unknown code is still "not found"', async () => {
    const res = await tourDetail(get('/api/tours/NOPE'), code('NOPE'))
    expect(res.status).toBe(404)
  })

  it('versions read the same variation, and refuse a withdrawn one', async () => {
    const body = await (await getVersions(get(`/api/tours/${TPL.id}/versions`), code(TPL.id))).json()
    expect(body.data.variation_id).toBe('var-standard')
    const off = await getVersions(get('/api/tours/NILE-5D-BUDGET/versions'), code('NILE-5D-BUDGET'))
    expect(off.status).toBe(410)
  })

  it('copy-translate writes the version onto the same variation, and refuses a withdrawn one', async () => {
    const res = await copyTranslate(post('/api/tours/NILE-5D/versions/copy-translate', { targetLanguage: 'ja' }), code('NILE-5D'))
    expect(res.status).toBe(200)
    expect((await rows('tour_variation_versions')).map(v => v.variation_id)).toEqual(['var-standard'])
    const off = await copyTranslate(post('/api/tours/NILE-5D-BUDGET/versions/copy-translate', { targetLanguage: 'ja' }), code('NILE-5D-BUDGET'))
    expect(off.status).toBe(410)
  })
})

// ---------- #4 who may write versions and spend AI ----------
describe('#4 language versions are admin/manager, and translation shares the AI budget', () => {
  it('an agent cannot POST a version (403) and nothing is written', async () => {
    ctx.role = 'agent'
    const res = await postVersion(post('/api/tours/NILE-5D/versions', { language: 'ja', template_content: { template_name: 'ナイル' } }), code('NILE-5D'))
    expect(res.status).toBe(403)
    expect(await rows('tour_template_versions')).toEqual([])
  })

  it('a manager can', async () => {
    const res = await postVersion(post('/api/tours/NILE-5D/versions', { language: 'ja', template_content: { template_name: 'ナイル' } }), code('NILE-5D'))
    expect(res.status).toBe(200)
    expect((await rows('tour_template_versions')).map(v => v.template_name)).toEqual(['ナイル'])
  })

  it('an agent cannot copy-translate (403), and no AI call is made', async () => {
    ctx.role = 'agent'
    const res = await copyTranslate(post('/api/tours/NILE-5D/versions/copy-translate', { targetLanguage: 'ja' }), code('NILE-5D'))
    expect(res.status).toBe(403)
    expect(ctx.translated).toEqual([])
  })

  it('copy-translate goes through guardAiRate: over the limit is 429 and nothing is translated', async () => {
    ctx.aiLimited = true
    const res = await copyTranslate(post('/api/tours/NILE-5D/versions/copy-translate', { targetLanguage: 'ja' }), code('NILE-5D'))
    expect(res.status).toBe(429)
    expect(guardAiRate).toHaveBeenCalled()
    expect(ctx.translated).toEqual([])
  })
})

// ---------- #9 no thrown-away work, no false success ----------
describe('#9 copy-translate translates only what it saves, and a failed save is an error', () => {
  it('translates the variation and the template — not each itinerary day', async () => {
    await copyTranslate(post('/api/tours/NILE-5D/versions/copy-translate', { targetLanguage: 'ja' }), code('NILE-5D'))
    expect(ctx.translated).toHaveLength(2)
    expect(ctx.translated.some(f => f.includes('day_title'))).toBe(false)
  })

  it('a failed template-version insert returns 500, not success', async () => {
    ctx.failInsertOn = 'tour_template_versions'
    const res = await copyTranslate(post('/api/tours/NILE-5D/versions/copy-translate', { targetLanguage: 'ja' }), code('NILE-5D'))
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
  })

  it('a failed variation-version insert returns 500 too', async () => {
    ctx.failInsertOn = 'tour_variation_versions'
    const res = await copyTranslate(post('/api/tours/NILE-5D/versions/copy-translate', { targetLanguage: 'ja' }), code('NILE-5D'))
    expect(res.status).toBe(500)
  })

  it('versionInsertFailed is null without an error', () => {
    expect(versionInsertFailed(null)).toBeNull()
  })
})

// ---------- #1 selling price, at the server's margin ----------
describe('#1 the tour page shows selling prices, at the same margin rule as the card', () => {
  it('the page no longer sends margin_percent: 0', () => {
    const page = src('app/tours/[code]/page.tsx')
    expect(page).not.toMatch(/margin_percent:\s*0/)
    // The calculate-price request body names no margin at all.
    const body = page.match(/fetch\('\/api\/b2b\/calculate-price'[\s\S]*?include_optionals: false/)?.[0] ?? ''
    expect(body).toMatch(/num_pax: selectedPax/)
    expect(body.replace(/\/\/.*$/gm, '')).not.toMatch(/margin_percent/)
  })

  it('without a margin the engine prices at the company default (18%), as the catalogue card does', async () => {
    const res = await calculatePrice(post('/api/b2b/calculate-price', { variation_id: 'var-standard', num_pax: 4, travel_date: '2027-05-01', include_optionals: false }))
    const data = (await res.json()).data
    expect(data.margin_percent).toBe(18)
    expect(data.total_cost).toBe(1000)
    expect(data.selling_price).toBe(1180)
    expect(data.price_per_person).toBe(295)
  })

  it('cost lines are labelled as net cost and shown to admin/manager only', () => {
    const page = src('app/tours/[code]/page.tsx')
    expect(page).toMatch(/canSeeCost = canAccess\(\['admin', 'manager'\]\)/)
    expect(page).toMatch(/canSeeCost && showBreakdown && pricing\.services\.length > 0/)
    expect(page).toMatch(/t\('detail\.netCost'\)/)
    expect(page).not.toMatch(/t\('detail\.subtotal'\)/)
  })
})

// ---------- #8 minimum group size ----------
describe('#8 the minimum group size is offered and enforced', () => {
  it('the picker runs min_pax … max_pax', () => {
    expect(paxChoices(4, 8)).toEqual([4, 5, 6, 7, 8])
    expect(paxChoices(null, 3)).toEqual([1, 2, 3])
    expect(paxChoices(5, 2)).toEqual([5])
  })

  it('calculate-price refuses fewer travellers than the variation runs for, with a clear message', async () => {
    const res = await calculatePrice(post('/api/b2b/calculate-price', { variation_id: 'var-standard', num_pax: 2, travel_date: '2027-05-01' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(belowMinPaxMessage(4, 2))
    expect(belowMinPaxMessage(4, 2)).toMatch(/from 4 travellers/)
    expect(belowMinPaxMessage(4, 4)).toBeNull()
    expect(belowMinPaxMessage(null, 1)).toBeNull()
  })

  it('the page builds its traveller list from paxChoices', () => {
    expect(src('app/tours/[code]/page.tsx')).toMatch(/paxChoices\(tour\.min_pax, tour\.max_pax\)\.map/)
  })
})

// ---------- #10 empty language list ----------
describe('#10 a tour with no version rows reads as English', () => {
  it('an empty list is the base English, not "English missing"', () => {
    expect(tourLanguages([])).toEqual(['en'])
    expect(tourLanguages(undefined)).toEqual(['en'])
    expect(needsVersion([], 'en')).toBe(false)
    expect(needsVersion([], 'ja')).toBe(true)
    expect(needsVersion(['en', 'ja'], 'ja')).toBe(false)
  })
})

// ---------- #7 legacy variation_pricing fallback ----------
describe('#7 the legacy variation_pricing fallback means what the engine price means', () => {
  const fx = buildFxIndex([{ base_currency: 'EUR', target_currency: 'JPY', rate: 160, captured_at: '2026-10-01T00:00:00Z', source: 'ecb' }])
  const opts = { rateCurrency: 'JPY', today: '2026-10-13', fx }

  it('skips a band that does not cover 2 pax, an expired row, and converts the currency', () => {
    const r = cheapestLegacyPrice([
      { price_per_person: 50, currency: 'JPY', min_pax: 10, max_pax: 20, tier: 'budget' },              // 10+ band
      { price_per_person: 60, currency: 'JPY', min_pax: 1, max_pax: 4, valid_to: '2025-12-31', tier: 'budget' }, // expired
      { price_per_person: 1000, currency: 'EUR', min_pax: 2, max_pax: 2, tier: 'standard' },            // ¥160,000
      { price_per_person: 170000, currency: 'JPY', min_pax: 1, max_pax: 6, valid_to: '2027-03-31', tier: 'deluxe' },
    ], opts)
    expect(r).toEqual({ price: 160000, tier: 'standard' })
  })

  it('a blank currency is the column default (EUR), and a row that cannot be converted is left out', () => {
    expect(cheapestLegacyPrice([{ price_per_person: 10, currency: null, min_pax: 1, max_pax: 2 }], opts)).toEqual({ price: 1600, tier: 'standard' })
    expect(cheapestLegacyPrice([{ price_per_person: 10, currency: 'GBP', min_pax: 1, max_pax: 2 }], opts)).toEqual({ price: null, tier: null })
  })
})

// ---------- #6 and the quote button: who sees which buttons ----------
describe('#6 the catalogue hides manager-only buttons from agents; the tour page offers a quote', () => {
  it('Refresh prices, Manage Tours and every delete are behind canManage', () => {
    const page = src('app/tours/tours-browser-page.tsx')
    expect(page).toMatch(/const canManage = canAccess\(\['admin', 'manager'\]\)/)
    expect(page).toMatch(/\{canManage && <button\s+onClick=\{refreshPrices\}/)
    expect(page).toMatch(/\{canManage && <Link\s+href="\/tours\/manage"/)
    // Three delete triggers (grid, list, table), each gated.
    expect(page.match(/setDeleteTarget\(tour\)/g)).toHaveLength(3)
    expect(page.match(/canManage && <(button|>)[\s\S]{0,200}?setDeleteTarget\(tour\)/g)).toHaveLength(3)
  })

  it('the tour page links its variation into the B2B calculator for admin/manager/agent', () => {
    const page = src('app/tours/[code]/page.tsx')
    expect(page).toMatch(/canQuote = canAccess\(\['admin', 'manager', 'agent'\]\)/)
    expect(page).toMatch(/canQuote && tour\.variation_id && <Link\s+href=\{`\/b2b\/calculator\/\$\{tour\.variation_id\}`\}/)
  })

  it('the create-version prompt is shown to admin/manager only', () => {
    expect(src('app/tours/[code]/page.tsx')).toMatch(/showCreatePrompt = canSeeCost && needsVersion\(/)
  })

  it('every new tours.detail key exists in both languages', () => {
    for (const f of ['messages/en.json', 'messages/ja.json']) {
      const d = JSON.parse(src(f)).tours.detail
      for (const k of ['netCost', 'marginLine', 'sellingPriceNote', 'withdrawn', 'quoteThisTour', 'priceIncompleteAskManager']) {
        expect(typeof d[k], `${f} tours.detail.${k}`).toBe('string')
      }
    }
  })
})
