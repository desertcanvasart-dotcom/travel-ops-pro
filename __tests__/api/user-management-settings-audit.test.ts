// Settings audit, User Management and Activity Log routes:
//   - the roster (/api/profiles), pending invitations (/api/invitations) and
//     the members list (/api/organization/members) are admin/manager reads;
//     a viewer or agent got them although no menu shows them
//   - the roster says who also belongs to another company
//   - an admin removes such a person from THIS company (membership only),
//     never an admin or the owner; the removal is logged with the old role
//   - accepting an invitation is logged in the inviting company
//   - the Activity Log filters by the viewer's local days and names the
//     person, never the log row's own id
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { roleAllows } from '@/lib/auth/roles'

const ctx = vi.hoisted(() => ({ role: 'admin', userId: 'u-admin', email: 'admin@a.test' }))
const logged = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    ...createMockClient(),
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async () => ({ data: { user: { id: 'u-new' } }, error: null }),
      },
    },
  }),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: ctx.userId, email: ctx.email } } }) } }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-a',
    getCurrentUserId: async () => ctx.userId,
    getCurrentUserRole: async () => ctx.role,
    requireRole: async (allowed: string[]) =>
      roleAllows(ctx.role, allowed) ? null : NextResponse.json({ success: false }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/activity-log', () => ({
  recordChange: async (c: Record<string, unknown>) => { logged.calls.push(c) },
}))

import * as profiles from '@/app/api/profiles/route'
import * as invitations from '@/app/api/invitations/route'
import * as members from '@/app/api/organization/members/route'
import * as accept from '@/app/api/invitations/accept/route'
import * as activity from '@/app/api/activity/route'

const get = (url: string) => new NextRequest(`http://x${url}`)
const removeMember = (userId: string) =>
  members.DELETE(new NextRequest(`http://x/api/organization/members?user_id=${userId}`, { method: 'DELETE' }))

beforeEach(() => {
  ctx.role = 'admin'
  ctx.userId = 'u-admin'
  logged.calls.length = 0
  setMockTables({
    organization_members: [
      { org_id: 'org-a', user_id: 'u-owner', role: 'owner', created_at: '1' },
      { org_id: 'org-a', user_id: 'u-admin', role: 'admin', created_at: '2' },
      { org_id: 'org-a', user_id: 'u-admin2', role: 'admin', created_at: '3' },
      { org_id: 'org-a', user_id: 'u-dual', role: 'agent', created_at: '4' },
      { org_id: 'org-b', user_id: 'u-dual', role: 'manager', created_at: '5' },
    ],
    user_profiles: [
      { id: 'u-owner', email: 'owner@a.test', is_active: true, created_at: '1' },
      { id: 'u-admin', email: 'admin@a.test', is_active: true, created_at: '2' },
      { id: 'u-admin2', email: 'admin2@a.test', is_active: true, created_at: '3' },
      { id: 'u-dual', email: 'dual@a.test', full_name: 'Dual', is_active: true, created_at: '4' },
    ],
    user_invitations: [
      { id: 'inv-1', org_id: 'org-a', email: 'new@a.test', role: 'manager', token: 'tok', accepted_at: null,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(), created_at: '1' },
    ],
    activity_log: [
      { id: 'row-1', org_id: 'org-a', user_id: 'u-admin', user_email: null, action: 'update', entity_type: 'profiles',
        method: 'PUT', path: '/api/profiles/x', created_at: '2026-10-13T16:00:00.000Z' },
      { id: 'row-2', org_id: 'org-a', user_id: 'u-gone', user_email: null, action: 'update', entity_type: 'rates',
        method: 'PUT', path: '/api/rates/x', created_at: '2026-10-13T14:00:00.000Z' },
      { id: 'row-3', org_id: 'org-a', user_id: 'u-dual', user_email: 'dual@a.test', action: 'create', entity_type: 'rates',
        method: 'POST', path: '/api/rates', created_at: '2026-10-14T15:30:00.000Z' },
    ],
  })
})

