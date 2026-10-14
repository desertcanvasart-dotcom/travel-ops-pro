// Payables: unmatched bills are payables, aging uses one table, and paying an
// expense settles the supplier bill it completes (against a fake database).
import { describe, it, expect, beforeEach } from 'vitest'
import {
  billsCompletedByExpensePayment, expenseDeleteBlocker, payableAgingKey, payExpenseAndSettleBills,
  unmatchedBillRows, PAYABLE_BUCKET_OF_KEY,
} from '@/lib/finance/payables'
import { fakeClient, resetDb, tables } from '../api/_finance-fake-db'

const db = fakeClient as never

describe('payables aging', () => {
  it.each([[-3, 'current'], [0, 'current'], [1, 'days30'], [30, 'days30'], [31, 'days60'], [60, 'days60'], [61, 'days90Plus']] as const)(
    '%i days past due is %s', (days, key) => {
      expect(payableAgingKey(days)).toBe(key)
    })
  it('badge values the page already knows', () => {
    expect(PAYABLE_BUCKET_OF_KEY.days90Plus).toBe('90plus')
    expect(PAYABLE_BUCKET_OF_KEY.days60).toBe('60')
  })
})

describe('unmatched bills are payables', () => {
  const bill = (id: string, status: string) => ({
    id, status, internal_reference: `SI-${id}`, supplier_invoice_number: `N-${id}`, supplier_name: 'Nile Hotels',
    invoice_date: '2026-09-01', due_date: null, amount: '250.00', currency: 'EUR',
  })
  it('a received or approved bill with no expense is a row; a matched one is not (its expense carries it)', () => {
    const rows = unmatchedBillRows(
      [bill('a', 'received'), bill('b', 'approved'), bill('c', 'matched')],
      [{ supplier_invoice_id: 'c' }],
    )
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ kind: 'bill', amount: 250, currency: 'EUR', supplier_name: 'Nile Hotels', expense_date: '2026-09-01' })
  })
  it('paid, disputed and cancelled bills are not owed', () => {
    const rows = unmatchedBillRows([bill('p', 'paid'), bill('d', 'disputed'), bill('x', 'cancelled')], [])
    expect(rows).toEqual([])
  })
})

describe('which bills an expense payment completes', () => {
  const links = [
    { supplier_invoice_id: 'b1', expense_id: 'e1' },
    { supplier_invoice_id: 'b1', expense_id: 'e2' },
    { supplier_invoice_id: 'b2', expense_id: 'e3' },
  ]
  it('an approved bill whose expenses are all paid', () => {
    const status = new Map([['e1', 'paid'], ['e2', 'paid'], ['e3', 'approved']])
    expect(billsCompletedByExpensePayment([{ id: 'b1', status: 'approved' }, { id: 'b2', status: 'approved' }], links, status)).toEqual(['b1'])
  })
  it('not while one of its expenses is still owed', () => {
    const status = new Map([['e1', 'paid'], ['e2', 'approved']])
    expect(billsCompletedByExpensePayment([{ id: 'b1', status: 'approved' }], links, status)).toEqual([])
  })
  it('a bill that is not approved is left for its own steps', () => {
    const status = new Map([['e1', 'paid'], ['e2', 'paid']])
    expect(billsCompletedByExpensePayment([{ id: 'b1', status: 'matched' }], links, status)).toEqual([])
  })
})

describe('paying an expense from Payables', () => {
  beforeEach(() => {
    resetDb({
      expenses: [
        { id: 'e1', org_id: 'o1', status: 'approved', amount: 1000, currency: 'EUR' },
        { id: 'e2', org_id: 'o1', status: 'approved', amount: 500, currency: 'EUR' },
        { id: 'e9', org_id: 'o2', status: 'approved', amount: 10, currency: 'EUR' },
      ],
      supplier_invoices: [
        { id: 'b1', org_id: 'o1', status: 'approved' },
        { id: 'b2', org_id: 'o1', status: 'approved' },
      ],
      supplier_invoice_expenses: [
        { id: 'l1', supplier_invoice_id: 'b1', expense_id: 'e1', matched_amount: 1000 },
        { id: 'l2', supplier_invoice_id: 'b2', expense_id: 'e1', matched_amount: 300 },
        { id: 'l3', supplier_invoice_id: 'b2', expense_id: 'e2', matched_amount: 200 },
      ],
    })
  })
  const bill = (id: string) => tables.supplier_invoices.find(b => b.id === id)!

  it('pays the expense and the approved bill it completes, not a bill with another owed expense', async () => {
    const r = await payExpenseAndSettleBills(db, 'o1', 'e1', { payment_date: '2026-10-14' })
    expect(r.ok).toBe(true)
    expect(tables.expenses.find(e => e.id === 'e1')).toMatchObject({ status: 'paid', payment_date: '2026-10-14' })
    expect(bill('b1').status).toBe('paid')
    expect(bill('b2').status).toBe('approved') // e2 is still owed
  })
  it('the bill is not left approved (it cannot be paid a second time)', async () => {
    await payExpenseAndSettleBills(db, 'o1', 'e1', { payment_date: '2026-10-14' })
    expect(bill('b1').status).not.toBe('approved')
    expect(bill('b1').paid_at).toBeTruthy()
  })
  it('another company expense is not found', async () => {
    const r = await payExpenseAndSettleBills(db, 'o1', 'e9', { payment_date: '2026-10-14' })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(tables.expenses.find(e => e.id === 'e9')!.status).toBe('approved')
  })
  it('an expense already paid is refused, keeping its first payment', async () => {
    await payExpenseAndSettleBills(db, 'o1', 'e2', { payment_date: '2026-10-01' })
    const again = await payExpenseAndSettleBills(db, 'o1', 'e2', { payment_date: '2026-10-14' })
    expect(again).toMatchObject({ ok: false, status: 409 })
    expect(tables.expenses.find(e => e.id === 'e2')!.payment_date).toBe('2026-10-01')
  })
})

describe('the expense delete guard (for the Expenses route)', () => {
  beforeEach(() => {
    resetDb({
      expenses: [
        { id: 'paid', org_id: 'o1', status: 'paid' },
        { id: 'linked', org_id: 'o1', status: 'approved' },
        { id: 'free', org_id: 'o1', status: 'pending' },
      ],
      supplier_invoice_expenses: [{ id: 'l', supplier_invoice_id: 'b', expense_id: 'linked', matched_amount: 5 }],
    })
  })
  it('blocks a paid expense', async () => expect(await expenseDeleteBlocker(db, 'o1', 'paid')).toMatch(/paid/))
  it('blocks one matched to a bill', async () => expect(await expenseDeleteBlocker(db, 'o1', 'linked')).toMatch(/matched/))
  it('lets a free one go', async () => expect(await expenseDeleteBlocker(db, 'o1', 'free')).toBeNull())
})
