// Finance (customer side): the rules the Payments, Invoices and Receipts pages
// and their routes share. Pure functions, no database.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isReceivedTripPayment, monthStartOf, onOrAfterMonthStart, paymentStats, tripPaid } from '@/lib/payments/stats'
import { displayStatus, invoiceTiles, isOverdue, isReceivable } from '@/lib/invoices/status'
import { checkInvoiceAmounts, isSettableInvoiceStatus } from '@/lib/invoices/validate'
import { checkPaymentAmount, pickPaymentFields } from '@/lib/payments/fields'
import { receiptNumberFor } from '@/lib/payments/receipt-number'
import { receiptVat, tripPaymentVatColumns } from '@/lib/payments/vat'

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const TODAY = '2026-10-14'

describe('Payments tiles: what counts as received', () => {
  const pay = (amount: number, payment_status: string, payment_type = 'deposit', payment_date = '2026-10-02', currency = 'JPY') =>
    ({ amount, payment_status, payment_type, payment_date, currency })

  it('a completed 100 counts; a pending 50 and a refund of 20 do not (Total received and This month)', () => {
    const stats = paymentStats([pay(100, 'completed'), pay(50, 'pending'), pay(20, 'completed', 'refund'), pay(7, 'failed'), pay(9, 'refunded')], [], TODAY)
    expect(stats.totalReceived).toEqual({ JPY: 100 })
    expect(stats.thisMonthRevenue).toEqual({ JPY: 100 })
    expect(isReceivedTripPayment(pay(1, 'completed'))).toBe(true)
    expect(isReceivedTripPayment(pay(1, 'completed', 'refund'))).toBe(false)
  })

  it('every invoice payment counts, per currency; the month starts on the 1st as text', () => {
    const stats = paymentStats(
      [pay(100, 'completed', 'deposit', '2026-10-01')],
      [{ status: 'sent', currency: 'EUR', balance_due: 5, invoice_payments: [
        { amount: 40, currency: 'EUR', payment_date: '2026-10-01' },
        { amount: 60, currency: 'EUR', payment_date: '2026-09-30' },
      ] }],
      TODAY
    )
    expect(stats.totalReceived).toEqual({ JPY: 100, EUR: 100 })
    // 1 October is this month whatever the viewer's timezone; 30 September is not.
    expect(stats.thisMonthRevenue).toEqual({ JPY: 100, EUR: 40 })
    expect(monthStartOf(TODAY)).toBe('2026-10-01')
    expect(onOrAfterMonthStart('2026-10-01T00:00:00', '2026-10-01')).toBe(true)
    expect(onOrAfterMonthStart('2026-09-30', '2026-10-01')).toBe(false)
    expect(onOrAfterMonthStart(null, '2026-10-01')).toBe(false)
  })

  it('Pending is sent / part-paid / viewed; a past-due draft is neither Pending nor Overdue', () => {
    const inv = (status: string, due_date: string, balance_due = 100) => ({ status, due_date, balance_due, currency: 'JPY' })
    const stats = paymentStats([], [inv('draft', '2026-09-01'), inv('sent', '2026-09-01'), inv('partial', '2026-12-01', 30), inv('cancelled', '2026-09-01'), inv('paid', '2026-09-01', 0)], TODAY)
    expect(stats.pendingPayments).toEqual({ JPY: 130 })
    expect(stats.overduePayments).toEqual({ JPY: 100 })
  })

  it('what a trip has been paid: completed payments less completed refunds', () => {
    expect(tripPaid([pay(300, 'completed'), pay(100, 'pending'), pay(50, 'completed', 'refund')])).toBe(250)
    expect(tripPaid([])).toBe(0)
  })
})

