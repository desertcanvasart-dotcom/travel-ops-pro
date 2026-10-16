// GET /api/cruises/assignable reads both sources; one failing still lists the other.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tables: Record<string, { data: any[] | null; error: { message: string } | null }> = {}
vi.mock('@/lib/supabase-server', () => ({
  // select(…).eq('org_id', …): the company's own rows.
  createServerClient: () => ({ from: (t: string) => ({ select: () => ({ eq: async (c: string, v: string) => (c === 'org_id' && v === 'org-1' ? tables[t] : { data: [], error: null }) }) }) }),
}))

// The caller's company: every rate route reads and stamps it (20261206).
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-1',
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => 'admin',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { GET } from '@/app/api/cruises/assignable/route'

beforeEach(() => {
  tables.cruise_contacts = { data: [{ id: 'd1', name: 'Sonesta', route: 'Luxor - Aswan' }], error: null }
  tables.nile_cruises = { data: [{ id: 'c1', ship_name: 'Adonis', route_name: 'Lake Nasser' }], error: null }
})

describe('the cruise picker list', () => {
  it('both sources, one entry per ship per route', async () => {
    const { data } = await (await GET()).json()
    expect(data.map((c: any) => [c.name, c.route])).toEqual([['Adonis', 'Lake Nasser'], ['Sonesta', 'luxor_aswan']])
  })
  it('one source failing still lists the other; both failing is an error', async () => {
    tables.nile_cruises = { data: null, error: { message: 'boom' } }
    expect((await (await GET()).json()).data.map((c: any) => c.name)).toEqual(['Sonesta'])
    tables.cruise_contacts = { data: null, error: { message: 'boom' } }
    expect((await GET()).status).toBe(500)
  })
})
