// Supplier bills: duplicate detection, field validation, dispute resolution,
// match validation, partial-payment settlement, the unfiltered summary, and the
// rate autofill currency rule.
import { describe, it, expect } from 'vitest'
import {
  checkMatchableExpenses, expensesSettledByPaidBills, isSameBill, normalizeBillFields, rateUnitPrice,
  statusAfterDispute, summarizeBills, DELETABLE_BILL_STATUSES, BILL_STATUSES,
} from '@/lib/finance/supplier-bills'

describe('the same bill entered twice', () => {
  const a = { supplier_invoice_number: 'INV-100', supplier_name: 'Nile Hotels', supplier_id: 's1' }
  it('same supplier and number, whatever the case or spacing', () => {
    expect(isSameBill(a, { supplier_invoice_number: ' inv-100 ', supplier_name: 'nile hotels ', supplier_id: null })).toBe(true)
  })
  it('the same supplier record under a different name', () => {
    expect(isSameBill(a, { supplier_invoice_number: 'INV-100', supplier_name: 'Nile Hotels Ltd', supplier_id: 's1' })).toBe(true)
  })
  it('another supplier with the same number is a different bill', () => {
    expect(isSameBill(a, { supplier_invoice_number: 'INV-100', supplier_name: 'Cairo Cars', supplier_id: 's2' })).toBe(false)
  })
  it('another number from the same supplier is a different bill', () => {
    expect(isSameBill(a, { supplier_invoice_number: 'INV-101', supplier_name: 'Nile Hotels', supplier_id: 's1' })).toBe(false)
  })
  it('a blank number never matches', () => {
    expect(isSameBill({ supplier_invoice_number: '', supplier_name: 'x' }, { supplier_invoice_number: '', supplier_name: 'x' })).toBe(false)
  })
})

describe('bill field validation (create and edit)', () => {
  it('rejects a negative, NaN or blank amount', () => {
    for (const amount of [-5, 'abc', '', null, NaN]) {
      expect(normalizeBillFields({ amount }, true), String(amount)).toBe('amount must be a non-negative number')
    }
  })
  it('accepts zero and a numeric string, as a number', () => {
    const b: Record<string, unknown> = { amount: '12.50' }
    expect(normalizeBillFields(b, true)).toBeNull()
    expect(b.amount).toBe(12.5)
    expect(normalizeBillFields({ amount: 0 }, true)).toBeNull()
  })
  it('an edit that does not send an amount is not asked for one; a create is', () => {
    expect(normalizeBillFields({ notes: 'x' }, true)).toBeNull()
    expect(normalizeBillFields({}, false)).toBe('amount must be a non-negative number')
  })
  it('rejects a negative tax', () => {
    expect(normalizeBillFields({ amount: 1, tax_amount: -1 }, false)).toBe('tax_amount must be a non-negative number')
  })
  it('an emptied due date becomes null instead of a 500', () => {
    const b: Record<string, unknown> = { amount: 1, due_date: '' }
    expect(normalizeBillFields(b, true)).toBeNull()
    expect(b.due_date).toBeNull()
  })
  it('an emptied invoice date is refused on edit', () => {
    expect(normalizeBillFields({ invoice_date: '' }, true)).toBe('invoice_date cannot be empty')
  })
})

describe('statuses a bill can have', () => {
  it('everything that may be deleted is a real status (draft and pending are not)', () => {
    for (const s of DELETABLE_BILL_STATUSES) expect(BILL_STATUSES).toContain(s)
    expect(BILL_STATUSES).not.toContain('draft')
    expect(BILL_STATUSES).not.toContain('pending')
  })
  it('only a bill nobody approved or paid is deletable', () => {
    expect([...DELETABLE_BILL_STATUSES].sort()).toEqual(['matched', 'received'])
  })
  it('resolving a dispute returns to what the match says', () => {
    expect(statusAfterDispute('matched')).toBe('matched')
    expect(statusAfterDispute('partial')).toBe('received')
    expect(statusAfterDispute('unmatched')).toBe('received')
    expect(statusAfterDispute(null)).toBe('received')
  })
})

