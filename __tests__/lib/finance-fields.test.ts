import { describe, it, expect, vi } from 'vitest'
import { expenseFieldError, expenseDeleteBlock, EXPENSE_STATUSES } from '@/lib/expense-status'
import {
  commissionFieldError, commissionPaidDate, buildCommissionUpdate, summariseCommissions, COMMISSION_STATUSES,
} from '@/lib/commission-fields'
import { nextExpenseNumber } from '@/lib/expense-number'
import { describeSkips, type SkippedService } from '@/lib/commission-generation'
import { marginOnPrice, recordedTripSupplierCost } from '@/lib/itinerary-pl'

describe('expense fields', () => {
  it('accepts the five statuses, a listed category and a rate currency', () => {
    for (const status of EXPENSE_STATUSES) expect(expenseFieldError({ status })).toBeNull()
    expect(expenseFieldError({ category: 'guide', currency: 'jpy' })).toBeNull()
    expect(expenseFieldError({})).toBeNull()
  })
  it('refuses anything else, naming the allowed values', () => {
    expect(expenseFieldError({ status: 'foo' })).toMatch(/status must be one of: pending, approved, paid, rejected, cancelled/)
    expect(expenseFieldError({ category: 'bogus' })).toMatch(/category must be one of/)
    expect(expenseFieldError({ currency: 'XXX' })).toMatch(/currency must be one of/)
  })
})

describe('deleting an expense', () => {
  it('a paid expense is refused, with what to do instead', () => {
    expect(expenseDeleteBlock({ status: 'paid' }, 0)).toMatch(/Cancelled/)
  })
  it('one matched to supplier invoices is refused, singular and plural', () => {
    expect(expenseDeleteBlock({ status: 'approved' }, 1)).toMatch(/a supplier invoice/)
    expect(expenseDeleteBlock({ status: 'approved' }, 3)).toMatch(/3 supplier invoices/)
  })
  it('a pending, unmatched one may go', () => {
    expect(expenseDeleteBlock({ status: 'pending' }, 0)).toBeNull()
    expect(expenseDeleteBlock({ status: 'rejected' }, 0)).toBeNull()
  })
})

describe('commission fields', () => {
  it('accepts every status the database CHECK allows', () => {
    for (const status of COMMISSION_STATUSES) expect(commissionFieldError({ status })).toBeNull()
  })
  it('refuses what the CHECK would refuse, as a message rather than a 500', () => {
    expect(commissionFieldError({ commission_type: 'x' })).toMatch(/commission_type/)
    expect(commissionFieldError({ category: 'x' })).toMatch(/category/)
    expect(commissionFieldError({ status: 'x' })).toMatch(/status/)
    expect(commissionFieldError({ currency: 'XXX' })).toMatch(/currency/)
  })
})

describe('a commission\'s paid date follows its status', () => {
  const today = '2026-10-14'
  it('paid / received: the date given, else the one it has, else today', () => {
    expect(commissionPaidDate('paid', '2026-10-01', '2026-09-01', today)).toBe('2026-10-01')
    expect(commissionPaidDate('received', undefined, '2026-09-01', today)).toBe('2026-09-01')
    expect(commissionPaidDate('paid', undefined, null, today)).toBe(today)
  })
  it('anything else clears it', () => {
    for (const s of ['pending', 'invoiced', 'cancelled', 'disputed']) {
      expect(commissionPaidDate(s, '2026-10-01', '2026-09-01', today), s).toBeNull()
    }
  })
})

describe('buildCommissionUpdate', () => {
  it('keeps only the editable fields', () => {
    const u = buildCommissionUpdate(
      { notes: 'n', commission_amount: 9, org_id: 'x', itinerary_id: 'i', currency: 'USD', bogus: 1 },
      { status: 'pending', paid_date: null },
    )
    expect(Object.keys(u).sort()).toEqual(['notes', 'updated_at'])
  })
  it('a blank string clears an optional field', () => {
    expect(buildCommissionUpdate({ notes: '' }, {}).notes).toBeNull()
  })
  it('sets the paid date with the status, clears it when the status goes back', () => {
    expect(buildCommissionUpdate({ status: 'paid' }, { status: 'pending' }, '2026-10-14').paid_date).toBe('2026-10-14')
    expect(buildCommissionUpdate({ status: 'pending' }, { status: 'paid', paid_date: '2026-10-01' }).paid_date).toBeNull()
  })
  it('a paid date sent without a status follows the stored status', () => {
    expect(buildCommissionUpdate({ paid_date: '2026-10-03' }, { status: 'paid', paid_date: '2026-10-01' }).paid_date).toBe('2026-10-03')
    expect(buildCommissionUpdate({ paid_date: '2026-10-03' }, { status: 'pending' }).paid_date).toBeNull()
  })
  it('touches no paid date when neither is sent', () => {
    expect(buildCommissionUpdate({ notes: 'n' }, { status: 'paid', paid_date: '2026-10-01' })).not.toHaveProperty('paid_date')
  })
})

