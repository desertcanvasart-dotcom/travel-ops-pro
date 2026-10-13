// The dashboard's arithmetic (lib/dashboard/figures.ts), pinned without a
// database. Each block is one audit finding on the Home › Dashboard screen.
import { describe, it, expect } from 'vitest'
import {
  attentionForRole,
  billsWithoutExpenses,
  netReceived,
  quotePipeline,
  receivableTotals,
} from '@/lib/dashboard/figures'

describe('Unpaid Expenses & Bills — a matched bill is not counted twice', () => {
  it('drops a supplier bill that is linked to an expense', () => {
    const bills = [
      { id: 'si-1', amount: 50_000, currency: 'JPY' },
      { id: 'si-2', amount: 20_000, currency: 'JPY' },
    ]
    const links = [{ supplier_invoice_id: 'si-1' }, { supplier_invoice_id: 'si-1' }]
    expect(billsWithoutExpenses(bills, links).map(b => b.id)).toEqual(['si-2'])
  })
  it('keeps every bill when nothing is matched', () => {
    expect(billsWithoutExpenses([{ id: 'a' }, { id: 'b' }], [])).toHaveLength(2)
  })
})

describe('Received This Month — refunds are netted out', () => {
  it('subtracts a refund (positive amount, payment_type refund) and counts it apart', () => {
    const r = netReceived([
      { amount: 100_000, currency: 'JPY', payment_type: 'deposit' },
      { amount: '50000', currency: 'JPY', payment_type: 'balance' },
      { amount: 30_000, currency: 'JPY', payment_type: 'refund' },
      { amount: 70, currency: 'EUR', payment_type: 'deposit' },
    ])
    expect(r.totals).toEqual({ JPY: 120_000, EUR: 70 })
    expect(r.count).toBe(3)
    expect(r.refundCount).toBe(1)
  })
  it('can go negative when only refunds happened', () => {
    expect(netReceived([{ amount: 500, currency: 'USD', payment_type: 'refund' }]).totals).toEqual({ USD: -500 })
  })
})

describe('Outstanding Receivables — overdue means before today', () => {
  const invoices = [
    { balance_due: 100, currency: 'JPY', due_date: '2026-10-11' },
    { balance_due: 200, currency: 'JPY', due_date: '2026-10-12' },
    { balance_due: 400, currency: 'JPY', due_date: null },
  ]
  it('an invoice due today is current, as accounts-receivable ages it', () => {
    const r = receivableTotals(invoices, '2026-10-12')
    expect(r.totals).toEqual({ JPY: 700 })
    expect(r.overdue).toEqual({ JPY: 100 })
  })
})

describe('Quotes Sent / Confirmed include completed trips', () => {
  it('counts completed in both', () => {
    const rows = ['draft', 'sent', 'confirmed', 'completed', 'cancelled'].map(status => ({ status }))
    expect(quotePipeline(rows)).toEqual({ sent: 3, confirmed: 2 })
  })
})

describe('Needs attention, cut to the role', () => {
  const items = [
    { type: 'balance_due', currency: 'JPY', detail: { balanceDue: 99_000, dueDate: '2026-10-20', overdue: false } },
    { type: 'reply_overdue', detail: { conversationId: 'c1' } },
    { type: 'no_guide', detail: {} },
  ]
  it('a viewer gets no customer emails and no balance amounts', () => {
    const out = attentionForRole(items, 'viewer')
    expect(out.map(i => i.type)).toEqual(['balance_due', 'no_guide'])
    expect(out[0].detail).toEqual({ dueDate: '2026-10-20', overdue: false })
    expect(out[0].currency).toBeNull()
  })
  it('an agent gets the emails but not the amounts', () => {
    const out = attentionForRole(items, 'agent')
    expect(out.map(i => i.type)).toEqual(['balance_due', 'reply_overdue', 'no_guide'])
    expect(out[0].detail).not.toHaveProperty('balanceDue')
  })
  it('a manager and the owner get everything', () => {
    for (const role of ['manager', 'owner', 'admin']) {
      const out = attentionForRole(items, role)
      expect(out).toHaveLength(3)
      expect(out[0].detail.balanceDue).toBe(99_000)
      expect(out[0].currency).toBe('JPY')
    }
  })
  it('no role gets nothing private', () => {
    expect(attentionForRole(items, null).map(i => i.type)).toEqual(['balance_due', 'no_guide'])
  })
})
