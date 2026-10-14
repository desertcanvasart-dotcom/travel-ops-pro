// Receivables: what counts as owed, when it is due, which bucket it is in.
// A draft and an undated invoice used to land in "90+ Days" and "Overdue"
// (new Date(null) is 1970); the row badge and the bucket sums used different cuts.
import { describe, it, expect } from 'vitest'
import {
  ageInvoice, agingKeyFor, daysPastDue, effectiveDueDate, fetchAllRows, isReceivable, paymentTermsDays,
  AGING_FILTER_KEYS,
} from '@/lib/finance/receivables'

const TODAY = '2026-10-14'
const daysAgo = (n: number) => new Date(Date.UTC(2026, 9, 14) - n * 86400000).toISOString().slice(0, 10)

describe('what counts as a receivable', () => {
  it('excludes a draft, even with a balance', () => {
    expect(isReceivable({ balance_due: 500, status: 'draft' })).toBe(false)
  })
  it('excludes cancelled and void, and a zero balance', () => {
    expect(isReceivable({ balance_due: 500, status: 'cancelled' })).toBe(false)
    expect(isReceivable({ balance_due: 500, status: 'void' })).toBe(false)
    expect(isReceivable({ balance_due: 0, status: 'sent' })).toBe(false)
  })
  it('includes a sent, partial or overdue invoice with a balance', () => {
    for (const status of ['sent', 'partial', 'overdue', 'viewed']) {
      expect(isReceivable({ balance_due: 10, status }), status).toBe(true)
    }
  })
})

describe('payment terms and the effective due date', () => {
  it('reads the number of days from the terms text', () => {
    expect(paymentTermsDays('Payment due within 14 days')).toBe(14)
    expect(paymentTermsDays('Net 30')).toBe(30)
    expect(paymentTermsDays('on receipt')).toBeNull()
    expect(paymentTermsDays(null)).toBeNull()
  })
  it('keeps the invoice own due date', () => {
    expect(effectiveDueDate({ due_date: '2026-10-01', issue_date: '2026-09-01' })).toEqual({ date: '2026-10-01', fromTerms: false })
  })
  it('without one: issue date plus the terms', () => {
    expect(effectiveDueDate({ due_date: null, issue_date: '2026-09-01', payment_terms: 'Net 30' })).toEqual({ date: '2026-10-01', fromTerms: true })
  })
  it('terms without a number: 14 days', () => {
    expect(effectiveDueDate({ due_date: null, issue_date: '2026-09-01', payment_terms: 'on receipt' }).date).toBe('2026-09-15')
  })
  it('no due date and no issue date: none, not 1970', () => {
    expect(effectiveDueDate({ due_date: null, issue_date: null })).toEqual({ date: null, fromTerms: false })
  })
})

describe('an undated invoice is not 20,000 days overdue', () => {
  it('with an issue date it ages from issue date + terms: current', () => {
    const r = ageInvoice({ due_date: null, issue_date: daysAgo(3), payment_terms: 'Net 30' }, TODAY)
    expect(r.aging_bucket).toBe('current')
    expect(r.is_overdue).toBe(false)
    expect(r.days_past_due).toBe(0)
    expect(r.due_date_from_terms).toBe(true)
  })
  it('with neither date it is "No due date", not overdue', () => {
    const r = ageInvoice({ due_date: null, issue_date: null }, TODAY)
    expect(r.aging_bucket).toBe('nodate')
    expect(r.aging_key).toBe('noDueDate')
    expect(r.is_overdue).toBe(false)
    expect(r.days_past_due).toBe(0)
  })
})

describe('one bucket table for the badge, the sums and the filter', () => {
  const cases: Array<[number, string, string]> = [
    [-5, 'current', 'current'],
    [0, 'current', 'current'],
    [1, 'days30', '30'],
    [30, 'days30', '30'],
    [31, 'days60', '60'],
    [60, 'days60', '60'],
    [61, 'days90', '90'],
    [75, 'days90', '90'],
    [90, 'days90', '90'],
    [91, 'days90Plus', '90plus'],
  ]
  it.each(cases)('%i days past due is %s (badge %s)', (days, key, badge) => {
    const r = ageInvoice({ due_date: daysAgo(days), issue_date: daysAgo(days + 10) }, TODAY)
    expect(r.days_past_due).toBe(Math.max(0, days))
    expect(r.aging_key).toBe(key)
    expect(r.aging_bucket).toBe(badge)
    expect(agingKeyFor(days)).toBe(key)
  })
  it('an invoice 75 days late is 61-90, not "31-60" on the badge and "90+" in the tile', () => {
    const r = ageInvoice({ due_date: daysAgo(75) }, TODAY)
    expect(AGING_FILTER_KEYS['90']).toBe(r.aging_key)
    expect(AGING_FILTER_KEYS['90plus']).not.toBe(r.aging_key)
  })
  it('counts whole calendar days', () => {
    expect(daysPastDue('2026-10-13', '2026-10-14')).toBe(1)
    expect(daysPastDue('2026-10-14', '2026-10-14')).toBe(0)
  })
})

describe('reading every row, not the first thousand', () => {
  const source = (n: number) => (from: number, to: number) =>
    Promise.resolve({ data: Array.from({ length: n }, (_, i) => i).slice(from, to + 1), error: null })

  it('walks pages until a short one', async () => {
    const r = await fetchAllRows<number>(source(2500))
    expect(r.rows).toHaveLength(2500)
    expect(r.truncated).toBe(false)
  })
  it('an exact multiple of the page size still ends', async () => {
    const r = await fetchAllRows<number>(source(2000))
    expect(r.rows).toHaveLength(2000)
    expect(r.truncated).toBe(false)
  })
  it('says so when it hits the ceiling', async () => {
    const r = await fetchAllRows<number>(source(10_000), 1000, 3)
    expect(r.rows).toHaveLength(3000)
    expect(r.truncated).toBe(true)
  })
  it('returns the error rather than a partial set', async () => {
    const r = await fetchAllRows<number>(() => Promise.resolve({ data: null, error: { message: 'boom' } }))
    expect(r.error?.message).toBe('boom')
  })
})
