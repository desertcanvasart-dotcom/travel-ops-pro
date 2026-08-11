import { describe, it, expect } from 'vitest'
import { resolveTaxTreatment, allocateLineTax, round2 } from '@/lib/accounting/tax'
import { mapExpenseToBillPayload } from '@/lib/accounting/mappers'
import { QuickBooksProvider } from '@/lib/accounting/quickbooks-provider'
import { XeroProvider } from '@/lib/accounting/xero-provider'
import type { InvoicePayload } from '@/lib/accounting/types'

// H9 regression: the QB/Xero mappers used to emit NO tax, so a taxable invoice
// synced with a total short by the tax amount. These tests lock in that the
// tax is now represented and the external document reconciles to total_amount.

const invoice = (over: Partial<InvoicePayload> = {}): InvoicePayload => ({
  invoice_number: 'INV-1',
  contact_name: 'Acme',
  line_items: [
    { description: 'Tour', quantity: 1, unit_price: 800, amount: 800 },
    { description: 'Transfer', quantity: 1, unit_price: 200, amount: 200 },
  ],
  subtotal: 1000,
  tax_rate: 14,
  tax_amount: 140,
  total_amount: 1140,
  currency: 'EUR',
  issue_date: '2026-07-01',
  status: 'sent',
  internalId: 'id-1',
  ...over,
})

const sum = (ns: number[]) => round2(ns.reduce((s, n) => s + n, 0))

describe('resolveTaxTreatment', () => {
  it('none when tax is zero or negative', () => {
    expect(resolveTaxTreatment(1000, 0, 1000)).toBe('none')
    expect(resolveTaxTreatment(1000, -5, 1000)).toBe('none')
  })
  it('exclusive when total = subtotal + tax', () => {
    expect(resolveTaxTreatment(1000, 140, 1140)).toBe('exclusive')
  })
  it('inclusive when total = subtotal (tax already inside)', () => {
    expect(resolveTaxTreatment(1000, 140, 1000)).toBe('inclusive')
  })
  it('falls back to exclusive on inconsistent data (never drops tax)', () => {
    expect(resolveTaxTreatment(1000, 140, 1234)).toBe('exclusive')
  })
})

describe('allocateLineTax', () => {
  it('distributes proportionally and sums exactly to the tax amount', () => {
    const parts = allocateLineTax([800, 200], 140)
    expect(parts).toEqual([112, 28])
    expect(sum(parts)).toBe(140)
  })
  it('absorbs rounding drift on the last line', () => {
    const parts = allocateLineTax([1, 1, 1], 10) // 3.333.. each
    expect(sum(parts)).toBe(10)
  })
  it('returns zeros when there is no tax', () => {
    expect(allocateLineTax([800, 200], 0)).toEqual([0, 0])
  })
})

describe('QuickBooks invoice tax mapping (H9)', () => {
  const qb = new QuickBooksProvider() as any

  it('exclusive: emits TaxExcluded + TotalTax so lines + tax = total', () => {
    const m = qb.mapToQBInvoice(invoice())
    expect(m.GlobalTaxCalculation).toBe('TaxExcluded')
    expect(m.TxnTaxDetail.TotalTax).toBe(140)
    const lineSum = sum(m.Line.map((l: any) => l.Amount))
    expect(round2(lineSum + m.TxnTaxDetail.TotalTax)).toBe(1140)
  })

  it('inclusive: emits TaxInclusive; lines already equal the total', () => {
    const m = qb.mapToQBInvoice(invoice({ total_amount: 1000 }))
    expect(m.GlobalTaxCalculation).toBe('TaxInclusive')
    expect(m.TxnTaxDetail.TotalTax).toBe(140)
    expect(sum(m.Line.map((l: any) => l.Amount))).toBe(1000)
  })

  it('no tax: omits TxnTaxDetail entirely (unchanged behavior)', () => {
    const m = qb.mapToQBInvoice(invoice({ tax_amount: 0, total_amount: 1000 }))
    expect(m.TxnTaxDetail).toBeUndefined()
    expect(m.GlobalTaxCalculation).toBeUndefined()
  })
})

describe('Xero invoice tax mapping (H9)', () => {
  const xero = new XeroProvider() as any

  it('exclusive: per-line TaxAmount sums to tax, and lines + tax = total', () => {
    const m = xero.mapToXeroInvoice(invoice(), 'ACCREC')
    expect(m.LineAmountTypes).toBe('Exclusive')
    const taxSum = sum(m.LineItems.map((l: any) => l.TaxAmount))
    expect(taxSum).toBe(140)
    const lineSum = sum(m.LineItems.map((l: any) => l.UnitAmount * l.Quantity))
    expect(round2(lineSum + taxSum)).toBe(1140)
  })

  it('inclusive: LineAmountTypes Inclusive with the tax carried per line', () => {
    const m = xero.mapToXeroInvoice(invoice({ total_amount: 1000 }), 'ACCREC')
    expect(m.LineAmountTypes).toBe('Inclusive')
    expect(sum(m.LineItems.map((l: any) => l.TaxAmount))).toBe(140)
  })

  it('no tax: no TaxAmount fields (unchanged behavior)', () => {
    const m = xero.mapToXeroInvoice(invoice({ tax_amount: 0, total_amount: 1000 }), 'ACCREC')
    expect(m.LineItems.every((l: any) => l.TaxAmount === undefined)).toBe(true)
  })
})

describe('mapExpenseToBillPayload (H9)', () => {
  it('no tax column today: line = full amount, tax 0 (behavior preserved)', () => {
    const bill = mapExpenseToBillPayload({ id: 'e1', amount: 500, currency: 'EUR' })
    expect(bill.tax_amount).toBe(0)
    expect(bill.line_items[0].amount).toBe(500)
    expect(bill.total_amount).toBe(500)
  })

  it('carries an optional tax: line is net and line + tax = total', () => {
    const bill = mapExpenseToBillPayload({ id: 'e2', amount: 500, tax_amount: 70, currency: 'EUR' })
    expect(bill.tax_amount).toBe(70)
    expect(bill.line_items[0].amount).toBe(430)
    expect(round2(bill.line_items[0].amount + bill.tax_amount)).toBe(bill.total_amount)
  })

  it('QB/Xero bill mappers emit the carried tax on top', () => {
    const bill = mapExpenseToBillPayload({ id: 'e3', amount: 500, tax_amount: 70, currency: 'EUR' })
    const qbBill = (new QuickBooksProvider() as any).mapToQBBill(bill)
    expect(qbBill.GlobalTaxCalculation).toBe('TaxExcluded')
    expect(qbBill.TxnTaxDetail.TotalTax).toBe(70)

    const xeroBill = (new XeroProvider() as any).mapToXeroBill(bill)
    expect(sum(xeroBill.LineItems.map((l: any) => l.TaxAmount))).toBe(70)
  })
})
