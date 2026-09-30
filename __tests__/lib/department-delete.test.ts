import { describe, it, expect, vi } from 'vitest'

// department-admin builds a service-role client at import; the delete itself
// takes its client as an argument, so the module-level one is never used here.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

const { deleteDepartment } = await import('@/lib/department-admin')

type Row = Record<string, any>

// Just the query shapes deleteDepartment uses: select→eq→maybeSingle,
// update→eq(→select), delete→eq. Each chain applies on await.
function fakeDb(tables: Record<string, Row[]>) {
  return {
    tables,
    from(table: string) {
      let op: 'select' | 'update' | 'delete' = 'select'
      let patch: Row = {}
      const filters: Array<[string, unknown]> = []
      const matching = () => tables[table].filter(r => filters.every(([c, v]) => r[c] === v))
      const run = () => {
        const rows = matching()
        if (op === 'update') rows.forEach(r => Object.assign(r, patch))
        if (op === 'delete') tables[table] = tables[table].filter(r => !rows.includes(r))
        return { data: rows.map(r => ({ ...r })), error: null }
      }
      const q: any = {
        select: () => q,
        update: (p: Row) => ((op = 'update'), (patch = p), q),
        delete: () => ((op = 'delete'), q),
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      }
      return q
    },
  }
}

const seed = () =>
  fakeDb({
    departments: [
      { id: 'res', name: 'Reservation', service_types: ['accommodation', 'cruise'], is_active: true },
      { id: 'exe', name: 'Execution', service_types: ['guide'], is_active: true },
      { id: 'old', name: 'Old', service_types: ['meal'], is_active: false },
    ],
    team_members: [
      { id: 'm1', department_id: 'res' },
      { id: 'm2', department_id: 'res' },
      { id: 'm3', department_id: 'exe' },
    ],
    tasks: [
      { id: 't1', department_id: 'res' },
      { id: 't2', department_id: 'exe' },
    ],
  })

describe('deleteDepartment', () => {
  it('moves members, tasks and routed service types to the target, then deletes', async () => {
    const db = seed()
    const result = await deleteDepartment(db, 'res', 'exe')
    expect(result).toEqual({ ok: true, moved: { members: 2, tasks: 1 }, unrouted: [] })
    expect(db.tables.departments.map(d => d.id)).toEqual(['exe', 'old'])
    expect(db.tables.team_members.every(m => m.department_id === 'exe')).toBe(true)
    expect(db.tables.tasks.every(t => t.department_id === 'exe')).toBe(true)
    expect(db.tables.departments[0].service_types).toEqual(['guide', 'accommodation', 'cruise'])
  })

  it('with no target, clears the references and reports the types left unrouted', async () => {
    const db = seed()
    const result = await deleteDepartment(db, 'res', null)
    expect(result).toEqual({ ok: true, moved: { members: 2, tasks: 1 }, unrouted: ['accommodation', 'cruise'] })
    expect(db.tables.team_members.filter(m => m.department_id === null).map(m => m.id)).toEqual(['m1', 'm2'])
    expect(db.tables.tasks.find(t => t.id === 't1')!.department_id).toBeNull()
  })

  it('an inactive department hands over no service types — it routed nothing', async () => {
    const db = seed()
    const result = await deleteDepartment(db, 'old', 'exe')
    expect(result).toMatchObject({ ok: true, unrouted: [] })
    expect(db.tables.departments.find(d => d.id === 'exe')!.service_types).toEqual(['guide'])
  })

  it('refuses a target that is itself, missing or inactive — and changes nothing', async () => {
    for (const [target, status] of [['res', 400], ['nope', 404], ['old', 400]] as const) {
      const db = seed()
      const result = await deleteDepartment(db, 'res', target)
      expect(result).toMatchObject({ ok: false, status })
      expect(db.tables.departments).toHaveLength(3)
      expect(db.tables.team_members.filter(m => m.department_id === 'res')).toHaveLength(2)
    }
  })

  it('404s for a department that does not exist', async () => {
    expect(await deleteDepartment(seed(), 'nope', null)).toMatchObject({ ok: false, status: 404 })
  })
})