describe('Invoices: overdue and the money tiles', () => {
  const inv = (status: string, due_date: string | null, total: number, paid = 0, currency = 'JPY') =>
    ({ status, due_date, total_amount: total, amount_paid: paid, balance_due: total - paid, currency })

  it('a sent invoice past its due date with a balance is overdue; a draft, a paid or a cancelled one is not', () => {
    expect(isOverdue(inv('sent', '2026-10-13', 100), TODAY)).toBe(true)
    expect(isOverdue(inv('partial', '2026-10-13', 100, 40), TODAY)).toBe(true)
    expect(isOverdue(inv('sent', '2026-10-14', 100), TODAY)).toBe(false) // due today is not yet overdue
    expect(isOverdue(inv('draft', '2026-09-01', 100), TODAY)).toBe(false)
    expect(isOverdue(inv('cancelled', '2026-09-01', 100), TODAY)).toBe(false)
    expect(isOverdue(inv('paid', '2026-09-01', 100, 100), TODAY)).toBe(false)
    expect(isOverdue(inv('sent', null, 100), TODAY)).toBe(false)
    expect(displayStatus(inv('sent', '2026-10-13', 100), TODAY)).toBe('overdue')
    expect(displayStatus(inv('draft', '2026-09-01', 100), TODAY)).toBe('draft')
  })

  it('Billed / Paid / Outstanding leave out drafts and cancelled invoices: {sent 100, cancelled 100} bills 100', () => {
    const tiles = invoiceTiles([inv('sent', '2026-12-01', 100), inv('cancelled', '2026-12-01', 100), inv('draft', '2026-12-01', 500)], TODAY)
    expect(tiles.billed).toEqual({ JPY: 100 })
    expect(tiles.outstanding).toEqual({ JPY: 100 })
    expect(tiles.overdue).toEqual({})
    expect(isReceivable(inv('draft', null, 1))).toBe(false)
  })

  it('tiles are per currency, and overdue is the displayed rule', () => {
    const tiles = invoiceTiles([inv('sent', '2026-10-01', 1000, 400), inv('sent', '2026-10-01', 50, 0, 'EUR'), inv('draft', '2026-10-01', 9)], TODAY)
    expect(tiles.billed).toEqual({ JPY: 1000, EUR: 50 })
    expect(tiles.paid).toEqual({ JPY: 400, EUR: 0 })
    expect(tiles.overdue).toEqual({ JPY: 600, EUR: 50 })
  })

  it('the status filter works on the shown status, not the stored one', () => {
    const rows = [inv('sent', '2026-10-13', 100), inv('sent', '2026-12-01', 100)]
    const shown = rows.map(r => ({ ...r, status: displayStatus(r, TODAY) }))
    expect(shown.filter(r => r.status === 'overdue')).toHaveLength(1)
    expect(shown.filter(r => r.status === 'sent')).toHaveLength(1)
    // …and the page no longer asks the API for a status.
    const page = src('app/invoices/_views/InvoicesView.tsx')
    expect(page).not.toContain("params.append('status'")
    expect(page).toContain('!statusFilter || invoice.status === statusFilter')
  })
})

describe('POST /api/invoices amounts', () => {
  it('rejects a negative or non-numeric total, trip cost or discount', () => {
    expect(checkInvoiceAmounts({ total_amount: -100 })).toEqual({ ok: false, error: 'total_amount must be a non-negative number' })
    expect(checkInvoiceAmounts({ total_amount: 'abc' }).ok).toBe(false)
    expect(checkInvoiceAmounts({ total_amount: 100, full_trip_cost: -1 }).ok).toBe(false)
    expect(checkInvoiceAmounts({ total_amount: 100, discount_amount: -5 }).ok).toBe(false)
    expect(checkInvoiceAmounts({ total_amount: Infinity }).ok).toBe(false)
  })

  it('a deposit percentage is more than 0 and at most 100; absent is 10', () => {
    expect(checkInvoiceAmounts({ total_amount: 1, deposit_percent: 150 }).ok).toBe(false)
    expect(checkInvoiceAmounts({ total_amount: 1, deposit_percent: 0 }).ok).toBe(false)
    expect(checkInvoiceAmounts({ total_amount: 1, deposit_percent: -3 }).ok).toBe(false)
    expect(checkInvoiceAmounts({ total_amount: 1, deposit_percent: 'x' }).ok).toBe(false)
    expect(checkInvoiceAmounts({ total_amount: 1, deposit_percent: 100 })).toMatchObject({ ok: true, depositPercent: 100 })
    expect(checkInvoiceAmounts({ total_amount: 1 })).toMatchObject({ ok: true, depositPercent: 10 })
  })

  it('a numeric string is a number (it was concatenated with the additions: "1000" + 12200)', () => {
    expect(checkInvoiceAmounts({ total_amount: '1000', discount_amount: '5' })).toEqual({
      ok: true, totalAmount: 1000, fullTripCost: null, depositPercent: 10, discountAmount: 5,
    })
    expect(checkInvoiceAmounts({})).toMatchObject({ ok: true, totalAmount: 0 })
  })

  it('a status set by hand is draft / sent / viewed / cancelled', () => {
    for (const s of ['draft', 'sent', 'viewed', 'cancelled']) expect(isSettableInvoiceStatus(s)).toBe(true)
    for (const s of ['paid', 'partial', 'overdue', 'x', '', null, undefined]) expect(isSettableInvoiceStatus(s)).toBe(false)
  })
})

