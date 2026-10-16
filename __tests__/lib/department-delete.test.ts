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

// Organisation A's departments, members and tasks (each carries org_id since
// migration 20261203), and organisation B's own department.
const seed = () =>
  fakeDb({
    departments: [
      { id: 'res', org_id: 'org-a', name: 'Reservation', service_types: ['accommodation', 'cruise'], is_active: true },
      { id: 'exe', org_id: 'org-a', name: 'Execution', service_types: ['guide'], is_active: true },
      { id: 'old', org_id: 'org-a', name: 'Old', service_types: ['meal'], is_active: false },
      { id: 'b-exe', org_id: 'org-b', name: 'Execution', service_types: ['guide'], is_active: true },
    ],
    team_members: [
      { id: 'm1', org_id: 'org-a', department_id: 'res' },
      { id: 'm2', org_id: 'org-a', department_id: 'res' },
      { id: 'm3', org_id: 'org-a', department_id: 'exe' },
    ],
    tasks: [
      { id: 't1', org_id: 'org-a', department_id: 'res' },
      { id: 't2', org_id: 'org-a', department_id: 'exe' },
    ],
  })

describe('deleteDepartment', () => {
  it('moves members, tasks and routed service types to the target, then deletes', async () => {
    const db = seed()
    const result = await deleteDepartment(db, 'res', 'exe', 'org-a')
    expect(result).toEqual({ ok: true, moved: { members: 2, tasks: 1 }, unrouted: [] })
    expect(db.tables.departments.map(d => d.id)).toEqual(['exe', 'old', 'b-exe'])
    expect(db.tables.team_members.every(m => m.department_id === 'exe')).toBe(true)
    expect(db.tables.tasks.every(t => t.department_id === 'exe')).toBe(true)
    expect(db.tables.departments[0].service_types).toEqual(['guide', 'accommodation', 'cruise'])
  })

  it('with no target, clears the references and reports the types left unrouted', async () => {
    const db = seed()
    const result = await deleteDepartment(db, 'res', null, 'org-a')
    expect(result).toEqual({ ok: true, moved: { members: 2, tasks: 1 }, unrouted: ['accommodation', 'cruise'] })
    expect(db.tables.team_members.filter(m => m.department_id === null).map(m => m.id)).toEqual(['m1', 'm2'])
    expect(db.tables.tasks.find(t => t.id === 't1')!.department_id).toBeNull()
  })

  it('an inactive department hands over no service types — it routed nothing', async () => {
    const db = seed()
    const result = await deleteDepartment(db, 'old', 'exe', 'org-a')
    expect(result).toMatchObject({ ok: true, unrouted: [] })
    expect(db.tables.departments.find(d => d.id === 'exe')!.service_types).toEqual(['guide'])
  })

  it('refuses a target that is itself, missing or inactive — and changes nothing', async () => {
    for (const [target, status] of [['res', 400], ['nope', 404], ['old', 400]] as const) {
      const db = seed()
      const result = await deleteDepartment(db, 'res', target, 'org-a')
      expect(result).toMatchObject({ ok: false, status })
      expect(db.tables.departments).toHaveLength(4)
      expect(db.tables.team_members.filter(m => m.department_id === 'res')).toHaveLength(2)
    }
  })

  it('404s for a department that does not exist', async () => {
    expect(await deleteDepartment(seed(), 'nope', null, 'org-a')).toMatchObject({ ok: false, status: 404 })
  })

  it("another company's department can be neither deleted nor the target", async () => {
    const db = seed()
    expect(await deleteDepartment(db, 'b-exe', null, 'org-a')).toMatchObject({ ok: false, status: 404 })
    expect(await deleteDepartment(db, 'res', 'b-exe', 'org-a')).toMatchObject({ ok: false, status: 404 })
    expect(db.tables.departments).toHaveLength(4)
    expect(db.tables.team_members.filter(m => m.department_id === 'res')).toHaveLength(2)
  })
})
