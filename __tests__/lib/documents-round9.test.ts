import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { quoteRefsInOrg } from '@/lib/b2b/quote-scope'
import { quoteAmountsInTripCurrency } from '@/lib/b2b/convert-money'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** A db that owns the listed ids per table, and records each read's filters. */
function db(owned: Record<string, string[]>, orgId = 'org-a') {
  const reads: Array<[string, Record<string, unknown>]> = []
  return {
    reads,
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { f[c] = v; return q },
        maybeSingle: async () => {
          reads.push([table, { ...f }])
          return { data: f.org_id === orgId && (owned[table] ?? []).includes(String(f.id)) ? { id: f.id } : null }
        },
      }
      return q
    },
  }
}

describe('quoteRefsInOrg', () => {
  it("refuses another organisation's trip or partner", async () => {
    const d = db({ itineraries: ['it-a'], b2b_partners: ['p-a'] })
    expect(await quoteRefsInOrg(d, 'org-a', { itinerary_id: 'it-a', partner_id: 'p-a' })).toBe(true)
    expect(await quoteRefsInOrg(d, 'org-a', { itinerary_id: 'it-b' })).toBe(false)
    expect(await quoteRefsInOrg(d, 'org-a', { partner_id: 'p-b' })).toBe(false)
    expect(d.reads.every(([, f]) => f.org_id === 'org-a')).toBe(true)
  })
  it('absent references pass; odd ones and no org fail closed', async () => {
    const d = db({})
    expect(await quoteRefsInOrg(d, 'org-a', {})).toBe(true)
    expect(await quoteRefsInOrg(d, 'org-a', { itinerary_id: null, partner_id: '' })).toBe(true)
    expect(await quoteRefsInOrg(d, 'org-a', { itinerary_id: { or: 'x' } })).toBe(false)
    expect(await quoteRefsInOrg(d, '', {})).toBe(false)
  })
})

describe('B2B routes are scoped to the organisation', () => {
  it('quote-from-itinerary and create-template-from-itinerary read only our trip and partner', () => {
    const q = src('app/api/b2b/quote-from-itinerary/route.ts')
    expect(q).toMatch(/\.from\('itineraries'\)\s*\.select\('\*'\)\s*\.eq\('id', itinerary_id\)\s*\.eq\('org_id', orgId\)/)
    expect(q).toMatch(/\.from\('b2b_partners'\)[\s\S]{0,120}\.eq\('org_id', orgId\)/)
    expect(q).toContain('if (!orgId) return noOrgResponse()')
    const t = src('app/api/b2b/create-template-from-itinerary/route.ts')
    expect(t).toMatch(/\.eq\('id', itinerary_id\)\s*\.eq\('org_id', orgId\)/)
  })
  it('creating or editing a quote checks its trip and partner', () => {
    expect(src('app/api/b2b/quotes/route.ts').match(/quoteRefsInOrg\(supabaseAdmin, orgId/g)?.length).toBe(2)
    expect(src('app/api/b2b/quotes/[id]/route.ts')).toContain('quoteRefsInOrg(supabaseAdmin, orgId, updates)')
  })
  it('convert path A reads and updates only our trip', () => {
    const c = src('app/api/b2b/quotes/[id]/convert/route.ts')
    expect(c).toMatch(/\.select\('id, currency, fx_frozen'\)\s*\.eq\('id', quote\.itinerary_id\)\s*\.eq\('org_id', orgId\)/)
    expect(c).toMatch(/\.eq\('id', quote\.itinerary_id\)\s*\.eq\('org_id', orgId\)\s*\.select\('itinerary_code'\)/)
  })
})

describe('quoteAmountsInTripCurrency', () => {
  const quote = { selling_price: 1317, total_cost: 1000, margin_amount: 317, currency: 'EUR' }
  it("puts a EUR quote on a ¥ trip at the trip's rate, in whole yen", () => {
    const rates = { base: 'EUR', rates: { JPY: 160.5 } } as never
    expect(quoteAmountsInTripCurrency(quote, 'JPY', rates)).toEqual({ selling_price: 211379, total_cost: 160500, margin_amount: 50879, currency: 'JPY' })
  })
  it('same currency: unchanged', () => {
    expect(quoteAmountsInTripCurrency(quote, 'EUR', null)).toEqual({ selling_price: 1317, total_cost: 1000, margin_amount: 317, currency: 'EUR' })
  })
  it('no rate: refuses rather than writing EUR amounts under ¥', () => {
    expect(quoteAmountsInTripCurrency(quote, 'JPY', null)).toBeNull()
    expect(quoteAmountsInTripCurrency(quote, 'JPY', { base: 'EUR', rates: {} } as never)).toBeNull()
  })
})
