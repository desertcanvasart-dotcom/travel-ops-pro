// ============================================
// P5 — supplier-invoice financial state machine
// ============================================
// These routes run on the service-role client and move money-adjacent state
// (approve → pay, dispute, delete). The invariants below are enforced in the
// SQL WHERE clauses, not just in a pre-check, so a concurrent request cannot
// slip an illegal transition through the read-then-write gap. This test reads
// the sources to pin those guards.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('approve', () => {
  const code = src('app/api/supplier-invoices/[id]/approve/route.ts')
  it('refuses a disputed invoice (pre-check and conditional WHERE)', () => {
    expect(code).toMatch(/\[['"]paid['"], ['"]cancelled['"], ['"]disputed['"]\]/)
    expect(code).toMatch(/\.neq\(['"]status['"], ['"]disputed['"]\)/)
  })
})

describe('dispute', () => {
  const code = src('app/api/supplier-invoices/[id]/dispute/route.ts')
  it('will not overwrite a payment that landed concurrently', () => {
    // The UPDATE must exclude paid in its WHERE, not only in the pre-check.
    expect(code).toMatch(/\.neq\(['"]status['"], ['"]paid['"]\)/)
  })
})

describe('delete', () => {
  const code = src('app/api/supplier-invoices/[id]/route.ts')
  // 'draft' and 'pending' are not statuses a bill can have (the CHECK allows
  // received, matched, approved, paid, disputed, cancelled), so listing only
  // them made every bill undeletable. Behaviour is pinned in finance-routes.test.ts.
  it('only removes a received, matched or cancelled invoice, in the WHERE', () => {
    expect(code).toMatch(/\.in\(['"]status['"], \[\.\.\.DELETABLE_BILL_STATUSES, ['"]cancelled['"]\]\)/)
  })
})

describe('match', () => {
  const code = src('app/api/supplier-invoices/[id]/match/route.ts')
  it('refuses a settled or reviewed invoice (only received/matched can be matched)', () => {
    expect(code).toContain("const MATCHABLE = ['received', 'matched']")
    expect(code).toContain('if (!MATCHABLE.includes(invoice.status))')
  })
})

describe('amount validation', () => {
  // The rule lives in lib/finance/supplier-bills.ts so create and edit share it
  // (PUT used to accept a negative amount); behaviour is pinned in
  // finance-routes.test.ts and finance-supplier-bills.test.ts.
  it('supplier invoice creation and edit both reject a negative amount', () => {
    expect(src('app/api/supplier-invoices/route.ts')).toMatch(/normalizeBillFields\(body, false\)/)
    expect(src('app/api/supplier-invoices/[id]/route.ts')).toMatch(/normalizeBillFields\(updateData, true\)/)
    expect(src('lib/finance/supplier-bills.ts')).toMatch(/n\s*<\s*0/)
  })
  it('expense creation rejects a negative amount', () => {
    expect(src('app/api/expenses/route.ts')).toMatch(/Number\(body\.amount\)\s*<\s*0/)
  })
})