describe('summariseCommissions', () => {
  const rows = [
    { commission_type: 'receivable', commission_amount: 100, currency: 'EUR', status: 'pending', category: 'hotel' },
    { commission_type: 'receivable', commission_amount: 50, currency: 'EUR', status: 'received', category: 'shopping' },
    { commission_type: 'payable', commission_amount: 30, currency: 'EUR', status: 'paid', category: 'hotel' },
    { commission_type: 'payable', commission_amount: 5000, currency: 'JPY', status: 'pending', category: 'hotel' },
    { commission_type: 'receivable', commission_amount: 999, currency: 'EUR', status: 'cancelled', category: 'hotel' },
    { commission_type: 'payable', commission_amount: 888, currency: 'JPY', status: 'cancelled', category: 'hotel' },
  ]
  it('is per currency and leaves cancelled out of every figure', () => {
    const s = summariseCommissions(rows)
    expect(s.total_receivable).toEqual({ EUR: 150 })
    expect(s.total_payable).toEqual({ EUR: 30, JPY: 5000 })
    expect(s.pending_receivable).toEqual({ EUR: 100 })
    expect(s.pending_payable).toEqual({ JPY: 5000 })
    expect(s.received).toEqual({ EUR: 50 })
    expect(s.paid).toEqual({ EUR: 30 })
    expect(s.net_commission).toEqual({ EUR: 120, JPY: -5000 })
    expect(s.by_category.hotel.count).toBe(3)
  })
})

describe('nextExpenseNumber', () => {
  it('takes the per-company number from the database function', async () => {
    const rpc = vi.fn(async () => ({ data: 'EXP-2026-007', error: null }))
    expect(await nextExpenseNumber({ rpc } as never, 'org-a', 2026)).toBe('EXP-2026-007')
    expect(rpc).toHaveBeenCalledWith('next_expense_number', { p_org: 'org-a', p_year: 2026 })
  })
  it('falls back to the global sequence on a database without the migration', async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === 'next_expense_number' ? { data: null, error: { message: 'function does not exist' } } : { data: 12, error: null })
    expect(await nextExpenseNumber({ rpc } as never, 'org-a', 2026)).toBe('EXP-2026-012')
  })
})

describe('the trip page P&L card', () => {
  it('margin is profit over the client price, not over cost', () => {
    // A 25% markup on cost is a 20% margin on the price: the same trip reads
    // 20.0% on the Profit & Loss page.
    expect(marginOnPrice(250, 1250)).toBeCloseTo(20, 8)
    expect(marginOnPrice(-100, 1000)).toBeCloseTo(-10, 8)
    expect(marginOnPrice(10, 0)).toBe(0)
  })
  it('an unrecorded supplier cost is null, never a figure worked back from the price', () => {
    expect(recordedTripSupplierCost(null)).toBeNull()
    expect(recordedTripSupplierCost(0)).toBeNull()
    expect(recordedTripSupplierCost('')).toBeNull()
    expect(recordedTripSupplierCost(800)).toBe(800)
    expect(recordedTripSupplierCost('800')).toBe(800)
  })
})

describe('describeSkips', () => {
  const skip = (name: string, reason: SkippedService['reason']): SkippedService => ({ service_id: name, service_name: name, reason, detail: '' })
  it('names what was skipped and why, in one line', () => {
    expect(describeSkips([skip('Stay', 'no_rate'), skip('Lunch', 'no_supplier')])).toBe('Skipped: Stay (no commission rate); Lunch (no supplier).')
  })
  it('does not call an already-generated service news', () => {
    expect(describeSkips([skip('Stay', 'already_generated')])).toBe('')
  })
  it('caps the list and counts the rest', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map(n => skip(n, 'no_rate'))
    expect(describeSkips(many, 4)).toBe('Skipped: a (no commission rate); b (no commission rate); c (no commission rate); d (no commission rate); and 2 more.')
  })
})
