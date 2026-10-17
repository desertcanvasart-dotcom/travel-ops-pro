// The daily reminder job must pick up an invoice nobody has reminded yet.
// A new invoice had next_reminder_date NULL, the job asked for
// `next_reminder_date <= today`, and NULL never matches — so it only ever
// re-chased invoices a person had already reminded by hand.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const mail = vi.hoisted(() => ({ sends: [] as Array<{ to: string; orgId: string; subject: string }> }))

vi.mock('@/lib/supabase-server', async () => {
  const mock = await import('../_mock-supabase')
  return { createServerClient: mock.createMockClient }
})
vi.mock('@/lib/support/job-runs', () => ({
  withJobRun: (_name: string, _db: unknown, handler: unknown) => handler,
  jobRunHeaders: () => ({}),
}))
vi.mock('@/lib/org-identity', () => ({
  businessIdentity: () => ({ name: 'Default' }),
  htmlIdentity: (i: { name: string }) => ({ name: i.name }),
  orgIdentity: async () => ({ name: 'ATS' }),
}))
vi.mock('@/lib/today', () => ({ todayLocal: () => '2026-10-13', businessToday: () => '2026-10-13' }))
vi.mock('@/lib/email-send', () => ({
  sendEmailInternal: async (p: { to: string; orgId: string; subject: string }) => {
    mail.sends.push(p)
    return { success: true }
  },
}))

import * as reminders from '@/app/api/cron/send-reminders/route'
import { internalCronToken } from '@/lib/cron/auth'

const run = async () => (await (reminders.GET as (r: NextRequest) => Promise<Response>)(
  new NextRequest('http://x/api/cron/send-reminders', { headers: { authorization: `Bearer ${internalCronToken()}` } }))).json()
const invoice = (id: string, extra: Record<string, unknown> = {}) => ({
  id, org_id: 'org-a', invoice_number: id, status: 'sent', due_date: '2026-10-16', balance_due: 100, currency: 'JPY',
  reminder_paused: false, next_reminder_date: null, client_email: `${id}@example.com`, client_name: 'C', reminder_count: 0, ...extra,
})

beforeEach(() => {
  mail.sends.length = 0
  setMockTables({ organizations: [{ id: 'org-a' }], invoices: [], invoice_reminders: [] })
})

describe('daily reminder job', () => {
  it('reminds a sent invoice due in 3 days that has never been scheduled (next_reminder_date NULL)', async () => {
    setMockTables({ organizations: [{ id: 'org-a' }], invoices: [invoice('inv-new')], invoice_reminders: [] })
    const body: any = await run()
    expect(body.sent).toBe(1)
    expect(mail.sends.map(s => s.to)).toEqual(['inv-new@example.com'])
    const [row] = (await (createMockClient().from('invoices') as any).select('*')).data
    expect(row.reminder_count).toBe(1)
    expect(row.next_reminder_date).toBe('2026-10-20')
  })

  it('an unscheduled invoice that is not due for weeks is scheduled a week before, not mailed', async () => {
    setMockTables({ organizations: [{ id: 'org-a' }], invoices: [invoice('inv-far', { due_date: '2026-12-01' })], invoice_reminders: [] })
    const body: any = await run()
    expect(body.sent).toBe(0)
    const [row] = (await (createMockClient().from('invoices') as any).select('*')).data
    expect(row.next_reminder_date).toBe('2026-11-24')
  })

  it('still skips a date in the future, a draft and a paused invoice', async () => {
    setMockTables({
      organizations: [{ id: 'org-a' }],
      invoices: [
        invoice('inv-later', { next_reminder_date: '2026-10-20' }),
        invoice('inv-draft', { status: 'draft' }),
        invoice('inv-paused', { reminder_paused: true }),
      ],
      invoice_reminders: [],
    })
    await run()
    expect(mail.sends).toHaveLength(0)
  })
})
