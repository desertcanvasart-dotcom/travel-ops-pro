import { describe, it, expect } from 'vitest'
import {
  planItineraryTasks,
  planSync,
  mergeChecklist,
  applyChecklistChange,
  statusFromChecklist,
  checklistProgress,
  taskCategoryOf,
  type ServiceForTasks,
  type ExistingGeneratedTask,
  type ChecklistItem,
} from '@/lib/tasks/itinerary-tasks'

const itinerary = {
  itinerary_code: 'ITN-1', client_name: 'Smith', trip_name: 'Classic Egypt',
  start_date: '2026-12-10', end_date: '2026-12-16', num_adults: 2, num_children: 1, num_infants: 0,
}

const departments = [
  { id: 'res', name: 'Reservation', service_types: ['accommodation', 'cruise', 'meal', 'transportation'] },
  { id: 'avi', name: 'Aviation', service_types: ['flight'] },
  { id: 'exe', name: 'Execution', service_types: ['guide', 'entrance', 'airport_service'] },
]

const svc = (day: number, service_type: string, service_name: string, extra: Partial<ServiceForTasks> = {}): ServiceForTasks => ({
  day_number: day, date: `2026-12-${String(9 + day).padStart(2, '0')}`, city: 'Cairo', overnight_city: null,
  service_type, service_name, quantity: 1, supplier_name: null, notes: null, ...extra,
})

const services: ServiceForTasks[] = [
  svc(1, 'accommodation', 'Mena House', { supplier_name: 'Marriott' }),
  svc(2, 'accommodation', 'Mena House', { supplier_name: 'Marriott' }),
  svc(3, 'transportation', 'Sleeping Train Giza–Aswan (Half Twin)'),
  svc(4, 'cruise', 'MS Nile Goddess', { city: 'Aswan' }),
  svc(5, 'cruise', 'MS Nile Goddess', { city: 'Kom Ombo' }),
  svc(1, 'transportation', 'Airport transfer'),
  svc(2, 'transportation', 'Pyramids tour vehicle'),
  svc(2, 'guide', 'Egyptologist'),
  svc(2, 'entrance', 'Giza Plateau'),
  svc(2, 'meal', 'Lunch at Khufu’s'),
  svc(2, 'tips', 'Tipping kitty'),
  svc(1, 'flight', 'MS956'),
]

const plan = (deps = departments, list = services, today = '2026-10-01') =>
  planItineraryTasks({ itinerary, services: list, departments: deps, today })

describe('grouping into one task per category', () => {
  it('hotels, Nile cruises and sleeper trains are all Accommodation', () => {
    expect(taskCategoryOf(svc(1, 'cruise', 'x'))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, 'transportation', 'Sleeping Train Cairo–Luxor'))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, 'transportation', 'x', { service_code: 'day3-ticket-sleeper' }))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, 'transportation', 'Airport transfer'))).toBe('transportation')
    expect(taskCategoryOf(svc(1, 'tips', 'x'))).toBeNull()
  })

  it('makes one task per category, in a fixed order, and none for tips', () => {
    const p = plan()
    expect(p.tasks.map(t => t.service_type)).toEqual(
      ['accommodation', 'flight', 'transportation', 'guide', 'meal', 'entrance']
    )
    const acc = p.tasks[0]
    expect(acc.service_count).toBe(5)
    expect(acc.department).toEqual({ id: 'res', name: 'Reservation' })
    // Two Mena House nights collapse into one line; the sleeper is a night too.
    expect(acc.items.map(i => i.key)).toEqual([
      'Days 1–2 · 2026-12-10 → 2026-12-11 · Cairo — Mena House (2 nights) · Supplier: Marriott',
      'Day 3 · 2026-12-12 · Cairo — Sleeping Train Giza–Aswan (Half Twin) (1 night)',
      'Days 4–5 · 2026-12-13 → 2026-12-14 · Aswan — MS Nile Goddess (2 nights)',
    ])
    // The sleeper is not ALSO in Transportation.
    expect(p.tasks.find(t => t.service_type === 'transportation')!.service_count).toBe(2)
    expect(acc.description).toContain('ITN-1 · Smith · Classic Egypt')
    expect(acc.description).toContain('2 adults, 1 child')
  })

  it('due dates follow the lead times, but never fall before today', () => {
    const p = plan()
    const due = Object.fromEntries(p.tasks.map(t => [t.service_type, t.due_date]))
    expect(due).toMatchObject({ accommodation: '2026-11-26', transportation: '2026-12-03', meal: '2026-12-05', entrance: '2026-12-07' })
    const late = plan(departments, services, '2026-12-01')
    expect(late.tasks.find(t => t.service_type === 'accommodation')!.due_date).toBe('2026-12-01')
  })

  it('skips every category no ACTIVE department handles', () => {
    const withoutExecution = departments.filter(d => d.id !== 'exe')
    const p = plan(withoutExecution)
    expect(p.tasks.map(t => t.service_type)).not.toContain('guide')
    expect(p.tasks.map(t => t.service_type)).not.toContain('entrance')
    expect(p.skipped.map(s => s.service_type)).toEqual(['guide', 'entrance'])
  })
})

