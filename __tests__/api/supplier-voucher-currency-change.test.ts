// Changing a voucher's currency after lines were added only relabelled the
// amounts: €1,200 of lines became "¥1,200". PUT /api/supplier-documents/[id]
// now converts every amount (lines, picker lists, total) at the trip's frozen
// rate, else today's, and refuses when no rate is known — it never writes a
// new currency over unconverted amounts.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  convertVoucherMoney, planCurrencyChange, voucherHasMoney,
} from '@/lib/documents/voucher-currency'

const db = vi.hoisted(() => {
  const log: { table: string; ops: { op: string; args: unknown[] }[] }[] = []
  const state = { stored: null as Record<string, unknown> | null }
  function chain(table: string) {
    const entry = { table, ops: [] as { op: string; args: unknown[] }[] }
    log.push(entry)
    const answer = () => {
      const update = entry.ops.find(o => o.op === 'update')
      if (update) return { data: { id: 'doc-1', ...(update.args[0] as object) }, error: null }
      return { data: state.stored, error: null }
    }
    const proxy: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: any) => resolve(answer())
        if (prop === 'single' || prop === 'maybeSingle') return async () => answer()
        return (...args: unknown[]) => { entry.ops.push({ op: prop, args }); return proxy }
      },
    })
    return proxy
  }
  return { log, state, client: { from: (t: string) => chain(t) } }
})

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => db.client }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
const liveRates = vi.hoisted(() => ({ value: { base: 'EUR', date: '2026-10-13', rates: { EUR: 1, JPY: 160, USD: 1.1 } as Record<string, number> } }))
vi.mock('@/lib/rates/fx-source', () => ({ fetchRunExchangeRates: async () => liveRates.value }))

import { PUT } from '@/app/api/supplier-documents/[id]/route'

const params = { params: Promise.resolve({ id: 'doc-1' }) } as never
const put = (body: unknown) => PUT(new Request('http://x/api', { method: 'PUT', body: JSON.stringify(body) }) as never, params)
const written = () => {
  const e = db.log.find(l => l.ops.some(o => o.op === 'update'))
  return e ? (e.ops.find(o => o.op === 'update')!.args[0] as Record<string, any>) : null
}

const EUR_VOUCHER = {
  currency: 'EUR',
  total_cost: 1200,
  services: [{ service_name: 'Dinner', quantity: 2, unit_rate: 600, total_cost: 1200, supplier_cost_original: 1200, supplier_currency: 'EUR' }],
  selected_routes: null,
  selected_meals: [{ rate_id: 'm1', unit_rate: 600, total_cost: 1200, quantity: 2 }],
  selected_guides: null,
  selected_attractions: [],
}

beforeEach(() => {
  db.log.length = 0
  db.state.stored = { ...EUR_VOUCHER, itinerary: { fx_frozen: null } }
  liveRates.value = { base: 'EUR', date: '2026-10-13', rates: { EUR: 1, JPY: 160, USD: 1.1 } }
})

describe('the rule (lib/documents/voucher-currency)', () => {
  it('converts every money field, rounded to the new currency, and leaves the rest', () => {
    const out = convertVoucherMoney({ ...EUR_VOUCHER, selected_attractions: [{ id: 'a', eur_rate: 10.555, non_eur_rate: 20, quantity: 3 }] }, 160.333, 'JPY')
    expect(out.total_cost).toBe(192_400)
    expect((out.services as any[])[0]).toMatchObject({ unit_rate: 96_200, total_cost: 192_400, quantity: 2, supplier_cost_original: 1200 })
    expect((out.selected_meals as any[])[0]).toMatchObject({ unit_rate: 96_200, total_cost: 192_400 })
    expect((out.selected_attractions as any[])[0]).toMatchObject({ eur_rate: 1692, non_eur_rate: 3207, quantity: 3 })
    expect(out.selected_routes).toBeNull()
    expect(convertVoucherMoney({ total_cost: 1000 }, 1 / 160, 'EUR')).toEqual({ total_cost: 6.25 })
  })

  it('a voucher with no amounts has nothing to convert', () => {
    expect(voucherHasMoney({ total_cost: 0, services: [], selected_attractions: [] })).toBe(false)
    expect(voucherHasMoney({ total_cost: 0, services: [{ total_cost: 5 }] })).toBe(true)
    expect(planCurrencyChange({ currency: 'EUR', total_cost: 0, services: [] }, { currency: 'JPY' })).toEqual({ kind: 'none' })
  })

  it('a new currency over stored amounts converts them; the same currency does nothing', () => {
    expect(planCurrencyChange(EUR_VOUCHER, { currency: 'JPY' })).toEqual({ kind: 'convert', from: 'EUR', to: 'JPY' })
    expect(planCurrencyChange(EUR_VOUCHER, { currency: 'EUR', total_cost: 5 })).toEqual({ kind: 'none' })
    expect(planCurrencyChange(EUR_VOUCHER, { status: 'sent' })).toEqual({ kind: 'none' })
  })

  it('amounts sent in a currency other than the stored one must include every stored list', () => {
    const r = planCurrencyChange(EUR_VOUCHER, { currency: 'USD', total_cost: 10 }, 'JPY')
    expect(r).toMatchObject({ kind: 'refuse', status: 409 })
    expect(planCurrencyChange(EUR_VOUCHER, { ...EUR_VOUCHER, currency: 'USD' }, 'JPY')).toEqual({ kind: 'convert', from: 'JPY', to: 'USD' })
  })
})

