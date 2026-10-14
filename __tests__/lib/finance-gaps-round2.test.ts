// The pure rules behind the second round of finance fixes:
//   price changes   a pending commission follows its service's price; a paid one
//                   is never changed, only flagged
//   duplicates      a manual commission that repeats one on the books is found
//   extras FX       the trip card converts extra expenses like the P&L: at the
//                   rate on the expense's date, and one with no rate is reported
//   approval        who becomes the approver, and who may not approve
import { describe, it, expect } from 'vitest'
import { planPriceChanges, describePriceChanges } from '@/lib/commission-price-changes'
import type { CommissionContext, CommissionSourceService } from '@/lib/commission-generation'
import { findDuplicateCommission, duplicateCommissionMessage, commissionRef } from '@/lib/commission-fields'
import { convertTripExtras } from '@/lib/itinerary-pl-extras'
import { buildFxIndex } from '@/lib/fx-conversion'
import { approvalDecision } from '@/lib/expense-status'

const ctx: CommissionContext = { orgId: 'o', itineraryId: 'it', itineraryCode: 'T-1', currency: 'EUR', startDate: '2026-07-01' }
const hotel = { id: 'sup-h', name: 'Hotel', commission_type: 'receivable', default_commission_rate: 10 }
const guide = { id: 'sup-g', name: 'Ahmed', commission_type: 'payable', default_commission_rate: 10 }
const service = (over: Partial<CommissionSourceService> = {}): CommissionSourceService => ({
  id: 's1', service_type: 'accommodation', service_name: 'Stay', client_price: 150, total_cost: 100,
  supplier_id: 'sup-h', supplier: hotel, commission_rate: null, commission_status: 'generated', ...over,
})
const existing = (over: Record<string, unknown> = {}) => ({
  id: 'c1', service_id: 's1', supplier_id: 'sup-h', commission_type: 'receivable', description: 'Stay - T-1',
  status: 'pending', base_amount: 100, commission_amount: 10, ...over,
})

describe('planPriceChanges', () => {
  it('does nothing when the price is where the commission left it', () => {
    const plan = planPriceChanges([service()], [existing()], ctx)
    expect(plan).toEqual({ recalculated: [], flagged: [] })
  })

  it('recalculates a pending commission whose service cost changed', () => {
    const plan = planPriceChanges([service({ total_cost: 120 })], [existing()], ctx)
    expect(plan.flagged).toEqual([])
    expect(plan.recalculated).toHaveLength(1)
    const r = plan.recalculated[0]
    expect(r).toMatchObject({ commission_id: 'c1', old_base: 100, new_base: 120, old_amount: 10, new_amount: 12 })
    expect(r.update).toEqual({ base_amount: 120, cost_amount: 120, commission_rate: 10, commission_amount: 12 })
  })

  it('a payable commission follows the profit, so a client price change moves it too', () => {
    const svc = service({ id: 's2', supplier_id: 'sup-g', supplier: guide, client_price: 200, total_cost: 100 })
    const plan = planPriceChanges([svc], [existing({ id: 'c2', service_id: 's2', supplier_id: 'sup-g', commission_type: 'payable', base_amount: 50, commission_amount: 5, description: 'Stay - T-1' })], ctx)
    expect(plan.recalculated[0]).toMatchObject({ old_base: 50, new_base: 100, new_amount: 10 })
  })

  it('never changes a paid or received commission; flags it as price changed since paid', () => {
    for (const status of ['paid', 'received']) {
      const plan = planPriceChanges([service({ total_cost: 120 })], [existing({ status })], ctx)
      expect(plan.recalculated).toEqual([])
      expect(plan.flagged).toEqual([
        expect.objectContaining({ commission_id: 'c1', status, old_base: 100, new_base: 120, label: 'price changed since paid' }),
      ])
    }
  })

  it('does not change an invoiced or disputed one either, and names the state', () => {
    const inv = planPriceChanges([service({ total_cost: 120 })], [existing({ status: 'invoiced' })], ctx)
    expect(inv.recalculated).toEqual([])
    expect(inv.flagged[0].label).toBe('price changed since invoiced')
    const dis = planPriceChanges([service({ total_cost: 120 })], [existing({ status: 'disputed' })], ctx)
    expect(dis.flagged[0].label).toBe('price changed while disputed')
  })

  it('ignores a cancelled commission and a manual one with no service', () => {
    const plan = planPriceChanges([service({ total_cost: 120 })], [existing({ status: 'cancelled' }), existing({ id: 'c9', service_id: null })], ctx)
    expect(plan).toEqual({ recalculated: [], flagged: [] })
  })

  it('flags (does not zero) a pending commission whose service can no longer give it', () => {
    const plan = planPriceChanges([service({ total_cost: 0 })], [existing()], ctx)
    expect(plan.recalculated).toEqual([])
    expect(plan.flagged[0]).toMatchObject({ commission_id: 'c1', new_base: null })
  })

  it('treats a service marked generated as comparable (it is a comparison, not a generation)', () => {
    const plan = planPriceChanges([service({ commission_status: 'generated', total_cost: 130 })], [existing()], ctx)
    expect(plan.recalculated).toHaveLength(1)
  })

  it('keeps the provider and the seller commission of one service apart', () => {
    const svc = service({ total_cost: 100, client_price: 200, sold_by_supplier_id: 'sup-g', seller: guide })
    const provider = existing({ id: 'cp', base_amount: 90, commission_amount: 9 })
    const seller = existing({ id: 'cs', supplier_id: 'sup-g', commission_type: 'payable', base_amount: 100, commission_amount: 10, description: 'Stay — sold by Ahmed - T-1' })
    const plan = planPriceChanges([svc], [provider, seller], ctx)
    // The seller's is current (profit 100); only the provider's base moved (90 -> 100).
    expect(plan.recalculated.map(r => r.commission_id)).toEqual(['cp'])
  })

  it('describes what happened in one line', () => {
    const plan = planPriceChanges([service({ total_cost: 120 }), service({ id: 's2', total_cost: 120 })], [existing(), existing({ id: 'c2', service_id: 's2', status: 'paid' })], ctx)
    expect(describePriceChanges(plan)).toBe('Recalculated 1 pending commission after a price change. Not changed: Stay (price changed since paid).')
    expect(describePriceChanges({ recalculated: [], flagged: [] })).toBe('')
  })
})