describe('checklist rows', () => {
  it('each row carries the fields the table shows', () => {
    const acc = plan().tasks[0]
    expect(acc.items[0]).toMatchObject({
      day_from: 1, day_to: 2, date_from: '2026-12-10', date_to: '2026-12-11',
      city: 'Cairo', name: 'Mena House', quantity: 1, nights: 2, supplier: 'Marriott', notes: null,
    })
    // Only accommodation rows count nights.
    expect(plan().tasks.find(t => t.service_type === 'transportation')!.items[0].nights).toBeNull()
    // The title stays short — the rows carry the detail.
    expect(acc.title).toBe('Accommodation — ITN-1 · Smith')
  })
})

// A task as the route would store it after creating it.
const stored = (p = plan()): ExistingGeneratedTask[] =>
  planSync(p, []).actions.map((a, i) => {
    if (a.kind !== 'create') throw new Error('expected create')
    return {
      id: `task-${i}`, service_type: a.task.service_type, status: 'todo', archived: false,
      assigned_to: 'm1', generation_snapshot: a.task.snapshot, checklist: a.checklist,
    }
  })

const tick = (tasks: ExistingGeneratedTask[], type: string, which: 'all' | number) =>
  tasks.map(t => {
    if (t.service_type !== type) return t
    let rows = t.checklist!
    rows.forEach((r, i) => {
      if (which === 'all' || which === i) rows = applyChecklistChange(rows, { key: r.key, booked: true }, '2026-10-01T00:00:00Z')!
    })
    return { ...t, checklist: rows, status: statusFromChecklist(rows, t.status) }
  })

describe('regenerating syncs instead of duplicating', () => {
  it('creates every task unticked the first time, none marked new', () => {
    const actions = planSync(plan(), []).actions
    expect(actions.every(a => a.kind === 'create')).toBe(true)
    for (const a of actions) {
      if (a.kind !== 'create') continue
      expect(a.checklist.every(r => !r.booked && !r.is_new)).toBe(true)
    }
  })

  it('an unchanged itinerary changes nothing', () => {
    const sync = planSync(plan(), stored())
    expect(sync.actions.every(a => a.kind === 'unchanged')).toBe(true)
    expect(sync.orphaned).toEqual([])
  })

  it('unchanged rows keep their tick and confirmation; a new row arrives unticked and flagged new', () => {
    let tasks = tick(stored(), 'meal', 'all')
    tasks = tasks.map(t => t.service_type !== 'meal' ? t : {
      ...t, checklist: applyChecklistChange(t.checklist!, { key: t.checklist![0].key, confirmation: 'KH-123' }, 'x')!,
    })
    expect(tasks.find(t => t.service_type === 'meal')!.status).toBe('done')

    const changed = plan(departments, [...services, svc(6, 'meal', 'Dinner cruise')])
    const meal = planSync(changed, tasks).actions.find(a => a.task.service_type === 'meal')!
    // A finished task that gained a row is reopened.
    expect(meal.kind).toBe('reopen')
    if (meal.kind !== 'reopen') return
    expect(meal.status).toBe('in_progress')
    expect(meal.checklist.map(r => [r.name, r.booked, r.confirmation, !!r.is_new])).toEqual([
      ['Lunch at Khufu’s', true, 'KH-123', false],
      ['Dinner cruise', false, null, true],
    ])
  })

  it('a booked row that leaves the itinerary stays, flagged for cancellation, until marked cancelled', () => {
    const tasks = tick(stored(), 'accommodation', 'all')
    const withoutSleeper = services.filter(s => !s.service_name.startsWith('Sleeping Train'))
    const acc = planSync(plan(departments, withoutSleeper), tasks).actions.find(a => a.task.service_type === 'accommodation')!
    expect(acc.kind).toBe('reopen')
    if (acc.kind !== 'reopen') return
    const removed = acc.checklist.filter(r => r.removed)
    expect(removed.map(r => r.name)).toEqual(['Sleeping Train Giza–Aswan (Half Twin)'])
    expect(checklistProgress(acc.checklist)).toMatchObject({ total: 2, booked: 2, toCancel: 1, complete: false })

    const after = applyChecklistChange(acc.checklist, { key: removed[0].key, cancelled: true }, 'x')!
    expect(checklistProgress(after).complete).toBe(true)
    expect(statusFromChecklist(after, acc.status)).toBe('done')
  })

  it('an UNbooked row that leaves the itinerary simply disappears', () => {
    const withoutSleeper = services.filter(s => !s.service_name.startsWith('Sleeping Train'))
    const acc = planSync(plan(departments, withoutSleeper), stored()).actions.find(a => a.task.service_type === 'accommodation')!
    if (acc.kind === 'unchanged' || acc.kind === 'create') throw new Error('expected update')
    expect(acc.kind).toBe('update')
    expect(acc.checklist.some(r => r.removed)).toBe(false)
    expect(acc.checklist).toHaveLength(2)
  })

  it('a done task stays done when its rows did not change but the header did', () => {
    const tasks = tick(stored(), 'guide', 'all')
    const renamed = planItineraryTasks({
      itinerary: { ...itinerary, num_adults: 3 }, services, departments, today: '2026-10-01',
    })
    const guide = planSync(renamed, tasks).actions.find(a => a.task.service_type === 'guide')!
    expect(guide.kind).toBe('update')
    if (guide.kind !== 'update') return
    expect(guide.status).toBe('done')
    expect(guide.tripChanged).toBe(true)
  })

  it('converts a task generated before checklists: a done one counts its old rows as booked', () => {
    const p = plan()
    const legacy: ExistingGeneratedTask[] = p.tasks.map((t, i) => ({
      id: `old-${i}`, service_type: t.service_type, status: t.service_type === 'meal' ? 'done' : 'todo',
      archived: false, assigned_to: null, generation_snapshot: t.snapshot, checklist: null,
    }))
    const actions = planSync(p, legacy).actions
    // Unchanged snapshots are still rewritten once, to gain their checklist.
    expect(actions.every(a => a.kind === 'update')).toBe(true)
    const meal = actions.find(a => a.task.service_type === 'meal')!
    const guide = actions.find(a => a.task.service_type === 'guide')!
    if (meal.kind !== 'update' || guide.kind !== 'update') throw new Error('expected update')
    expect(meal.checklist.every(r => r.booked && !r.is_new)).toBe(true)
    expect(meal.status).toBe('done')
    expect(guide.checklist.every(r => !r.booked && !r.is_new)).toBe(true)
  })

  it('reports tasks whose category is gone or now excluded, without touching them', () => {
    const sync = planSync(
      plan(departments.filter(d => d.id !== 'exe'), services.filter(s => s.service_type !== 'meal')),
      stored()
    )
    expect(sync.orphaned.map(o => [o.service_type, o.reason])).toEqual([
      ['guide', 'excluded'],
      ['meal', 'removed'],
      ['entrance', 'excluded'],
    ])
  })
})

