// Finance (customer side), second round, the pure parts:
//   * one ledger per trip: totals never count a trip's money twice;
//   * the amount an invoice bills is worked out from the trip, and a manual
//     override is for an admin or manager with a reason.
import { describe, it, expect } from 'vitest'
import { countableTripPayments, invoicedTripIds, isOnInvoicedTrip, tripHasInvoiceMessage } from '@/lib/payments/ledger'
import { paymentStats } from '@/lib/payments/stats'
import {
  amountsDiffer,
  canOverrideInvoiceAmount,
  loadTripInvoiceBase,
  parseAmountOverride,
  plannedTourAmount,
  reconcileLineItems,
} from '@/lib/invoices/server-amounts'

const TODAY = '2026-10-14'

describe('one ledger per trip', () => {
  const invoices = [
    { id: 'i1', itinerary_id: 't-live', status: 'sent', invoice_number: 'INV-1', currency: 'JPY', balance_due: 0, invoice_payments: [{ amount: 30000, currency: 'JPY', payment_date: '2026-10-02' }] },
    { id: 'i2', itinerary_id: 't-draft', status: 'draft', invoice_number: 'INV-2', currency: 'JPY', balance_due: 0, invoice_payments: [] },
    { id: 'i3', itinerary_id: 't-gone', status: 'cancelled', invoice_number: 'INV-3', currency: 'JPY', balance_due: 0, invoice_payments: [] },
  ]
  const trip = (itinerary_id: string, amount: number) => ({ itinerary_id, amount, currency: 'JPY', payment_status: 'completed', payment_type: 'deposit', payment_date: '2026-10-03' })

  it('a trip has an invoice when one is not cancelled (a draft counts)', () => {
    expect([...invoicedTripIds(invoices)].sort()).toEqual(['t-draft', 't-live'])
    expect(isOnInvoicedTrip({ itinerary_id: 't-live' }, invoicedTripIds(invoices))).toBe(true)
    expect(isOnInvoicedTrip({ itinerary_id: 't-gone' }, invoicedTripIds(invoices))).toBe(false)
    expect(isOnInvoicedTrip({ itinerary_id: null }, invoicedTripIds(invoices))).toBe(false)
  })

  it('trip payments of an invoiced trip are skipped; the others count', () => {
    const kept = countableTripPayments([trip('t-live', 1), trip('t-gone', 2), trip('t-none', 3)], invoices)
    expect(kept.map(p => p.amount)).toEqual([2, 3])
  })

  it('Payments tiles: a legacy trip with BOTH ledgers counts its invoice payments once', () => {
    // The same ¥30,000 deposit was entered on the trip and on the invoice.
    const stats = paymentStats([trip('t-live', 30000)], invoices, TODAY)
    expect(stats.totalReceived).toEqual({ JPY: 30000 })
    expect(stats.thisMonthRevenue).toEqual({ JPY: 30000 })
  })

  it('Payments tiles: a trip with no live invoice still counts its own payments', () => {
    const stats = paymentStats([trip('t-live', 30000), trip('t-gone', 5000), trip('t-none', 7000)], invoices, TODAY)
    expect(stats.totalReceived).toEqual({ JPY: 30000 + 5000 + 7000 })
  })

  it('the refusal names the invoice and says where to record the money', () => {
    const message = tripHasInvoiceMessage(['INV-1', 'INV-1-FIN'])
    expect(message).toContain('INV-1, INV-1-FIN')
    expect(message).toContain('Record the payment against the invoice')
  })
})

