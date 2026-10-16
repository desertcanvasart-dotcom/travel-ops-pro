// ============================================
// Deleting an extra a saved quote sells is refused, with the quotes named
// ============================================
// Sell follow-up (2026-10-13): a B2B calculator quote names a catalogue extra
// only by id, in a services_snapshot line { rate_source: 'extras_catalogue',
// service_id: <extra id> } (lib/pricing/extras-pricing). Deleting the extra
// gave no warning and the quote's next re-price showed it as "not found".
// DELETE now answers 409 with how many of the company's quotes use it and
// the newest few numbers; the page offers Deactivate instead.
//
// The fake client evaluates the jsonb containment (@>) the route sends, so
// the test pins both the filter and what the route does with the answer.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'

type Row = Record<string, any>
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, calls: [] as string[] }))

/** jsonb @> for an array of objects: every wanted element matches some element. */
function containsJson(value: unknown, wanted: Row[]): boolean {
  if (!Array.isArray(value)) return false
  return wanted.every((w) => value.some((v) => v && Object.entries(w).every(([k, x]) => v[k] === x)))
}

function query(table: string) {
  let rows = [...(db.tables[table] ?? [])]
  let del = false
  let count = false
  const b: any = {
    select: (_c?: string, o?: { count?: string }) => { if (o?.count) count = true; return b },
    delete: () => { del = true; return b },
    eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return b },
    contains: (c: string, v: string) => {
      db.calls.push(`${table}.${c} @> ${v}`)
      rows = rows.filter((r) => containsJson(r[c], JSON.parse(v)))
      return b
    },
    order: (c: string, o: { ascending: boolean }) => { rows.sort((a, z) => (a[c] < z[c] ? 1 : -1) * (o.ascending ? -1 : 1)); return b },
    limit: (n: number) => {
      const total = rows.length
      rows = rows.slice(0, n)
      return Promise.resolve({ data: rows, count: count ? total : null, error: null })
    },
    maybeSingle: () => {
      if (del) db.tables[table] = (db.tables[table] ?? []).filter((r) => !rows.includes(r))
      return Promise.resolve({ data: rows[0] ?? null, error: null })
    },
  }
  return b
}

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({ from: query }) }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))

import { DELETE, extraLineFilter, extraInUseMessage } from '@/app/api/extras-catalogue/[id]/route'

const del = async (id: string) => {
  const r = await DELETE(new NextRequest(`http://localhost/api/extras-catalogue/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
  return { status: r.status, json: await r.json() }
}
const line = (id: string) => ({ service_id: id, service_name: 'Fast-track', rate_source: 'extras_catalogue', line_total: 40 })

beforeEach(() => {
  db.calls = []
  db.tables = {
    extras_catalogue: [
      { id: 'x-used', org_id: 'org-1', name: 'Fast-track', is_active: true },
      { id: 'x-free', org_id: 'org-1', name: 'Late check-out', is_active: true },
      { id: 'x-many', org_id: 'org-1', name: 'Luggage', is_active: true },
    ],
    tour_quotes: [
      { id: 'q1', org_id: 'org-1', quote_number: 'QT-2026-00001', created_at: '2026-01-01', services_snapshot: [{ service_id: 'h1', rate_source: 'accommodation_rates' }, line('x-used')] },
      { id: 'q2', org_id: 'org-1', quote_number: 'QT-2026-00002', created_at: '2026-02-01', services_snapshot: [line('x-used')] },
      // Another company's quote naming the same id does not count.
      { id: 'q3', org_id: 'org-2', quote_number: 'QT-2026-00001', created_at: '2026-03-01', services_snapshot: [line('x-free')] },
      // An attraction line whose service_id happens to equal the id is not an extra.
      { id: 'q4', org_id: 'org-1', quote_number: 'QT-2026-00003', created_at: '2026-03-01', services_snapshot: [{ service_id: 'x-free', rate_source: 'entrance_fees' }] },
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `qm${i}`, org_id: 'org-1', quote_number: `QT-2026-001${i}`, created_at: `2026-05-0${i + 1}`, services_snapshot: [line('x-many')],
      })),
    ],
  }
})

describe('DELETE /api/extras-catalogue/[id]', () => {
  it('an extra a saved quote uses is refused with 409, the count and the quote numbers; it stays', async () => {
    const { status, json } = await del('x-used')
    expect(status).toBe(409)
    expect(json.in_use).toEqual({ count: 2, quote_numbers: ['QT-2026-00002', 'QT-2026-00001'] })
    expect(json.error).toBe('This extra is used by 2 saved quotes (QT-2026-00002, QT-2026-00001). Deactivate it instead, so those quotes keep it.')
    expect(db.tables.extras_catalogue.map((x) => x.id)).toContain('x-used')
    expect(db.calls).toEqual([`tour_quotes.services_snapshot @> [{"rate_source":"extras_catalogue","service_id":"x-used"}]`])
  })

  it('names the newest five and counts the rest', async () => {
    const { status, json } = await del('x-many')
    expect(status).toBe(409)
    expect(json.in_use.count).toBe(7)
    expect(json.in_use.quote_numbers).toEqual(['QT-2026-0016', 'QT-2026-0015', 'QT-2026-0014', 'QT-2026-0013', 'QT-2026-0012'])
    expect(json.error).toMatch(/used by 7 saved quotes \(QT-2026-0016, .* and 2 more\)\./)
  })

  it('an extra no quote of this company sells is deleted', async () => {
    const { status, json } = await del('x-free')
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(db.tables.extras_catalogue.map((x) => x.id)).not.toContain('x-free')
  })

  it('the filter and message helpers', () => {
    expect(JSON.parse(extraLineFilter('e1'))).toEqual([{ rate_source: 'extras_catalogue', service_id: 'e1' }])
    expect(extraInUseMessage({ count: 1, quote_numbers: ['QT-1'] })).toBe('This extra is used by 1 saved quote (QT-1). Deactivate it instead, so those quotes keep it.')
  })
})

describe('the Extras page', () => {
  const page = readFileSync('app/rates/extras/page.tsx', 'utf8')
  it('shows the refusal with a Deactivate button that switches the extra off (PUT is_active: false)', () => {
    expect(page).toMatch(/res\.status === 409 && data\.in_use/)
    expect(page).toContain("t('inUse'")
    expect(page).toContain("t('deactivate')")
    expect(page).toMatch(/method: 'PUT'[\s\S]{0,120}JSON\.stringify\(\{ is_active: false \}\)/)
  })

  it('has the strings in both languages', () => {
    for (const f of ['messages/en.json', 'messages/ja.json']) {
      const extras = JSON.parse(readFileSync(f, 'utf8')).rates.extras
      expect(extras.inUse, f).toContain('{numbers}')
      expect(extras.deactivate, f).toBeTruthy()
      expect(extras.deactivateFailed, f).toBeTruthy()
    }
  })
})