describe('findDuplicateCommission', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: '1a2b3c4d-0000-4000-8000-000000000000', itinerary_id: 'it', supplier_id: 'sup-h', source_name: null,
    commission_type: 'receivable', commission_amount: 10, status: 'pending', description: 'Stay - T-1', ...over,
  })
  const candidate = (over: Record<string, unknown> = {}) => ({ id: '', itinerary_id: 'it', supplier_id: 'sup-h', commission_type: 'receivable', commission_amount: 10, ...over })

  it('finds the same trip, supplier, type and amount', () => {
    expect(findDuplicateCommission([row()], candidate())?.id).toBe(row().id)
  })

  it('compares the amount at the cent', () => {
    expect(findDuplicateCommission([row({ commission_amount: '10.00' })], candidate({ commission_amount: 10 }))).not.toBeNull()
    expect(findDuplicateCommission([row({ commission_amount: 10.01 })], candidate())).toBeNull()
  })

  it('differs on trip, supplier or type', () => {
    expect(findDuplicateCommission([row({ itinerary_id: 'other' })], candidate())).toBeNull()
    expect(findDuplicateCommission([row({ supplier_id: 'sup-g' })], candidate())).toBeNull()
    expect(findDuplicateCommission([row({ commission_type: 'payable' })], candidate())).toBeNull()
  })

  it('with no supplier, matches on the source name', () => {
    const a = row({ supplier_id: null, source_name: 'Papyrus Shop' })
    expect(findDuplicateCommission([a], candidate({ supplier_id: null, source_name: ' papyrus shop ' }))).not.toBeNull()
    expect(findDuplicateCommission([a], candidate({ supplier_id: null, source_name: 'Other' }))).toBeNull()
  })

  it('a cancelled commission is not a duplicate; a commission with no trip is never checked', () => {
    expect(findDuplicateCommission([row({ status: 'cancelled' })], candidate())).toBeNull()
    expect(findDuplicateCommission([row()], candidate({ itinerary_id: null }))).toBeNull()
  })

  it('the message names the existing commission by its reference', () => {
    expect(commissionRef(row().id)).toBe('COM-1A2B3C4D')
    expect(duplicateCommissionMessage(row())).toContain('COM-1A2B3C4D')
    expect(duplicateCommissionMessage(row())).toContain('"Stay - T-1"')
  })
})

