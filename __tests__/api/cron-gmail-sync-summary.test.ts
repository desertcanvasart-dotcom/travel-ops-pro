// The gmail-sync cron answered with no x-job-detail, so job_runs could not say
// whether a run downloaded 50 messages or none. It now reports one line:
// how much was fetched vs already stored (lib/email/sync-mailbox).
import { vi, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

const syncMailbox = vi.fn()
const applyOfficeRuleWhenDue = vi.fn()
vi.mock('@/lib/cron/auth', () => ({ cronAuthorized: () => true }))
vi.mock('@/lib/email/sync-mailbox', () => ({ syncMailbox: (...a: unknown[]) => syncMailbox(...a) }))
vi.mock('@/lib/email/office-addresses-server', () => ({
  loadOfficeRule: async () => ({ addresses: [], domains: [] }),
  applyOfficeRuleWhenDue: (...a: unknown[]) => applyOfficeRuleWhenDue(...a),
}))
vi.mock('@/lib/email/email-leads', () => ({ processNewEmailLeads: async () => [] }))
vi.mock('@/lib/supabase-server', () => {
  const q: any = {
    select: () => q, not: () => q, insert: () => q, update: () => q, delete: () => q, eq: () => q, lt: () => q,
    single: async () => ({ data: { id: 'run1' }, error: null }),
    then: (res: (v: unknown) => void) => res({ data: [{ user_id: 'u1' }], error: null }),
  }
  return { createServerClient: () => ({ from: () => q }) }
})

import { GET } from '@/app/api/cron/gmail-sync/route'

describe('gmail-sync cron summary', () => {
  it('says how much was fetched vs already stored, and runs the sync incrementally', async () => {
    syncMailbox.mockResolvedValue({ success: true, messages_created: 3, messages_fetched: 3, messages_already_stored: 47, sync_mode: 'history', history_id: '1', conversations_created: 0, conversations_updated: 2 })
    applyOfficeRuleWhenDue.mockResolvedValue(null)
    const res = await GET(new NextRequest('http://x/api/cron/gmail-sync'))
    expect(res.status).toBe(200)
    expect(syncMailbox).toHaveBeenCalledWith('u1', expect.objectContaining({ use_history: true }))
    expect(res.headers.get('x-job-outcome')).toBe('ok')
    expect(res.headers.get('x-job-detail')).toContain('fetched 3 new, 47 already stored')
    expect(res.headers.get('x-job-detail')).toContain('office repair not due')
  })
})