describe('admin/manager reads', () => {
  it.each(['viewer', 'agent'])('%s gets 403 from the roster, the invitations and the members list', async role => {
    ctx.role = role
    expect((await profiles.GET(get('/api/profiles'))).status).toBe(403)
    expect((await invitations.GET(get('/api/invitations'))).status).toBe(403)
    expect((await members.GET()).status).toBe(403)
  })
  it.each(['manager', 'admin', 'owner'])('%s reads them', async role => {
    ctx.role = role
    expect((await profiles.GET(get('/api/profiles'))).status).toBe(200)
    expect((await invitations.GET(get('/api/invitations'))).status).toBe(200)
    expect((await members.GET()).status).toBe(200)
  })
  it('the roster marks who also belongs to another company', async () => {
    const r = await (await profiles.GET(get('/api/profiles'))).json()
    const flags = Object.fromEntries(r.data.map((p: { id: string; other_companies: boolean }) => [p.id, p.other_companies]))
    expect(flags).toEqual({ 'u-owner': false, 'u-admin': false, 'u-admin2': false, 'u-dual': true })
  })
})

describe('Remove from this company', () => {
  it('an admin removes an agent from THIS company only, and it is logged with the old role', async () => {
    const r = await removeMember('u-dual')
    expect(r.status).toBe(200)
    const r2 = await (await profiles.GET(get('/api/profiles'))).json()
    expect(r2.data.map((p: { id: string }) => p.id)).not.toContain('u-dual')
    // the other company's membership and the profile are untouched
    ctx.role = 'owner'
    const left = await (await members.GET()).json()
    expect(left.data.map((m: { user_id: string }) => m.user_id)).not.toContain('u-dual')
    expect(logged.calls[0]).toMatchObject({
      org_id: 'org-a', user_id: 'u-admin', method: 'DELETE',
      detail: { target: 'dual@a.test', changes: [{ field: 'membership', from: 'agent', to: null }] },
    })
  })
  it('the other company keeps the person', async () => {
    await removeMember('u-dual')
    const { createMockClient: c } = await import('../_mock-supabase')
    const { data } = await c().from('organization_members').select('*').eq('user_id', 'u-dual')
    expect(data).toEqual([expect.objectContaining({ org_id: 'org-b', role: 'manager' })])
  })
  it('an admin cannot remove another admin or the owner; the owner can remove an admin', async () => {
    expect((await removeMember('u-admin2')).status).toBe(403)
    expect((await removeMember('u-owner')).status).toBe(403)
    expect(logged.calls).toEqual([])
    ctx.role = 'owner'; ctx.userId = 'u-owner'
    expect((await removeMember('u-admin2')).status).toBe(200)
  })
  it('someone not in this company is a 404', async () => {
    expect((await removeMember('u-stranger')).status).toBe(404)
  })
})

describe('invitation accepted', () => {
  it('logs the new member and their role in the inviting company', async () => {
    const r = await accept.POST(new NextRequest('http://x/api/invitations/accept', {
      method: 'POST', body: JSON.stringify({ token: 'tok', password: 'a-long-enough-password', fullName: 'New' }),
    }))
    expect(r.status).toBe(200)
    expect(logged.calls).toEqual([expect.objectContaining({
      org_id: 'org-a', user_id: 'u-new', user_email: 'new@a.test', path: '/api/invitations/accept',
      detail: { target: 'new@a.test', changes: [{ field: 'membership', from: null, to: 'manager' }] },
    })])
  })
})

describe('Activity Log route', () => {
  it('From/To are the viewer’s days: 14 Oct in Tokyo is 13 Oct 15:00Z – 14 Oct 15:00Z', async () => {
    const r = await (await activity.GET(get('/api/activity?from=2026-10-14&to=2026-10-14&tz=Asia/Tokyo'))).json()
    expect(r.data.map((e: { id: string }) => e.id)).toEqual(['row-1'])
  })
  it('without a zone the days are UTC, as before', async () => {
    const r = await (await activity.GET(get('/api/activity?from=2026-10-14&to=2026-10-14'))).json()
    expect(r.data.map((e: { id: string }) => e.id)).toEqual(['row-3'])
  })
  it('Who falls back to the person’s profile, never to the log row id', async () => {
    const r = await (await activity.GET(get('/api/activity'))).json()
    const who = Object.fromEntries(r.data.map((e: { id: string; user_label: string | null }) => [e.id, e.user_label]))
    expect(who).toEqual({ 'row-1': 'admin@a.test', 'row-2': null, 'row-3': 'dual@a.test' })
    expect(r.data.find((e: { id: string }) => e.id === 'row-2').user_id).toBe('u-gone')
  })
})
