// An expense's payment date follows its status (lib/expense-status.ts), and
// paying a supplier invoice settles only the expenses still owed.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { paymentDateForStatus } from '@/lib/expense-status'

describe('the payment date a status carries', () => {
  const today = '2026-10-07'
  it('paid: the date given, else the one it has, else today', () => {
    expect(paymentDateForStatus('paid', '2026-10-01', '2026-09-01', today)).toBe('2026-10-01')
    expect(paymentDateForStatus('paid', '', '2026-09-01', today)).toBe('2026-09-01')
    expect(paymentDateForStatus('paid', undefined, null, today)).toBe(today)
  })
  it('anything else: none, whatever was sent', () => {
    for (const s of ['pending', 'approved', 'rejected', 'cancelled']) {
      expect(paymentDateForStatus(s, '2026-10-01', '2026-09-01', today), s).toBeNull()
    }
  })
})

// ── PUT /api/expenses/[id], against a fake database ──────────────────────────
const db: { row: Record<string, unknown>; update: Record<string, unknown> | null } = { row: {}, update: null }
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q: any = {
        select: () => q, eq: () => q,
        update: (u: Record<string, unknown>) => { db.update = u; return q },
        maybeSingle: async () => ({ data: db.row, error: null }),
        single: async () => ({ data: { ...db.row, ...db.update }, error: null }),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-1', noOrgResponse: () => new Response(null, { status: 403 }) }))

const put = async (body: Record<string, unknown>) => {
  const { PUT } = await import('@/app/api/expenses/[id]/route')
  return PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: 'e1' }) } as never)
}

beforeEach(() => { db.row = {}; db.update = null })

describe('changing an expense’s status', () => {
  it('Mark as paid with no date fills today; with one keeps it', async () => {
    await put({ status: 'paid' })
    expect(db.update!.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await put({ status: 'paid', payment_date: '2026-10-01' })
    expect(db.update!.payment_date).toBe('2026-10-01')
  })
  it('an expense already paid on a date keeps that date', async () => {
    db.row = { payment_date: '2026-09-15' }
    await put({ status: 'paid' })
    expect(db.update!.payment_date).toBe('2026-09-15')
  })
  it('back to pending clears it', async () => {
    db.row = { payment_date: '2026-09-15' }
    await put({ status: 'pending', payment_date: '2026-09-15' })
    expect(db.update!.payment_date).toBeNull()
  })
  it('an edit that does not touch the status leaves the date alone', async () => {
    await put({ description: 'Lunch' })
    expect(db.update).not.toHaveProperty('payment_date')
  })
})

describe('paying a supplier invoice', () => {
  it('settles only the linked expenses still owed', () => {
    const code = readFileSync('app/api/supplier-invoices/[id]/pay/route.ts', 'utf8')
    expect(code).toMatch(/\.in\('status', \[\.\.\.PAYABLE_EXPENSE_STATUSES\]\)/)
    expect(readFileSync('lib/expense-status.ts', 'utf8')).toMatch(/PAYABLE_EXPENSE_STATUSES = \['pending', 'approved'\]/)
  })
})
