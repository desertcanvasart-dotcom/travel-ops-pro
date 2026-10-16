// Settings audit (2026-10-14), findings 1–2: any member could attach their own
// Xero/QuickBooks to the company's books, and the connection was one row per
// PERSON — so a person in both companies moved one company's books to the
// other by connecting there, and Disconnect/Status ignored the company.
// Now: connect, disconnect and the callback are admin-only in the company
// acting in, the row is the company's (org_id, provider), and connecting one
// provider switches the other off — with the page told.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
const writes: { table: string; op: string; filters: Row; vals?: unknown; onConflict?: string }[] = []

function builder(table: string) {
  const c = { table, op: 'select', filters: {} as Row, vals: undefined as unknown, onConflict: undefined as string | undefined }
  const match = () => (tables[table] ?? []).filter(r => Object.entries(c.filters).every(([k, v]) => r[k] === v))
  const run = () => {
    if (c.op !== 'select') writes.push({ ...c })
    if (c.op === 'update') {
      const hit = match()
      for (const r of hit) Object.assign(r, c.vals as Row)
      return hit
    }
    if (c.op === 'delete') {
      const hit = match()
      tables[table] = (tables[table] ?? []).filter(r => !hit.includes(r))
      return hit
    }
    if (c.op === 'upsert') {
      const keys = (c.onConflict ?? '').split(',')
      const v = c.vals as Row
      const existing = (tables[table] ?? []).find(r => keys.every(k => r[k] === v[k]))
      if (existing) Object.assign(existing, v)
      else (tables[table] ??= []).push({ ...v })
      return [v]
    }
    return match()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b, order: () => b, limit: () => b,
    update: (v: unknown) => { c.op = 'update'; c.vals = v; return b },
    delete: () => { c.op = 'delete'; return b },
    upsert: (v: unknown, o?: { onConflict?: string }) => { c.op = 'upsert'; c.vals = v; c.onConflict = o?.onConflict; return b },
    eq: (k: string, v: unknown) => { c.filters[k] = v; return b },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    single: async () => ({ data: run()[0] ?? null, error: null }),
    then: (r: (v: unknown) => void) => r({ data: run(), error: null }),
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: builder }) }))

let session: { userId: string | null; orgId: string; role: string } = { userId: 'me', orgId: 'org-a', role: 'admin' }
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserId: async () => session.userId,
  getCurrentOrgId: async () => session.orgId,
  noOrgResponse: () => new Response(null, { status: 403 }),
  requireRole: async (allowed: string[]) =>
    session.role === 'owner' || allowed.includes(session.role)
      ? null
      : new Response(JSON.stringify({ error: 'Forbidden — insufficient role' }), { status: 403 }),
}))
vi.mock('@/lib/supabase-secure', () => ({
  getAuthenticatedUser: async () => ({ user: session.userId ? { id: session.userId } : null }),
}))
vi.mock('@/lib/oauth-state', () => ({ signState: (s: string) => s, verifyState: (s: string | null) => s }))
vi.mock('@/lib/oauth/csrf-nonce', () => ({
  newNonce: () => 'nonce', setNonceCookie: () => {}, clearNonceCookie: () => {}, nonceMatches: () => true,
}))
vi.mock('@/lib/crypto/token-cipher', () => ({ encryptToken: (s: string) => `enc:${s}` }))
vi.mock('@/lib/accounting', () => ({
  getAccountingProvider: () => ({
    getAuthUrl: (state: string) => `https://provider.example/auth?state=${state}`,
    exchangeCodeForTokens: async () => ({
      access_token: 'at', refresh_token: 'rt', expiry_date: Date.UTC(2027, 0, 1), company_name: 'Their Books Ltd',
    }),
  }),
}))

import * as connect from '@/app/api/auth/accounting/connect/route'
import * as callback from '@/app/api/auth/accounting/callback/route'
import * as disconnect from '@/app/api/auth/accounting/disconnect/route'
import * as status from '@/app/api/auth/accounting/status/route'
import { mayManageAccounting, parseAccountingState } from '@/lib/accounting/connection'

const post = (body: unknown) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) })
const back = (state: string) => new NextRequest(`http://x/api/auth/accounting/callback?code=c&state=${encodeURIComponent(state)}`)

beforeEach(() => {
  writes.length = 0
  tables = {
    organization_members: [
      { user_id: 'me', org_id: 'org-a', role: 'admin' },
      { user_id: 'me', org_id: 'org-b', role: 'admin' },
      { user_id: 'agent1', org_id: 'org-a', role: 'agent' },
    ],
    accounting_tokens: [],
  }
  session = { userId: 'me', orgId: 'org-a', role: 'admin' }
})

