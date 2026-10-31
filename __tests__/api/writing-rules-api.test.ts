// Writing Rules screen and API.
//
// WR5: rules could not be turned off from the screen, and the list showed only
// active ones (an inactive rule was invisible). The page lists every rule
// (active_only=false), dims inactive ones and has an Active toggle.
// WR6: an empty applies_to was stored as [] ([] is truthy, so `|| ['all']`
// never applied) and PATCH did not validate it at all.
// WR7: DEFAULT_FORM's example arrays were edited in place, so the next new
// rule opened with the previous one's examples.
// WR8: no empty state.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    ...createMockClient(),
    auth: { getUser: async () => ({ data: { user: { id: 'ua1' } }, error: null }) },
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {}, get: () => undefined }) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-a' }))

import * as rules from '@/app/api/content-library/writing-rules/route'

const req = (method: string, body?: unknown, url = '/api/content-library/writing-rules') =>
  new NextRequest(`http://x${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = async () => ((await createMockClient().from('writing_rules').select()) as { data: any[] }).data
const base = { name: 'Warm', category: 'tone', rule_type: 'enforce', description: 'Write warmly' }

beforeEach(() => {
  setMockTables({
    writing_rules: [
      { id: 'on', org_id: 'org-a', ...base, priority: 5, is_active: true, applies_to: ['all'] },
      { id: 'off', org_id: 'org-a', ...base, name: 'Old', priority: 4, is_active: false, applies_to: ['all'] },
    ],
  })
})

describe('applies_to (WR6)', () => {
  it('POST with none or an empty list stores ["all"]; an unknown channel is a 400', async () => {
    expect((await rules.POST(req('POST', { ...base, name: 'A', applies_to: [] }))).status).toBe(201)
    expect((await rules.POST(req('POST', { ...base, name: 'B' }))).status).toBe(201)
    const rows = await table()
    expect(rows.find(r => r.name === 'A').applies_to).toEqual(['all'])
    expect(rows.find(r => r.name === 'B').applies_to).toEqual(['all'])
    expect((await rules.POST(req('POST', { ...base, applies_to: ['fax'] }))).status).toBe(400)
    expect((await rules.POST(req('POST', { ...base, applies_to: 'all' }))).status).toBe(400)
  })

  it('PATCH validates it the same way', async () => {
    expect((await rules.PATCH(req('PATCH', { id: 'on', applies_to: ['fax'] }))).status).toBe(400)
    expect((await rules.PATCH(req('PATCH', { id: 'on', applies_to: [] }))).status).toBe(200)
    expect((await table()).find(r => r.id === 'on').applies_to).toEqual(['all'])
    expect((await rules.PATCH(req('PATCH', { id: 'on', applies_to: ['itinerary', 'email'] }))).status).toBe(200)
    expect((await table()).find(r => r.id === 'on').applies_to).toEqual(['itinerary', 'email'])
  })
})

describe('active / inactive (WR5)', () => {
  it('the list holds inactive rules when asked (as the page asks), and a rule can be turned off and on', async () => {
    const active = await (await rules.GET(req('GET'))).json()
    expect(active.map((r: { id: string }) => r.id)).toEqual(['on'])
    const all = await (await rules.GET(req('GET', undefined, '/api/content-library/writing-rules?active_only=false'))).json()
    expect(all.map((r: { id: string }) => r.id).sort()).toEqual(['off', 'on'])

    expect((await rules.PATCH(req('PATCH', { id: 'off', is_active: true }))).status).toBe(200)
    expect((await table()).find(r => r.id === 'off').is_active).toBe(true)
    expect((await rules.PATCH(req('PATCH', { id: 'off', is_active: 'yes' }))).status).toBe(400)
  })
})

describe('the Writing Rules page', () => {
  const page = readFileSync(join(process.cwd(), 'app/settings/content-library/rules/page.tsx'), 'utf8')
  it('lists every rule, dims inactive ones and toggles them (WR5)', () => {
    expect(page).toContain("fetch('/api/content-library/writing-rules?active_only=false')")
    expect(page).toContain("rule.is_active ? '' : 'opacity-60'")
    expect(page).toContain('body: JSON.stringify({ id: rule.id, is_active: !rule.is_active })')
  })
  it('never edits a shared default form in place (WR7)', () => {
    expect(page).not.toContain('DEFAULT_FORM')
    expect(page).toContain('useState<RuleFormData>(defaultForm)')
    expect(page).toContain('setFormData(defaultForm())')
    expect(page).not.toMatch(/newExamples\[type\]\.push|newExamples\[type\]\[index\] =/)
  })
  it('has an empty state (WR8)', () => {
    expect(page).toContain("t('emptyTitle')")
  })
})