describe('the amount an invoice bills', () => {
  it('a full invoice is the trip total; a deposit its percent, to the currency\'s unit', () => {
    expect(plannedTourAmount({ invoiceType: 'standard', tripNet: 1854367, depositPercent: 20, currency: 'JPY' })).toBe(1854367)
    expect(plannedTourAmount({ invoiceType: 'deposit', tripNet: 1854367, depositPercent: 20, currency: 'JPY' })).toBe(370873)
    expect(plannedTourAmount({ invoiceType: 'deposit', tripNet: 1000.5, depositPercent: 30, currency: 'EUR' })).toBe(300.15)
  })

  it('a final is the trip less the deposit invoice\'s net, else less the percent', () => {
    expect(plannedTourAmount({ invoiceType: 'final', tripNet: 1000000, depositPercent: 20, currency: 'JPY', parentNet: 150000 })).toBe(850000)
    expect(plannedTourAmount({ invoiceType: 'final', tripNet: 1000000, depositPercent: 20, currency: 'JPY' })).toBe(800000)
    // a deposit larger than the trip leaves nothing, not a negative bill
    expect(plannedTourAmount({ invoiceType: 'final', tripNet: 100, depositPercent: 20, currency: 'JPY', parentNet: 500 })).toBe(0)
  })

  it('deposit and final add up to the trip', () => {
    const deposit = plannedTourAmount({ invoiceType: 'deposit', tripNet: 1854367, depositPercent: 20, currency: 'JPY' })
    const final = plannedTourAmount({ invoiceType: 'final', tripNet: 1854367, depositPercent: 20, currency: 'JPY', parentNet: deposit })
    expect(deposit + final).toBe(1854367)
  })

  it('the base is the trip as the itinerary page shows it: client prices, default margin, season supplement', async () => {
    const tables: Record<string, any[]> = {
      itineraries: [{ id: 't', org_id: 'o', currency: 'jpy', total_cost: 1, season_uplift_amount: 50000 }],
      itinerary_days: [{ id: 'd1', itinerary_id: 't' }],
      itinerary_services: [
        { itinerary_day_id: 'd1', total_cost: 300000, client_price: 400000 },
        { itinerary_day_id: 'd1', total_cost: 200000, client_price: null },
      ],
    }
    const db = fakeDb(tables)
    expect(await loadTripInvoiceBase(db, 'o', 't')).toEqual({ net: 700000, currency: 'JPY' })
    expect(await loadTripInvoiceBase(db, 'other-org', 't')).toBeNull()
  })

  it('a read failure is an error, never a quiet fall-back to a stale stored total', async () => {
    const db = fakeDb({ itineraries: [{ id: 't', org_id: 'o', total_cost: 5 }], itinerary_days: [{ id: 'd1', itinerary_id: 't' }] }, 'itinerary_services')
    await expect(loadTripInvoiceBase(db, 'o', 't')).rejects.toThrow('could not read the lines')
  })
})

describe('manual override', () => {
  it('admin, manager and owner may; agent, viewer and no role may not', () => {
    for (const role of ['admin', 'manager', 'owner']) expect(canOverrideInvoiceAmount(role)).toBe(true)
    for (const role of ['agent', 'viewer', null, undefined, 'nonsense']) expect(canOverrideInvoiceAmount(role as string | null)).toBe(false)
  })

  it('absent is no override; present needs an amount and a reason', () => {
    expect(parseAmountOverride(undefined, 'agent')).toEqual({ ok: true, override: null })
    expect(parseAmountOverride({ amount: 90, reason: ' Loyal client ' }, 'manager')).toEqual({ ok: true, override: { amount: 90, reason: 'Loyal client' } })
    expect(parseAmountOverride({ amount: '90', reason: 'x' }, 'admin')).toMatchObject({ ok: true })
    for (const bad of [{ amount: 90 }, { amount: 90, reason: '' }, { amount: -1, reason: 'x' }, { amount: NaN, reason: 'x' }, { reason: 'x' }, [], 'y']) {
      expect(parseAmountOverride(bad, 'manager'), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 })
    }
    expect(parseAmountOverride({ amount: 90, reason: 'r'.repeat(501) }, 'manager')).toMatchObject({ ok: false, status: 400 })
  })

  it('an agent sending one is refused, not ignored', () => {
    expect(parseAmountOverride({ amount: 90, reason: 'r' }, 'agent')).toMatchObject({ ok: false, status: 403 })
  })

  it('amounts differ by the currency\'s smallest unit', () => {
    expect(amountsDiffer(1000.4, 1000, 'JPY')).toBe(false)
    expect(amountsDiffer(1001, 1000, 'JPY')).toBe(true)
    expect(amountsDiffer(10.004, 10, 'EUR')).toBe(false)
    expect(amountsDiffer(10.01, 10, 'EUR')).toBe(true)
  })
})

describe('line items of a trip invoice', () => {
  it('kept when they add up, replaced by one line when they do not', () => {
    const mine = [{ description: 'Trip', quantity: 1, unit_price: 90, amount: 90 }, { description: 'Season', quantity: 1, unit_price: 10, amount: 10 }]
    expect(reconcileLineItems(mine, 100, 'JPY', 'Tour Package')).toEqual(mine)
    expect(reconcileLineItems(mine, 120, 'JPY', 'Tour Package')).toEqual([{ description: 'Trip', quantity: 1, unit_price: 120, amount: 120 }])
    expect(reconcileLineItems([], 120, 'JPY', 'Tour Package')).toEqual([{ description: 'Tour Package', quantity: 1, unit_price: 120, amount: 120 }])
  })
})

// A just-enough query builder for loadTripInvoiceBase: eq / in / select / maybeSingle.
function fakeDb(tables: Record<string, any[]>, failTable?: string) {
  return {
    from(table: string) {
      let rows = tables[table] ?? []
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] === val); return builder },
        in: (col: string, vals: unknown[]) => { rows = rows.filter(r => vals.includes(r[col])); return builder },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve(table === failTable ? { data: null, error: { message: 'boom' } } : { data: rows, error: null }),
      }
      return builder
    },
  }
}