describe('trip payment writes', () => {
  it('only the columns a caller may set pass; id, org_id, receipt number and VAT do not', () => {
    const picked = pickPaymentFields({
      id: 'other', org_id: 'org-x', created_at: '2020-01-01', receipt_number: 'RCP-1', vat_applied: true, vat_amount: 999,
      amount: 5, currency: 'JPY', notes: 'n', itinerary_id: 'it', payment_status: 'completed',
    })
    expect(Object.keys(picked).sort()).toEqual(['amount', 'currency', 'itinerary_id', 'notes', 'payment_status'])
    expect(pickPaymentFields(null)).toEqual({})
  })

  it('an amount is a positive finite number', () => {
    expect(checkPaymentAmount(-1).ok).toBe(false)
    expect(checkPaymentAmount(0).ok).toBe(false)
    expect(checkPaymentAmount('abc').ok).toBe(false)
    expect(checkPaymentAmount('').ok).toBe(false)
    expect(checkPaymentAmount(null).ok).toBe(false)
    expect(checkPaymentAmount('50')).toEqual({ ok: true, amount: 50 })
  })
})

describe('receipt numbers', () => {
  it('two payments with the same transaction reference get their own numbers', () => {
    const a = { id: 'aaaaaaaa-1', receipt_number: 'RCP-2026-0001', transaction_reference: 'wire' }
    const b = { id: 'bbbbbbbb-2', receipt_number: 'RCP-2026-0002', transaction_reference: 'wire' }
    expect(receiptNumberFor(a)).not.toBe(receiptNumberFor(b))
    expect(receiptNumberFor(a)).toBe('RCP-2026-0001')
  })

  it('every receipt output uses the one rule', () => {
    for (const f of ['app/receipts/page.tsx', 'app/documents/receipt/[id]/page.tsx', 'app/api/whatsapp/send-receipt/route.ts', 'app/invoices/[id]/page.tsx']) {
      expect(src(f), f).toContain('receiptNumberFor(')
      expect(src(f), f).not.toMatch(/transaction_reference \|\| `RCP-/)
    }
  })
})

describe('VAT recorded on a trip payment', () => {
  const trip = { vat_applied: true, vat_rate: 14 }

  it('is worked out once when the payment is made', () => {
    // ¥114,000 paid at 14% VAT: 114,000 × 14 / 114 = ¥14,000 inside.
    expect(tripPaymentVatColumns(114000, trip, 'JPY')).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 14000, vat_base: null })
    expect(tripPaymentVatColumns(114000, { vat_applied: false }, 'JPY')).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0, vat_base: null })
  })

  it('the receipt states the recorded VAT, even after the trip is switched', () => {
    const recorded = { amount: 114000, ...tripPaymentVatColumns(114000, trip, 'JPY') }
    // The trip's VAT is now off — the receipt does not follow it.
    expect(receiptVat(recorded, 'JPY', { vat_applied: false })).toMatchObject({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
    // Recorded as "no VAT", the trip later switched ON: still none.
    const none = { amount: 114000, ...tripPaymentVatColumns(114000, { vat_applied: false }, 'JPY') }
    expect(receiptVat(none, 'JPY', trip)).toMatchObject({ vat_applied: false, vat_amount: 0 })
  })

  it('a payment from before it was recorded (NULL) still reads the trip', () => {
    const legacy = { amount: 114000, vat_applied: null, vat_amount: null }
    expect(receiptVat(legacy, 'JPY', trip)).toMatchObject({ vat_applied: true, vat_amount: 14000 })
  })

  it('GET /api/payments/[id] answers with vat_recorded, and the readers honour it', () => {
    const fromApi = { amount: 114000, vat_recorded: true, vat_applied: false, vat_rate: null, vat_amount: 0 }
    expect(receiptVat(fromApi, 'JPY')).toMatchObject({ vat_applied: false, vat_amount: 0 })
    const notRecorded = { amount: 114000, vat_recorded: false, vat_applied: true, vat_rate: 14 }
    expect(receiptVat(notRecorded, 'JPY')).toMatchObject({ vat_applied: true, vat_amount: 14000 })
  })
})
