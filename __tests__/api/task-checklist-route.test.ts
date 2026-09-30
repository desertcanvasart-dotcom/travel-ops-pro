import { describe, it, expect, vi, beforeEach } from 'vitest'

// PATCH /api/tasks/[id]/checklist — the write lands only if the task is
// unchanged since it was read (updated_at), so two people ticking different
// rows at once both keep their tick.

type Row = Record<string, any>
let task: Row | null
let interleave: (() => void) | null // runs once, between a read and its write
let writes = 0

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      let patch: Row | null = null
      const filters: Array<[string, unknown]> = []
      const q: any = {
        select: () => q,
        update: (p: Row) => ((patch = p), q),
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        is: (c: string, v: unknown) => (filters.push([c, v]), q),
        maybeSingle: async () => {
          const matches = task && filters.every(([c, v]) => task![c] === v)
          if (!patch) return { data: matches ? { ...task } : null, error: null }
          if (interleave) { const f = interleave; interleave = null; f() }
          const stillMatches = task && filters.every(([c, v]) => task![c] === v)
          if (!stillMatches) return { data: null, error: null }
          writes++
          Object.assign(task!, patch)
          return { data: { ...task }, error: null }
        },
      }
      return q
    },
  }),
}))

const { PATCH } = await import('@/app/api/tasks/[id]/checklist/route')

const row = (key: string, booked = false) => ({
  key, day_from: 1, day_to: 1, date_from: '2026-12-10', date_to: '2026-12-10', city: 'Cairo',
  name: key, quantity: 1, nights: null, supplier: null, notes: null, booked, confirmation: null, booked_at: null,
})

const call = (body: unknown) =>
  PATCH({ json: async () => body } as never, { params: Promise.resolve({ id: 't1' }) })

beforeEach(() => {
  task = { id: 't1', status: 'todo', updated_at: 'v1', completed_at: null, checklist: [row('A'), row('B')] }
  interleave = null
  writes = 0
})

describe('task checklist PATCH', () => {
  it('ticks a row and moves the status with it', async () => {
    const res = await call({ key: 'A', booked: true })
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(task!.checklist[0].booked).toBe(true)
    expect(task!.status).toBe('in_progress')

    await call({ key: 'B', booked: true })
    expect(task!.status).toBe('done')
    expect(task!.completed_at).not.toBeNull()
  })

  it('a concurrent write is not lost: it re-reads and re-applies', async () => {
    // Someone ticks B between our read and our write.
    interleave = () => {
      task = { ...task!, updated_at: 'v2', checklist: [row('A'), row('B', true)], status: 'in_progress' }
    }
    const res = await call({ key: 'A', booked: true })
    expect((await res.json()).success).toBe(true)
    expect(task!.checklist.map((r: Row) => r.booked)).toEqual([true, true])
    expect(task!.status).toBe('done')
    expect(writes).toBe(1)
  })

  it('rejects a malformed body, an unknown row, and a task without a checklist', async () => {
    expect((await call({ booked: true })).status).toBe(400)
    expect((await call({ key: 'Z', booked: true })).status).toBe(404)
    task!.checklist = null
    expect((await call({ key: 'A', booked: true })).status).toBe(400)
  })
})
