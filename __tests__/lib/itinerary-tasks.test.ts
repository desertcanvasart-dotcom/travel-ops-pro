import { describe, it, expect } from 'vitest'
import {
  planItineraryTasks,
  planSync,
  changeNote,
  taskCategoryOf,
  type ServiceForTasks,
  type ExistingGeneratedTask,
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
    expect(acc.snapshot.lines).toEqual([
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

describe('regenerating syncs instead of duplicating', () => {
  const existingFrom = (p = plan(), over: Partial<ExistingGeneratedTask> = {}): ExistingGeneratedTask[] =>
    p.tasks.map((t, i) => ({
      id: `task-${i}`, service_type: t.service_type, status: 'todo', archived: false,
      assigned_to: 'm1', generation_snapshot: t.snapshot, ...over,
    }))

  it('creates everything the first time', () => {
    expect(planSync(plan(), []).actions.every(a => a.kind === 'create')).toBe(true)
  })

  it('an unchanged itinerary changes nothing', () => {
    const sync = planSync(plan(), existingFrom())
    expect(sync.actions.every(a => a.kind === 'unchanged')).toBe(true)
    expect(sync.orphaned).toEqual([])
  })

  it('an open task whose services changed is updated in place', () => {
    const before = existingFrom()
    const after = plan(departments, [...services, svc(6, 'meal', 'Dinner cruise')])
    const meal = planSync(after, before).actions.find(a => a.task.service_type === 'meal')!
    expect(meal.kind).toBe('update')
  })

  it('a finished task whose services changed is reopened with exactly what changed', () => {
    const before = existingFrom(plan(), { status: 'done' })
    const changed = services
      .filter(s => !(s.service_type === 'meal'))
      .concat(svc(6, 'meal', 'Dinner cruise'))
    const sync = planSync(plan(departments, changed), before)
    const meal = sync.actions.find(a => a.task.service_type === 'meal')!
    expect(meal.kind).toBe('reopen')
    if (meal.kind !== 'reopen') return
    expect(meal.added).toEqual(['Day 6 · 2026-12-15 · Cairo — Dinner cruise'])
    expect(meal.removed).toEqual(['Day 2 · 2026-12-11 · Cairo — Lunch at Khufu’s'])
    const note = changeNote(meal, '2026-10-01')
    expect(note).toContain('Changed after completion (2026-10-01)')
    expect(note).toContain('+ Added: Day 6')
    expect(note).toContain('− Removed: Day 2')
    // Finished tasks that did not change stay finished.
    expect(sync.actions.filter(a => a.kind === 'reopen')).toHaveLength(1)
  })

  it('reports tasks whose category is gone or now excluded, without touching them', () => {
    const before = existingFrom()
    const sync = planSync(
      plan(departments.filter(d => d.id !== 'exe'), services.filter(s => s.service_type !== 'meal')),
      before
    )
    expect(sync.orphaned.map(o => [o.service_type, o.reason])).toEqual([
      ['guide', 'excluded'],
      ['meal', 'removed'],
      ['entrance', 'excluded'],
    ])
  })
})
