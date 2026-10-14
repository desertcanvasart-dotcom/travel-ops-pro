// Finance fixes: commission price flags on every list load, a supplier rate
// change alone being caught by the recalculation, and the commission number
// shown / quoted instead of the id-derived reference.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { planPriceChanges } from '@/lib/commission-price-changes'
import { duplicateCommissionMessage, commissionRef } from '@/lib/commission-fields'
import type { CommissionContext, CommissionSourceService } from '@/lib/commission-generation'

// ---- a stub of the supabase query builder: every filter returns the chain, a table answers with its rows
const tables: Record<string, any[]> = {}
const stub = {
  from: (table: string) => {
    const chain: any = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'not', 'order', 'gte', 'lte', 'insert']) chain[m] = () => chain
    chain.single = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null })
    chain.then = (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej)
    return chain
  },
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => stub }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'o1',
  noOrgResponse: () => new Response(null, { status: 403 }),
  requireRole: async () => null,
}))

const ctx: CommissionContext = { orgId: 'o1', itineraryId: 'it1', itineraryCode: 'T-1', currency: 'EUR', startDate: '2026-07-01' }
const hotel = { id: 'sup-h', name: 'Hotel', commission_type: 'receivable', default_commission_rate: 10 }
const service = (over: Partial<CommissionSourceService> = {}): CommissionSourceService => ({
  id: 's1', service_type: 'accommodation', service_name: 'Stay', client_price: 150, total_cost: 100,
  supplier_id: 'sup-h', supplier: hotel, commission_rate: null, commission_status: 'generated', ...over,
})
const existing = (over: Record<string, unknown> = {}) => ({
  id: 'c1', service_id: 's1', supplier_id: 'sup-h', commission_type: 'receivable', description: 'Stay - T-1',
  status: 'pending', base_amount: 100, cost_amount: 100, commission_rate: 10, commission_amount: 10, ...over,
})

describe('planPriceChanges: a rate change alone, and the service figures', () => {
  it('recalculates a pending commission when only the supplier rate changed (same cost, same base)', () => {
    const plan = planPriceChanges([service({ supplier: { ...hotel, default_commission_rate: 15 } })], [existing()], ctx)
    expect(plan.recalculated).toHaveLength(1)
    expect(plan.recalculated[0]).toMatchObject({ old_base: 100, new_base: 100, old_amount: 10, new_amount: 15 })
    expect(plan.recalculated[0].update.commission_rate).toBe(15)
  })

  it('flags a paid commission when only the rate changed', () => {
    const plan = planPriceChanges([service({ supplier: { ...hotel, default_commission_rate: 15 } })], [existing({ status: 'paid' })], ctx)
    expect(plan.recalculated).toEqual([])
    expect(plan.flagged[0]).toMatchObject({ commission_id: 'c1', label: 'price changed since paid' })
  })

  it('a payable commission whose cost and client price moved together (profit unchanged) is still caught by the cost', () => {
    const guide = { id: 'sup-g', name: 'Ahmed', commission_type: 'payable', default_commission_rate: 10 }
    const svc = service({ id: 's2', supplier_id: 'sup-g', supplier: guide, client_price: 250, total_cost: 150 })
    const row = existing({ id: 'c2', service_id: 's2', supplier_id: 'sup-g', commission_type: 'payable', base_amount: 100, cost_amount: 100, commission_amount: 10 })
    const plan = planPriceChanges([svc], [row], ctx)
    expect(plan.recalculated[0]).toMatchObject({ commission_id: 'c2', old_base: 100, new_base: 100, service_cost: 150, service_client_price: 250 })
    expect(plan.recalculated[0].update.cost_amount).toBe(150)
  })

  it('reports the current service cost and client price on a flag too', () => {
    const plan = planPriceChanges([service({ total_cost: 120 })], [existing({ status: 'received' })], ctx)
    expect(plan.flagged[0]).toMatchObject({ service_cost: 120, service_client_price: 150 })
  })

  it('a commission that never stored a cost or rate (older row) is not "changed" by the missing columns', () => {
    const plan = planPriceChanges([service()], [existing({ cost_amount: null, commission_rate: null })], ctx)
    expect(plan).toEqual({ recalculated: [], flagged: [] })
  })
})

describe('GET /api/commissions: price_changed_status on every load', () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k]
    tables.itineraries = [{ id: 'it1', itinerary_code: 'T-1', currency: 'EUR', start_date: '2026-07-01', client: null }]
    tables.itinerary_days = [{ id: 'd1' }]
  })
  const svcRow = (cost: number) => ({
    id: 's1', service_type: 'accommodation', service_name: 'Stay', client_price: 150, total_cost: cost, supplier_id: 'sup-h',
    commission_rate: null, commission_status: 'generated', sold_by_supplier_id: null,
    supplier: { ...hotel, org_id: 'o1' }, seller: null,
  })
  const get = async () => {
    const { GET } = await import('@/app/api/commissions/route')
    const res = await GET(new NextRequest('http://x/api/commissions'))
    return (await res.json()).data as Array<Record<string, unknown>>
  }

  it('marks a paid commission whose service price moved, with no Recalculate press', async () => {
    tables.itinerary_services = [svcRow(120)]
    tables.commissions = [
      { ...existing({ status: 'paid' }), org_id: 'o1', itinerary_id: 'it1', commission_amount: 10, currency: 'EUR' },
      { ...existing({ id: 'c2', status: 'pending' }), org_id: 'o1', itinerary_id: 'it1', commission_amount: 10, currency: 'EUR' },
    ]
    const rows = await get()
    expect(rows.find(r => r.id === 'c1')?.price_changed_status).toBe('paid')
    // A pending commission is recalculated by Recalculate, not flagged here.
    expect(rows.find(r => r.id === 'c2')?.price_changed_status).toBeUndefined()
  })

  it('no flag when the price is where the commission left it', async () => {
    tables.itinerary_services = [svcRow(100)]
    tables.commissions = [{ ...existing({ status: 'received' }), org_id: 'o1', itinerary_id: 'it1', commission_amount: 10, currency: 'EUR' }]
    const rows = await get()
    expect(rows[0].price_changed_status).toBeUndefined()
  })
})

describe('commission number in messages', () => {
  it('the duplicate message names the commission number, not the id-derived reference', () => {
    const msg = duplicateCommissionMessage({ id: '1a2b3c4d-0000-4000-8000-000000000000', commission_number: 'COM-2026-014', description: 'Stay - T-1' })
    expect(msg).toContain('Commission COM-2026-014 "Stay - T-1" already records this')
    expect(msg).not.toContain(commissionRef('1a2b3c4d-0000-4000-8000-000000000000'))
  })

  it('falls back to the id-derived reference for a row without a number', () => {
    expect(duplicateCommissionMessage({ id: '1a2b3c4d-0000-4000-8000-000000000000' })).toContain('COM-1A2B3C4D')
  })
})
