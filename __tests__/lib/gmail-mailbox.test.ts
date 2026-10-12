// The owner saw "Connect Gmail" and an empty Email Inbox while a staff member
// had connected the company mailbox (operator, 2026-10-10). The mailbox a
// user works in: their own connection when it serves the active company,
// else the company's longest-standing connection, for the /inbox roles only.
// Each connection serves ONE company (gmail_tokens.org_id, 20261204).
import { vi, describe, it, expect, beforeEach } from 'vitest'

type Row = Record<string, unknown>
let tokens: Row[] = []
let role: string | null = 'admin'
let orgId: string | null = 'org-1'
let roleThrows = false

function query(rows: () => Row[]) {
  let out = rows()
  let sorted = false
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => { out = out.filter(r => r[col] === val); return q },
    in: (col: string, vals: unknown[]) => { out = out.filter(r => vals.includes(r[col])); return q },
    order: (col: string, opts: { ascending: boolean }) => {
      if (!sorted) out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (opts.ascending ? 1 : -1))
      sorted = true
      return q
    },
    limit: (n: number) => { out = out.slice(0, n); return q },
    maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: out, error: null }),
  }
  return q
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => query(() => tokens) }),
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserRole: async () => { if (roleThrows) throw new Error('no request'); return role },
  getCurrentOrgId: async () => { if (roleThrows) throw new Error('no request'); return orgId },
}))
vi.mock('@/lib/gmail', () => ({ getAuthenticatedGmail: vi.fn(), GmailAuthError: class extends Error {} }))

import { resolveMailbox } from '@/lib/gmail-mailbox'

beforeEach(() => {
  tokens = [{ id: 't-staff', user_id: 'staff', org_id: 'org-1', email: 'yoyaku@ats-hj.com', created_at: '2026-10-01', updated_at: '2026-10-12' }]
  role = 'admin'; orgId = 'org-1'; roleThrows = false
})

describe('resolveMailbox', () => {
  it("an owner with no connection works in the staff member's — the company mailbox", async () => {
    expect(await resolveMailbox('owner')).toEqual({ mailboxUserId: 'staff', shared: true, email: 'yoyaku@ats-hj.com', orgId: 'org-1' })
  })

  it('your own connection comes first', async () => {
    tokens.push({ id: 't-owner', user_id: 'owner', org_id: 'org-1', email: 'owner@ats-hj.com', created_at: '2026-10-11' })
    expect(await resolveMailbox('owner')).toEqual({ mailboxUserId: 'owner', shared: false, email: 'owner@ats-hj.com', orgId: 'org-1' })
  })

  it('the company mailbox is the longest-standing connection — not the most recently refreshed', async () => {
    // updated_at is rewritten on every token refresh; it used to decide.
    tokens.push({ id: 't-new', user_id: 'agent', org_id: 'org-1', email: 'agent@ats-hj.com', created_at: '2026-10-05', updated_at: '2026-10-13' })
    expect((await resolveMailbox('owner'))?.mailboxUserId).toBe('staff')
  })

  it('never another organisation’s mailbox', async () => {
    tokens = [{ id: 't-x', user_id: 'stranger', org_id: 'org-2', email: 'x@other.com', created_at: '2026-10-10' }]
    expect(await resolveMailbox('owner')).toBeNull()
  })

  it('a person in both companies whose own mailbox serves the other works in this company’s', async () => {
    tokens.push({ id: 't-both', user_id: 'both', org_id: 'org-2', email: 'both@other.com', created_at: '2026-01-01' })
    expect(await resolveMailbox('both')).toEqual({ mailboxUserId: 'staff', shared: true, email: 'yoyaku@ats-hj.com', orgId: 'org-1' })
    orgId = 'org-2'
    expect(await resolveMailbox('both')).toEqual({ mailboxUserId: 'both', shared: false, email: 'both@other.com', orgId: 'org-2' })
  })

  it('a role without inbox access gets no shared mailbox — only their own', async () => {
    role = 'viewer'
    expect(await resolveMailbox('owner')).toBeNull()
    expect((await resolveMailbox('staff'))?.mailboxUserId).toBe('staff')
  })

  it('outside a signed-in request there is no workspace, so no mailbox', async () => {
    roleThrows = true
    expect(await resolveMailbox('staff')).toBeNull()
  })
})
