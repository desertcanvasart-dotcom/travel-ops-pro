import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('supplier invoices', () => {
  const match = src('app/api/supplier-invoices/[id]/match/route.ts')

  it('AP payment history is the org’s own', () => {
    const ap = src('app/api/accounts-payable/route.ts')
    const recent = ap.slice(ap.indexOf('// Fetch paid expenses for payment history'))
    expect(recent.slice(0, 300)).toContain(".eq('org_id', orgId)")
  })

  it('match and unmatch only before review, and the write is conditional', () => {
    expect(match).toContain("const MATCHABLE = ['received', 'matched']")
    expect(match).toContain('if (!MATCHABLE.includes(invoice.status))')
    expect(match).toContain('if (!MATCHABLE.includes(parentInvoice.status))')
    expect(match.match(/\.in\('status', MATCHABLE\)/g)).toHaveLength(2)
  })

  it('unmatch keeps a partial match at received (M28)', () => {
    expect(match).toContain("const status = matchStatus === 'matched' ? 'matched' : 'received'")
    expect(match).not.toContain("const status = matchedAmount === 0 ? 'received' : 'matched'")
  })

  it('expenses match only in the invoice currency', () => {
    expect(match).toContain(".select('amount, status, currency')")
    expect(match).toContain(".select('id, amount, currency')")
    expect(match).toContain('Expenses must be in the invoice currency')
  })

  it('create and edit check the trip and client invoice; edit is an allow-list', () => {
    expect(src('app/api/supplier-invoices/route.ts')).toContain('invoice_id: body.client_invoice_id')
    const put = src('app/api/supplier-invoices/[id]/route.ts')
    expect(put).toContain('for (const key of EDITABLE)')
    expect(put).toContain("Cannot change the amount of an invoice with status")
    expect(put).toContain("query = query.eq('status', current.status)")
  })

  it('upload fails when the document is not attached', () => {
    expect(src('app/api/supplier-invoices/[id]/upload/route.ts')).toContain("'Failed to attach the document'")
  })

  it('client_invoice_id exists outside the archive', () => {
    const m = 'migrations/20261120_supplier_invoices_client_invoice.sql'
    expect(existsSync(join(process.cwd(), m))).toBe(true)
    expect(src(m)).toContain('ADD COLUMN IF NOT EXISTS client_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL')
  })

  it('the pages report a failed create and gate matching on status and currency', () => {
    expect(src('app/supplier-invoices/page.tsx')).toContain('Creating the supplier invoice failed')
    const page = src('app/supplier-invoices/[id]/page.tsx')
    expect(page).toContain("const matchable = invoice.status === 'received' || invoice.status === 'matched'")
    expect(page).toContain('=== invoiceCurrency')
  })
})
