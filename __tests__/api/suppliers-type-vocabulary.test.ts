// The suppliers API speaks the agency's supplier types.
//
// GET ?type=hotel returns the lodge too (it behaves as a hotel); POST refuses
// a role the agency has not defined, naming Settings → Vocabulary.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})

// The live vocabulary: built-ins plus "lodge" behaving as a hotel.
vi.mock('@/lib/vocabulary-server', () => ({
  supplierTypesForCurrentOrg: async () => [
    { key: 'hotel', label: 'Hotel', label_ja: null, behavior: 'hotel', is_active: true },
    { key: 'guide', label: 'Guide', label_ja: null, behavior: 'guide', is_active: true },
    { key: 'lodge', label: 'Lodge', label_ja: null, behavior: 'hotel', is_active: true },
  ],
}))

// The caller's company (suppliers.org_id, 20261205).
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-1',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { GET, POST } from '@/app/api/suppliers/route'

const get = async (qs: string) => {
  const res = await GET({ nextUrl: new URL(`http://x/api/suppliers${qs}`) } as never)
  return (await res.json()) as { data: { name: string }[] }
}
const post = async (body: Record<string, unknown>) => {
  const res = await POST({ json: async () => body } as never)
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  setMockTables({
    suppliers: [
      { id: 's-hotel', name: 'Nile Palace', type: 'hotel', types: ['hotel'], status: 'active', org_id: 'org-1' },
      { id: 's-lodge', name: 'Desert Lodge', type: 'lodge', types: ['lodge'], status: 'active', org_id: 'org-1' },
      { id: 's-guide', name: 'Sam', type: 'guide', types: ['guide'], status: 'active', org_id: 'org-1' },
      // Another company's hotel: never listed here.
      { id: 's-other', name: 'Other Company Hotel', type: 'hotel', types: ['hotel'], status: 'active', org_id: 'org-2' },
    ],
  })
})

describe('GET /api/suppliers?type=', () => {
  it('hotels include the lodge — it behaves as a hotel', async () => {
    const { data } = await get('?type=hotel')
    expect(data.map(s => s.name).sort()).toEqual(['Desert Lodge', 'Nile Palace'])
  })
  it('guides are only guides', async () => {
    const { data } = await get('?type=guide')
    expect(data.map(s => s.name)).toEqual(['Sam'])
  })
  it('the lodge can be asked for by its own key', async () => {
    const { data } = await get('?type=lodge')
    expect(data.map(s => s.name)).toEqual(['Desert Lodge'])
  })
})

describe('POST /api/suppliers', () => {
  it('files a supplier under an agency-added type', async () => {
    const { status } = await post({ name: 'Oasis Lodge', types: ['lodge'] })
    expect(status).toBe(201)
    const rows = (await (createMockClient().from('suppliers') as never as { select: (c: string) => Promise<{ data: { name: string; type: string }[] }> }).select('*')).data
    expect(rows.find(r => r.name === 'Oasis Lodge')?.type).toBe('lodge')
    expect((rows.find(r => r.name === 'Oasis Lodge') as { org_id?: string } | undefined)?.org_id).toBe('org-1')
  })
  it('refuses a role the agency has not defined, pointing at Settings', async () => {
    const { status, json } = await post({ name: 'Tuk Tuk Co', types: ['tuk_tuk'] })
    expect(status).toBe(400)
    expect(json.error).toMatch(/tuk_tuk/)
    expect(json.error).toMatch(/Settings → Vocabulary/)
  })
})
