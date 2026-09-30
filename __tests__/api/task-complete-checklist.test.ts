import { describe, it, expect, vi, beforeEach } from 'vitest'

// The card's Complete button (PUT status 'done') on a generated task ticks
// every checklist row. It used to set only the status, leaving "Done, 0 of 2
// booked" — and the next tick or regenerate moved the task back to To Do.

type Row = Record<string, any>
let task: Row

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      let patch: Row | null = null
      const q: any = {
        select: () => q,
        update: (p: Row) => ((patch = p), q),
        eq: () => q,
        maybeSingle: async () => ({ data: { ...task }, error: null }),
        single: async () => {
          if (patch) Object.assign(task, patch)
          return { data: { ...task }, error: null }
        },
      }
      return q
    },
  }),
}))

const { PUT } = await import('@/app/api/tasks/[id]/route')

const row = (key: string, extra: Row = {}) => ({
  key, day_from: 1, day_to: 1, date_from: null, date_to: null, city: null, name: key,
  quantity: 1, nights: null, supplier: null, notes: null, booked: false, confirmation: null, booked_at: null, ...extra,
})
const put = (body: unknown) => PUT({ json: async () => body } as never, { params: Promise.resolve({ id: 't1' }) })

beforeEach(() => {
  task = { id: 't1', status: 'todo', checklist: [row('A'), row('B', { is_new: true })] }
})

describe('Complete on a checklist task', () => {
  it('ticks every row along with the status', async () => {
    const res = await put({ status: 'done' })
    expect(res.status).toBe(200)
    expect(task.status).toBe('done')
    expect(task.checklist.every((r: Row) => r.booked && r.booked_at)).toBe(true)
    expect(task.checklist[1].is_new).toBeUndefined()
  })

  it('is refused while a booking that left the itinerary still has to be cancelled', async () => {
    task.checklist.push(row('C', { booked: true, removed: true }))
    const res = await put({ status: 'done' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/must be cancelled first/)
    expect(task.status).toBe('todo')
  })

  it('a task without a checklist completes as before', async () => {
    task.checklist = null
    const res = await put({ status: 'done' })
    expect(res.status).toBe(200)
    expect(task.status).toBe('done')
    expect(task.checklist).toBeNull()
  })
})