describe('PUT /api/supplier-documents/[id]', () => {
  it('a bare currency change converts the stored amounts at today\'s rate', async () => {
    const res = await put({ currency: 'JPY' })
    expect(res.status).toBe(200)
    const w = written()!
    expect(w.currency).toBe('JPY')
    expect(w.total_cost).toBe(192_000)
    expect(w.services[0]).toMatchObject({ unit_rate: 96_000, total_cost: 192_000 })
    expect(w.selected_meals[0]).toMatchObject({ unit_rate: 96_000, total_cost: 192_000 })
    expect((await res.json()).converted).toEqual({ kind: 'convert', from: 'EUR', to: 'JPY', fx: 160 })
  })

  it("the editor's save: amounts sent in the old currency are converted", async () => {
    const res = await put({ ...EUR_VOUCHER, total_cost: 1500, currency: 'JPY', amounts_currency: 'EUR' })
    expect(res.status).toBe(200)
    expect(written()!.total_cost).toBe(240_000)
  })

  it("the trip's frozen rate wins over today's", async () => {
    db.state.stored = { ...EUR_VOUCHER, itinerary: { fx_frozen: { base: 'EUR', rates: { EUR: 1, JPY: 150 }, frozen_at: '2026-09-01', source: 'confirm' } } }
    await put({ currency: 'JPY' })
    expect(written()!.total_cost).toBe(180_000)
  })

  it('refuses, and writes nothing, when no rate is known', async () => {
    liveRates.value = { base: 'EUR', date: '2026-10-13', rates: { EUR: 1 } }
    const res = await put({ currency: 'GBP' })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/No exchange rate from EUR to GBP/)
    expect(written()).toBeNull()
  })

  it('a save in the same currency converts nothing', async () => {
    const res = await put({ ...EUR_VOUCHER, total_cost: 1300, amounts_currency: 'EUR' })
    expect(res.status).toBe(200)
    expect(written()!.total_cost).toBe(1300)
  })

  it('a voucher with no amounts is just relabelled', async () => {
    db.state.stored = { currency: 'EUR', total_cost: 0, services: [], selected_attractions: [], itinerary: null }
    liveRates.value = { base: 'EUR', date: '2026-10-13', rates: { EUR: 1 } }
    const res = await put({ currency: 'GBP' })
    expect(res.status).toBe(200)
    expect(written()).toMatchObject({ currency: 'GBP' })
  })

  it('amounts_currency is not a column', async () => {
    await put({ ...EUR_VOUCHER, amounts_currency: 'EUR' })
    expect(written()).not.toHaveProperty('amounts_currency')
  })
})

describe('the edit page', () => {
  const page = readFileSync('app/documents/supplier/[id]/edit/page.tsx', 'utf8')
  it('changes the currency through the converting save, never a bare relabel of amounts', () => {
    expect(page).toContain('onChange={(e) => changeCurrency(e.target.value)}')
    expect(page).not.toContain("onChange={(e) => setDocument({ ...document, currency: e.target.value })}")
    expect(page).toContain('JSON.stringify({ ...body, currency: next, amounts_currency: current })')
    expect(page).toContain("amounts_currency: editableFields.currency || 'EUR'")
  })
})
