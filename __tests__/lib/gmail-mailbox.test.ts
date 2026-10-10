// The owner saw "Connect Gmail" and an empty Email Inbox while a staff member
// had connected the company mailbox (operator, 2026-10-10). The mailbox a
// user works in: their own connection, else the organisation's shared one,
// for the /inbox roles only.
import { vi, describe, it, expect, beforeEach } from 'vitest'

type Row = Record<string, unknown>
let tokens: Row[] = []
let members: Row[] = []
let role: string | null = 'admin'
let orgId: string | null = 'org-1'
let roleThrows = false

function query(rows: () => Row[]) {
  let out = rows()
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => { out = out.filter(r => r[col] === val); return q },
    in: (col: string, vals: unknown[]) => { out = out.filter(r => vals.includes(r[col])); return q },
    order: (col: string, opts: { ascending: boolean }) => {
      out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (opts.ascending ? 1 : -1))
      return q
    },
    limit: (n: number) => { out = out.slice(0, n); return q },
    maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: out, error: null }),
  }
  return q
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => query(() => (t === 'gmail_tokens' ? tokens : members)) }),
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserRole: async () => { if (roleThrows) throw new Error('no request'); return role },
  getCurrentOrgId: async () => orgId,
}))
vi.mock('@/lib/gmail', () => ({ getAuthenticatedGmail: vi.fn(), GmailAuthError: class extends Error {} }))

import { resolveMailbox } from '@/lib/gmail-mailbox'

beforeEach(() => {
  tokens = [{ user_id: 'staff', email: 'yoyaku@ats-hj.com', updated_at: '2026-10-10' }]
  members = [{ org_id: 'org-1', user_id: 'owner' }, { org_id: 'org-1', user_id: 'staff' }, { org_id: 'org-2', user_id: 'stranger' }]
  role = 'admin'; orgId = 'org-1'; roleThrows = false
})

describe('resolveMailbox', () => {
  it("an owner with no connection works in the staff member's — the company mailbox", async () => {
    expect(await resolveMailbox('owner')).toEqual({ mailboxUserId: 'staff', shared: true, email: 'yoyaku@ats-hj.com' })
  })

  it('your own connection comes first', async () => {
    tokens.push({ user_id: 'owner', email: 'owner@ats-hj.com', updated_at: '2026-10-11' })
    expect(await resolveMailbox('owner')).toEqual({ mailboxUserId: 'owner', shared: false, email: 'owner@ats-hj.com' })
  })

  it('never another organisation’s mailbox', async () => {
    tokens = [{ user_id: 'stranger', email: 'x@other.com', updated_at: '2026-10-10' }]
    expect(await resolveMailbox('owner')).toBeNull()
  })

  it('a role without inbox access gets no shared mailbox', async () => {
    role = 'viewer'
    expect(await resolveMailbox('owner')).toBeNull()
  })

  it('outside a signed-in request only your own connection counts', async () => {
    roleThrows = true
    expect(await resolveMailbox('owner')).toBeNull()
  })
})