describe('who may connect the company\'s books', () => {
  it('admin and owner only; the owner passes', () => {
    expect(mayManageAccounting('owner')).toBe(true)
    expect(mayManageAccounting('admin')).toBe(true)
    for (const r of ['manager', 'agent', 'viewer', null, 'bogus']) expect(mayManageAccounting(r)).toBe(false)
  })

  it('a viewer, agent or manager POSTing connect is refused', async () => {
    for (const role of ['viewer', 'agent', 'manager']) {
      session.role = role
      expect((await connect.POST(post({ provider: 'xero' }))).status).toBe(403)
    }
  })

  it('an admin gets an auth URL whose state names the company acting in', async () => {
    const res = await connect.POST(post({ provider: 'xero' }))
    expect(res.status).toBe(200)
    const { authUrl } = await res.json()
    expect(decodeURIComponent(authUrl)).toContain('me:xero:org-a:nonce')
  })

  it('a state without the company, or with an unknown provider, is refused', () => {
    expect(parseAccountingState('me:xero::nonce')).toBeNull()
    expect(parseAccountingState('me:sage:org-a:nonce')).toBeNull()
    expect(parseAccountingState('me:quickbooks:org-a:n')).toEqual({ userId: 'me', provider: 'quickbooks', orgId: 'org-a', nonce: 'n' })
  })
})

describe('the callback re-checks role and company', () => {
  it('a state carrying a non-admin of that company attaches nothing', async () => {
    const res = await callback.GET(back('agent1:xero:org-a:nonce'))
    expect(res.headers.get('location')).toContain('error=not_admin')
    expect(writes.filter(w => w.table === 'accounting_tokens')).toHaveLength(0)
  })

  it('a state for a company the person is not in attaches nothing', async () => {
    const res = await callback.GET(back('agent1:xero:org-b:nonce'))
    expect(res.headers.get('location')).toContain('error=not_admin')
    expect(tables.accounting_tokens).toHaveLength(0)
  })

  it('an admin\'s connection is the company\'s row: upserted on (org_id, provider)', async () => {
    await callback.GET(back('me:xero:org-a:nonce'))
    const up = writes.find(w => w.op === 'upsert')!
    expect(up.onConflict).toBe('org_id,provider')
    expect(up.vals).toMatchObject({ org_id: 'org-a', provider: 'xero', user_id: 'me', is_active: true })
  })

  it('connecting the other provider switches the first off, and says so', async () => {
    tables.accounting_tokens.push({ org_id: 'org-a', provider: 'quickbooks', is_active: true, company_name: 'Old QB' })
    const res = await callback.GET(back('me:xero:org-a:nonce'))
    expect(res.headers.get('location')).toContain('replaced=quickbooks')
    expect(tables.accounting_tokens.find(r => r.provider === 'quickbooks')?.is_active).toBe(false)
    expect(tables.accounting_tokens.find(r => r.provider === 'xero')?.is_active).toBe(true)
  })

  it('a person in both companies connecting in B leaves A\'s connection and status as they were', async () => {
    tables.accounting_tokens.push({ org_id: 'org-a', provider: 'xero', is_active: true, company_name: 'A Books', user_id: 'me' })
    await callback.GET(back('me:xero:org-b:nonce'))
    session.orgId = 'org-a'
    expect(await (await status.GET()).json()).toMatchObject({ xero: { connected: true, company_name: 'A Books' } })
    session.orgId = 'org-b'
    expect(await (await status.GET()).json()).toMatchObject({ xero: { connected: true, company_name: 'Their Books Ltd' } })
  })
})

describe('disconnect and status are the company\'s', () => {
  it('disconnect is admin-only and deletes the company\'s row, not the caller\'s', async () => {
    session.role = 'manager'
    expect((await disconnect.POST(post({ provider: 'xero' }))).status).toBe(403)
    session.role = 'admin'
    tables.accounting_tokens.push(
      { org_id: 'org-a', provider: 'xero', user_id: 'colleague' },
      { org_id: 'org-b', provider: 'xero', user_id: 'me' },
    )
    expect((await disconnect.POST(post({ provider: 'xero' }))).status).toBe(200)
    const del = writes.find(w => w.op === 'delete')!
    expect(del.filters).toEqual({ org_id: 'org-a', provider: 'xero' })
    expect(tables.accounting_tokens).toEqual([{ org_id: 'org-b', provider: 'xero', user_id: 'me' }])
  })

  it('status shows a colleague\'s connection to every admin and manager; agents are refused', async () => {
    tables.accounting_tokens.push({ org_id: 'org-a', provider: 'quickbooks', is_active: true, company_name: 'QB Co', user_id: 'colleague' })
    session.role = 'manager'
    expect(await (await status.GET()).json()).toMatchObject({ quickbooks: { connected: true, company_name: 'QB Co' }, xero: null })
    session.role = 'agent'
    expect((await status.GET()).status).toBe(403)
  })
})
