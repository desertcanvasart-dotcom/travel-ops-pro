// Source-reading checks for page wiring that has no cheaper seam: the invoice
// Cancel action, the Receipts tag going through i18n, the Payments "Move to
// invoice" action, and the commission number on the Commissions list.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const messages = (l: string) => JSON.parse(src(`messages/${l}.json`))

describe('invoice page: Cancel invoice', () => {
  const page = src('app/invoices/[id]/page.tsx')
  it('confirms, PUTs status cancelled, shows the server refusal, and is hidden for cancelled or paid', () => {
    expect(page).toMatch(/confirmDialog\(t\('confirmCancelInvoice'\)\)/)
    expect(page).toMatch(/body: JSON\.stringify\(\{ status: 'cancelled' \}\)/)
    expect(page).toMatch(/dialog\.alert\(tCommon\('error'\), error\.error \|\| t\('failedToCancelInvoice'\)/)
    expect(page).toMatch(/invoice\.status !== 'cancelled' && invoice\.status !== 'paid'[\s\S]{0,200}handleCancelInvoice/)
  })
  it.each(['en', 'ja'])('has the strings in %s', l => {
    const d = messages(l).invoices.detail
    for (const k of ['cancelInvoice', 'confirmCancelInvoice', 'failedToCancelInvoice']) expect(d[k]).toBeTruthy()
  })
})

describe('receipts page: the on-invoice tag is translated', () => {
  const page = src('app/payments/_views/ReceiptsView.tsx')
  it('uses useTranslations, not hard-coded English', () => {
    expect(page).toContain("useTranslations('payments')")
    expect(page).toContain("t('onInvoiceTag')")
    expect(page).not.toContain('not counted)')
  })
  it('the key exists in en and ja and differs', () => {
    expect(messages('en').payments.onInvoiceTag).toMatch(/counted on the invoice/)
    expect(messages('ja').payments.onInvoiceTag).not.toBe(messages('en').payments.onInvoiceTag)
  })
})

describe('payments page: Move to invoice', () => {
  const page = src('app/payments/_views/PaymentsView.tsx')
  it('offers it only for a received trip payment on an invoiced trip, and posts to the route', () => {
    expect(page).toMatch(/movable: isOnInvoicedTrip\(p, invoiced\) && isReceivedTripPayment\(p\)/)
    expect(page).toMatch(/payment\.movable && \(/)
    expect(page).toContain('/move-to-invoice')
  })
  it.each(['en', 'ja'])('has the strings in %s', l => {
    const d = messages(l).payments
    for (const k of ['moveToInvoice', 'confirmMoveToInvoice', 'failedToMoveToInvoice']) expect(d[k]).toBeTruthy()
  })
})

describe('commissions page: the number', () => {
  it('shows commission_number, falling back to the id reference', () => {
    expect(src('app/commissions/page.tsx')).toContain('commission.commission_number || commissionRef(commission.id)')
  })
  it('the list marks price-changed commissions from the server field', () => {
    expect(src('app/commissions/page.tsx')).toContain('commission.price_changed_status')
  })
})
