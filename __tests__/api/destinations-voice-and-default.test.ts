// Settings audit (2026-10-14), findings 16–17.
// 16: GET /api/destinations dropped generation_brief and never selected the
//     glossary, so both boxes loaded blank and saving one wiped the other.
// 17: "Make default" cleared the company's default BEFORE checking the id, so
//     a bad id left the company with no default; a blank name was stored.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ role: 'admin' }))
vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-a',
    requireRole: async (allowed: string[]) =>
      ctx.role === 'owner' || allowed.includes(ctx.role) ? null : NextResponse.json({ success: false }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { GET } from '@/app/api/destinations/route'
import { POST as manage } from '@/app/api/destinations/manage/route'

const db = () => createMockClient()
const rows = async (table: string) => ((await db().from(table).select('*')) as unknown as { data: Array<Record<string, any>> }).data
const act = (body: unknown) => manage(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  ctx.role = 'admin'
  setMockTables({
    destinations: [
      { id: 'd-eg', org_id: 'org-a', country_code: 'EG', name: 'Egypt', is_default: true, is_active: true,
        generation_brief: 'Warm, precise.', glossary: { text: 'felucca = sailing boat' }, destination_cities: [] },
      { id: 'd-jo', org_id: 'org-a', country_code: 'JO', name: 'Jordan', is_default: false, is_active: true,
        generation_brief: null, glossary: null, destination_cities: [] },
      { id: 'd-other', org_id: 'org-b', country_code: 'MA', name: 'Morocco', is_default: true, is_active: true, destination_cities: [] },
    ],
  })
})

describe('the destination voice round-trips', () => {
  it('the settings read returns the brief AND the glossary', async () => {
    const res = await GET(new NextRequest('http://x/api/destinations?include_inactive=1'))
    const eg = (await res.json()).data.find((d: { id: string }) => d.id === 'd-eg')
    expect(eg.generation_brief).toBe('Warm, precise.')
    expect(eg.glossary).toEqual({ text: 'felucca = sailing boat' })
  })

  it('the dropdowns\' read does not carry them', async () => {
    const res = await GET(new NextRequest('http://x/api/destinations'))
    const eg = (await res.json()).data.find((d: { id: string }) => d.id === 'd-eg')
    expect(eg).not.toHaveProperty('glossary')
  })

  it('saving the brief alone keeps the glossary, and the reverse', async () => {
    expect((await act({ action: 'update_destination', id: 'd-eg', generation_brief: 'Short and warm.' })).status).toBe(200)
    let eg = (await rows('destinations')).find(d => d.id === 'd-eg')!
    expect(eg.generation_brief).toBe('Short and warm.')
    expect(eg.glossary).toEqual({ text: 'felucca = sailing boat' })
    expect((await act({ action: 'update_destination', id: 'd-eg', glossary: 'wadi = valley' })).status).toBe(200)
    eg = (await rows('destinations')).find(d => d.id === 'd-eg')!
    expect(eg.generation_brief).toBe('Short and warm.')
    expect(eg.glossary).toEqual({ text: 'wadi = valley' })
  })
})

describe('Make default never leaves the company without one', () => {
  it('an id that is not this company\'s is 404 and the default stays', async () => {
    const res = await act({ action: 'update_destination', id: 'd-other', is_default: true })
    expect(res.status).toBe(404)
    const all = await rows('destinations')
    expect(all.filter(d => d.org_id === 'org-a' && d.is_default).map(d => d.id)).toEqual(['d-eg'])
    expect(all.find(d => d.id === 'd-other')!.is_default).toBe(true)
  })

  it('a real switch leaves exactly one default', async () => {
    expect((await act({ action: 'update_destination', id: 'd-jo', is_default: true })).status).toBe(200)
    const all = await rows('destinations')
    expect(all.filter(d => d.org_id === 'org-a' && d.is_default).map(d => d.id)).toEqual(['d-jo'])
    expect(all.find(d => d.id === 'd-other')!.is_default).toBe(true) // another company's untouched
  })

  it('a blank name is refused', async () => {
    const res = await act({ action: 'update_destination', id: 'd-eg', name: '   ' })
    expect(res.status).toBe(400)
    expect((await rows('destinations')).find(d => d.id === 'd-eg')!.name).toBe('Egypt')
  })

  it('a manager is refused (the page renders read-only for them)', async () => {
    ctx.role = 'manager'
    expect((await act({ action: 'update_destination', id: 'd-jo', is_default: true })).status).toBe(403)
  })
})
