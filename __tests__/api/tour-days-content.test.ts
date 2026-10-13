// CL8: tour_day_activities.content_id has no foreign key, so PostgREST cannot
// embed content_library(...) from an activity (PGRST200). The day builder's
// route embedded it in its list, add and edit selects: the day plan never
// loaded, and adding or editing an activity saved it and answered 500. The
// content is now read with its own query and attached as `content_library`.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

// A client that answers like PostgREST: a select embedding content_library
// from tour_day_activities fails, as it does without a foreign key.
function client() {
  const db = createMockClient()
  return {
    ...db,
    from: (table: string) => {
      const q = db.from(table)
      if (table !== 'tour_day_activities') return q
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrap = (b: any): any => new Proxy(b, {
        get(target, prop) {
          const v = target[prop]
          if (prop === 'select') {
            return (cols?: string) => {
              if (typeof cols === 'string' && /content_library\s*\(/.test(cols)) {
                const failing: any = { then: (r: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { code: 'PGRST200', message: 'Could not find a relationship' } }).then(r) }
                failing.single = () => failing
                failing.eq = () => failing
                failing.order = () => failing
                return failing
              }
              return wrap(v.call(target, cols))
            }
          }
          if (typeof v !== 'function' || prop === 'then') return v
          return (...a: unknown[]) => {
            const out = v.apply(target, a)
            return out instanceof Promise ? out : wrap(out)
          }
        },
      })
      return wrap(q)
    },
  }
}

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => client(),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-a',
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => 'manager',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { GET, POST, PATCH } from '@/app/api/tours/templates/[id]/days/route'

const json = (body: unknown) =>
  new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  setMockTables({
    tour_templates: [{ id: 'tpl-a', org_id: 'org-a', template_name: 'Cairo', template_code: 'CAI', duration_days: 2 }],
    tour_day_activities: [
      { id: 'act-1', template_id: 'tpl-a', day_number: 1, sequence_order: 1, content_id: 'content-a', activity_type: 'attraction', activity_name: 'Pyramids' },
      { id: 'act-2', template_id: 'tpl-a', day_number: 2, sequence_order: 1, content_id: null, activity_type: 'meal', activity_name: 'Lunch' },
      { id: 'act-3', template_id: 'tpl-a', day_number: 2, sequence_order: 2, content_id: 'deleted-item', activity_type: 'attraction', activity_name: 'Gone' },
    ],
    content_library: [
      { id: 'content-a', org_id: 'org-a', name: 'Giza (A)', location: 'Giza', duration: '3h', content_categories: { name: 'Sites', slug: 'sites' } },
    ],
  })
})

describe('the day builder without a content foreign key', () => {
  it('lists the day plan with each activity’s own content attached', async () => {
    const res = await GET(new NextRequest('http://localhost/x'), idParams('tpl-a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const [d1, d2] = body.data.days
    expect(d1.activities[0].content_library).toMatchObject({ id: 'content-a', name: 'Giza (A)', content_categories: { slug: 'sites' } })
    expect(d2.activities.map((a: { content_library: unknown }) => a.content_library)).toEqual([null, null])
  })

  it('adding and editing an activity answer with it (they saved and then 500d)', async () => {
    const add = await POST(json({ day_number: 1, activity_type: 'attraction', activity_name: 'Giza', content_id: 'content-a' }), idParams('tpl-a'))
    expect(add.status).toBe(201)
    expect((await add.json()).data.content_library).toMatchObject({ id: 'content-a' })
    const edit = await PATCH(json({ activity_id: 'act-2', notes: 'early' }), idParams('tpl-a'))
    expect(edit.status).toBe(200)
    expect((await edit.json()).data).toMatchObject({ id: 'act-2', notes: 'early', content_library: null })
  })

  it('no migration gives tour_day_activities.content_id a foreign key (so the embed stays impossible)', () => {
    const dir = join(process.cwd(), 'migrations')
    const all = readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => readFileSync(join(dir, f), 'utf8')).join('\n')
    expect(all).not.toMatch(/tour_day_activities[\s\S]{0,200}FOREIGN KEY \(content_id\)/)
  })
})
