// Sweep (medium security): email signatures and email links took userId from
// the query/body, and POST /api/notifications let any session — viewer
// included — alert and email anyone with any text and link.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const calls: { table: string; op: string; filters: Record<string, unknown>; vals?: unknown }[] = []
let rows: Record<string, unknown[]> = {}

function builder(table: string) {
  const c = { table, op: 'select', filters: {} as Record<string, unknown>, vals: undefined as unknown }
  calls.push(c)
  const result = () => {
    const list = (rows[table] ?? []).filter(r =>
      Object.entries(c.filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
    return list
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b, order: () => b, ilike: () => b,
    insert: (v: unknown) => { c.op = 'insert'; c.vals = v; return b },
    update: (v: unknown) => { c.op = 'update'; c.vals = v; return b },
    delete: () => { c.op = 'delete'; return b },
    eq: (k: string, v: unknown) => { c.filters[k] = v; return b },
    single: async () => ({ data: result()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
    then: (r: (v: unknown) => void) => r({ data: result(), error: null }),
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: builder }) }))

let session = { userId: 'me', orgId: 'org-a', role: 'agent' }
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserId: async () => session.userId,
  getCurrentOrgId: async () => session.orgId,
  requireRole: async (allowed: string[]) =>
    allowed.includes(session.role) ? null : new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
}))
const createNotification = vi.fn(async () => ({ success: true, notification: {}, emailed: false }))
vi.mock('@/lib/notifications', () => ({ createNotification: (...a: unknown[]) => createNotification(...(a as [])) }))
vi.mock('@/lib/notifications-scope', () => ({ linkedTeamMemberIds: vi.fn(), notificationScopeFilter: vi.fn() }))

import * as signatures from '@/app/api/email/signatures/route'
import * as links from '@/app/api/email/links/route'
import * as notifications from '@/app/api/notifications/route'

const json = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body) })

beforeEach(() => {
  calls.length = 0
  rows = {}
  session = { userId: 'me', orgId: 'org-a', role: 'agent' }
  createNotification.mockClear()
})

describe('email signatures act on the session user', () => {
  it('GET ignores ?userId=', async () => {
    await signatures.GET(new NextRequest('http://x/api/email/signatures?userId=colleague'))
    expect(calls[0].filters.user_id).toBe('me')
  })
  it('POST writes the signature for the session user, not the body userId', async () => {
    await signatures.POST(json('http://x', 'POST', { userId: 'colleague', name: 'n', content: '<a href="evil">pay</a>' }))
    expect(calls.find(c => c.op === 'insert')?.vals).toMatchObject({ user_id: 'me' })
  })
  it('PUT and DELETE are scoped to the session user', async () => {
    await signatures.PUT(json('http://x', 'PUT', { id: 's1', userId: 'colleague', name: 'n', content: 'c' }))
    await signatures.DELETE(json('http://x', 'DELETE', { id: 's1', userId: 'colleague' }))
    for (const c of calls.filter(c => c.op !== 'select')) expect(c.filters.user_id).toBe('me')
  })
  it('no session → 401', async () => {
    session.userId = null as unknown as string
    expect((await signatures.GET(new NextRequest('http://x'))).status).toBe(401)
  })
})

describe('email links', () => {
  it('cannot link an email to a client of another workspace', async () => {
    rows.clients = [{ id: 'c-other', org_id: 'org-b' }]
    const res = await links.POST(json('http://x', 'POST', { userId: 'colleague', messageId: 'm1', clientId: 'c-other' }))
    expect(res.status).toBe(404)
    expect(calls.some(c => c.table === 'email_client_links' && c.op === 'insert')).toBe(false)
  })
  it('links for the session user when the client is ours', async () => {
    rows.clients = [{ id: 'c1', org_id: 'org-a' }]
    await links.POST(json('http://x', 'POST', { userId: 'colleague', messageId: 'm1', clientId: 'c1' }))
    expect(calls.find(c => c.table === 'email_client_links' && c.op === 'insert')?.vals).toMatchObject({ user_id: 'me' })
  })
  it('DELETE only removes the session user\'s links', async () => {
    await links.DELETE(json('http://x', 'DELETE', { userId: 'colleague', linkId: 'l1' }))
    expect(calls.find(c => c.op === 'delete')?.filters.user_id).toBe('me')
  })
  it('client lookup by address is scoped to the workspace', async () => {
    await links.GET(new NextRequest('http://x/api/email/links?emailAddress=a@b.c'))
    expect(calls.find(c => c.table === 'clients')?.filters.org_id).toBe('org-a')
  })
})

describe('POST /api/notifications', () => {
  const post = (body: unknown) => notifications.POST(json('http://x', 'POST', body))
  const ok = { team_member_id: 'tm1', type: 'task_assigned', title: 'T', message: 'M', link: '/tasks' }

  it('a viewer cannot send notifications', async () => {
    session.role = 'viewer'
    expect((await post(ok)).status).toBe(403)
    expect(createNotification).not.toHaveBeenCalled()
  })
  it.each(['https://evil.example/pay', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'rejects an off-app link %s', async link => {
      expect((await post({ ...ok, link })).status).toBe(400)
      expect(createNotification).not.toHaveBeenCalled()
    })
  it('rejects a login recipient outside the workspace', async () => {
    rows.organization_members = [{ org_id: 'org-b', user_id: 'stranger' }]
    expect((await post({ ...ok, team_member_id: undefined, user_id: 'stranger' })).status).toBe(404)
  })
  it('rejects oversized text', async () => {
    expect((await post({ ...ok, message: 'x'.repeat(2001) })).status).toBe(400)
  })
  it('the task-assignment call still works', async () => {
    expect((await post(ok)).status).toBe(200)
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ team_member_id: 'tm1', link: '/tasks' }))
  })
})