describe('which expenses may be matched to a bill', () => {
  const bill = { supplier_id: 's1', supplier_name: 'Nile Hotels' }
  const ok = { id: 'e1', status: 'pending', supplier_id: 's1', supplier_name: 'Nile Hotels' }
  it('accepts a pending or approved expense of the same supplier', () => {
    expect(checkMatchableExpenses(bill, ['e1', 'e2'], [ok, { ...ok, id: 'e2', status: 'approved' }])).toBeNull()
  })
  it('refuses a paid expense with a 409', () => {
    const r = checkMatchableExpenses(bill, ['e1'], [{ ...ok, status: 'paid' }])
    expect(r?.status).toBe(409)
    expect(r?.details.expense_ids).toEqual(['e1'])
  })
  it('refuses a rejected or cancelled one', () => {
    expect(checkMatchableExpenses(bill, ['e1'], [{ ...ok, status: 'rejected' }])?.status).toBe(409)
    expect(checkMatchableExpenses(bill, ['e1'], [{ ...ok, status: 'cancelled' }])?.status).toBe(409)
  })
  it('refuses another supplier, by id or by name', () => {
    expect(checkMatchableExpenses(bill, ['e1'], [{ ...ok, supplier_id: 's9', supplier_name: 'Nile Hotels' }])?.error).toMatch(/same supplier/)
    expect(checkMatchableExpenses({ supplier_name: 'Nile Hotels' }, ['e1'], [{ ...ok, supplier_id: null, supplier_name: 'Cairo Cars' }])?.status).toBe(409)
  })
  it('matches by name when ids are missing, ignoring case and spaces', () => {
    expect(checkMatchableExpenses({ supplier_name: 'Nile Hotels' }, ['e1'], [{ ...ok, supplier_id: null, supplier_name: ' nile hotels' }])).toBeNull()
  })
  it('names an id that does not exist instead of dropping it', () => {
    const r = checkMatchableExpenses(bill, ['e1', 'ghost'], [ok])
    expect(r?.status).toBe(404)
    expect(r?.details.expense_ids).toEqual(['ghost'])
  })
})

describe('paying a bill settles only what it covers', () => {
  const expense = { id: 'e1', amount: 1000, status: 'approved' }
  it('an expense matched for 600 stays owed after that bill is paid', () => {
    const settled = expensesSettledByPaidBills([expense], [{ expense_id: 'e1', matched_amount: 600, bill_status: 'paid' }])
    expect(settled).toEqual([])
  })
  it('settled once the bills paid against it cover it', () => {
    const settled = expensesSettledByPaidBills([expense], [
      { expense_id: 'e1', matched_amount: 600, bill_status: 'paid' },
      { expense_id: 'e1', matched_amount: 400, bill_status: 'paid' },
    ])
    expect(settled).toEqual(['e1'])
  })
  it('a match on a bill that is not paid yet does not count', () => {
    const settled = expensesSettledByPaidBills([expense], [
      { expense_id: 'e1', matched_amount: 600, bill_status: 'paid' },
      { expense_id: 'e1', matched_amount: 400, bill_status: 'approved' },
    ])
    expect(settled).toEqual([])
  })
  it('a fully matched expense is paid; a rejected one is left alone', () => {
    expect(expensesSettledByPaidBills([expense], [{ expense_id: 'e1', matched_amount: 1000, bill_status: 'paid' }])).toEqual(['e1'])
    expect(expensesSettledByPaidBills([{ ...expense, status: 'rejected' }], [{ expense_id: 'e1', matched_amount: 1000, bill_status: 'paid' }])).toEqual([])
  })
})

describe('the list summary', () => {
  const all = [
    { status: 'paid', match_status: 'matched', amount: 100, currency: 'EUR' },
    { status: 'received', match_status: 'unmatched', amount: 50, currency: 'EUR' },
    { status: 'matched', match_status: 'matched', amount: 70, currency: 'USD' },
    { status: 'cancelled', match_status: 'unmatched', amount: 999, currency: 'EUR' },
  ]
  it('counts every bill, not the filtered rows, and leaves cancelled out of Total and Unmatched', () => {
    const s = summarizeBills(all)
    expect(s.total).toBe(3)
    expect(s.unmatched).toBe(1)
    expect(s.paid).toBe(1)
    expect(s.matched_pending).toBe(1)
    expect(s.cancelled).toBe(1)
  })
  it('keeps amounts per currency', () => {
    expect(summarizeBills(all).total_by_currency).toEqual({ EUR: 150, USD: 70 })
  })
})

describe('rate autofill only in the bill currency', () => {
  const eurRate = { base_rate_eur: 80 }
  it('a EUR rate fills a EUR bill', () => expect(rateUnitPrice(eurRate, 'EUR')).toBe(80))
  it('a EUR rate is not copied into a USD, EGP or JPY bill', () => {
    for (const c of ['USD', 'EGP', 'JPY']) expect(rateUnitPrice(eurRate, c), c).toBe(0)
  })
  it('a base_rate counts only when its own currency matches', () => {
    expect(rateUnitPrice({ base_rate: 5000, currency: 'JPY' }, 'JPY')).toBe(5000)
    expect(rateUnitPrice({ base_rate: 5000, currency: 'JPY' }, 'EUR')).toBe(0)
    expect(rateUnitPrice({ base_rate: 5000 }, 'JPY')).toBe(0)
  })
})