describe('ticking rows', () => {
  const rows = (): ChecklistItem[] => mergeChecklist({ previous: [], planned: plan().tasks[0].items, isRegenerate: false })

  it('status follows the rows', () => {
    let r = rows()
    expect(statusFromChecklist(r, 'todo')).toBe('todo')
    r = applyChecklistChange(r, { key: r[0].key, booked: true }, 't1')!
    expect(r[0]).toMatchObject({ booked: true, booked_at: 't1' })
    expect(statusFromChecklist(r, 'todo')).toBe('in_progress')
    for (const row of r) r = applyChecklistChange(r, { key: row.key, booked: true }, 't2')!
    expect(statusFromChecklist(r, 'in_progress')).toBe('done')
    r = applyChecklistChange(r, { key: r[1].key, booked: false }, 't3')!
    expect(r[1]).toMatchObject({ booked: false, booked_at: null })
    expect(statusFromChecklist(r, 'done')).toBe('in_progress')
  })

  it('confirmation numbers are trimmed and blank clears them', () => {
    let r = rows()
    r = applyChecklistChange(r, { key: r[0].key, confirmation: '  ABC-1  ' }, 'x')!
    expect(r[0].confirmation).toBe('ABC-1')
    r = applyChecklistChange(r, { key: r[0].key, confirmation: '   ' }, 'x')!
    expect(r[0].confirmation).toBeNull()
  })

  it('refuses a row that does not exist, and "cancelled" on a row that was not removed', () => {
    const r = rows()
    expect(applyChecklistChange(r, { key: 'nope', booked: true }, 'x')).toBeNull()
    expect(applyChecklistChange(r, { key: r[0].key, cancelled: true }, 'x')).toBeNull()
  })

  it('ticking a new row clears its "new" flag', () => {
    const r = mergeChecklist({ previous: [], planned: plan().tasks[0].items, isRegenerate: true })
    expect(r[0].is_new).toBe(true)
    const after = applyChecklistChange(r, { key: r[0].key, booked: true }, 'x')!
    expect(after[0].is_new).toBeUndefined()
  })
})