describe('convertTripExtras', () => {
  // 1 EUR = 160 JPY and 1 EUR = 50 EGP, captured before the expenses.
  const index = buildFxIndex([
    { base_currency: 'EUR', target_currency: 'JPY', rate: 160, captured_at: '2026-01-01T00:00:00Z' },
    { base_currency: 'EUR', target_currency: 'EGP', rate: 50, captured_at: '2026-01-01T00:00:00Z' },
  ])
  const exp = (over: Record<string, unknown> = {}) => ({ amount: 100, currency: 'EUR', expense_date: '2026-03-01', category: 'guide', status: 'pending', ...over })

  it('adds same-currency extras as they are', () => {
    expect(convertTripExtras(index, [exp(), exp({ amount: 50 })], 'EUR')).toEqual({ total: 150, count: 2, missing: [] })
  })

  it('converts at the stored rate for the expense date, not a static one', () => {
    const r = convertTripExtras(index, [exp({ amount: 16000, currency: 'JPY' })], 'EUR')
    expect(r.total).toBe(100)
    expect(r.missing).toEqual([])
  })

  it('leaves out an extra with no rate and reports it, instead of using a static rate or the face value', () => {
    const r = convertTripExtras(index, [exp(), exp({ amount: 1000, currency: 'GBP', expense_number: 'EXP-2026-007' })], 'EUR')
    expect(r.total).toBe(100)
    expect(r.count).toBe(1)
    expect(r.missing).toHaveLength(1)
    expect(r.missing[0]).toMatchObject({ reference: 'EXP-2026-007', amount: 1000, fromCurrency: 'GBP', toCurrency: 'EUR' })
  })

  it('has no rate before the first capture (the date matters)', () => {
    const r = convertTripExtras(index, [exp({ amount: 16000, currency: 'JPY', expense_date: '2025-06-01' })], 'EUR')
    expect(r.total).toBe(0)
    expect(r.missing).toHaveLength(1)
  })

  it('skips rejected and cancelled expenses and a booking supplier cost, as the P&L does', () => {
    const r = convertTripExtras(index, [exp({ status: 'rejected' }), exp({ status: 'cancelled' }), exp({ booking_supplier_status_id: 'b1' }), exp()], 'EUR')
    expect(r).toEqual({ total: 100, count: 1, missing: [] })
  })
})

describe('approvalDecision', () => {
  const now = '2026-10-14T10:00:00.000Z'

  it('the signed-in user becomes the approver when a pending expense is approved', () => {
    expect(approvalDecision({ from: 'pending', to: 'approved', created_by: 'u1' }, 'u2', false, now))
      .toEqual({ ok: true, set: { approved_by: 'u2', approved_at: now } })
  })

  it('paid straight from pending counts as the approval', () => {
    expect(approvalDecision({ from: 'pending', to: 'paid', created_by: 'u1' }, 'u2', false, now))
      .toEqual({ ok: true, set: { approved_by: 'u2', approved_at: now } })
  })

  it('refuses the person who created the expense, unless they are an owner or admin', () => {
    const refused = approvalDecision({ from: 'pending', to: 'approved', created_by: 'u1' }, 'u1', false, now)
    expect(refused.ok).toBe(false)
    expect(approvalDecision({ from: 'pending', to: 'paid', created_by: 'u1' }, 'u1', false, now).ok).toBe(false)
    expect(approvalDecision({ from: 'pending', to: 'approved', created_by: 'u1' }, 'u1', true, now))
      .toEqual({ ok: true, set: { approved_by: 'u1', approved_at: now } })
  })

  it('an expense with no creator on record can be approved by anyone who may approve', () => {
    expect(approvalDecision({ from: 'pending', to: 'approved', created_by: null }, 'u1', false, now).ok).toBe(true)
  })

  it('approved -> paid keeps the approver; rejecting or cancelling leaves it alone', () => {
    expect(approvalDecision({ from: 'approved', to: 'paid', created_by: 'u1' }, 'u1', false, now)).toEqual({ ok: true, set: null })
    expect(approvalDecision({ from: 'approved', to: 'cancelled', created_by: 'u1' }, 'u2', false, now)).toEqual({ ok: true, set: null })
  })

  it('moving back to pending withdraws the approval', () => {
    expect(approvalDecision({ from: 'approved', to: 'pending', created_by: 'u1' }, 'u2', false, now))
      .toEqual({ ok: true, set: { approved_by: null, approved_at: null } })
  })

  it('a rejected expense approved later is an approval (and the creator rule applies)', () => {
    expect(approvalDecision({ from: 'rejected', to: 'approved', created_by: 'u1' }, 'u1', false, now).ok).toBe(false)
  })
})
