// ============================================
// ITINERARY TASKS — one operations task per kind of service
// ============================================
// Each itinerary gets at most ONE generated task per category: all its hotels
// (plus Nile cruises and sleeper trains — every night's bed) in one
// Accommodation task, every transfer in one Transportation task, every meal in
// one Meals task, and so on. Each task lists its services line by line.
//
// WHY NOT THE AI ANY MORE
//
// These tasks used to be written by a model from the raw service list. That
// made them slow, paid for, different on every run, and blind to the
// departments screen: a department switched off still had its services turned
// into tasks, just with nobody assigned. Grouping services by category is a
// fixed rule, so plain code does it the same way every time.
//
// REGENERATING SYNCS, IT DOES NOT DUPLICATE
//
// A generated task carries its category (tasks.service_type) and a snapshot of
// what it listed (tasks.generation_snapshot). Generating again compares the
// itinerary against those snapshots:
//   - no task yet for a category            → create it
//   - open task, services unchanged         → leave it alone
//   - open task, services changed           → update its list in place
//   - finished task, services unchanged     → leave it alone
//   - finished task, services changed       → reopen it with a note saying
//                                             exactly what was added/removed
// Tasks created by hand (no service_type) are never touched.

import { resolveDepartment, type DepartmentRow } from '@/lib/departments'
import { normalizeServiceType } from '@/lib/service-types'
import { shiftDateISO } from '@/lib/today'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface ItineraryForTasks {
  itinerary_code: string
  client_name: string
  trip_name?: string | null
  start_date: string | null
  end_date: string | null
  num_adults: number | null
  num_children: number | null
  num_infants?: number | null
}

export interface ServiceForTasks {
  day_number: number
  date: string | null
  city: string | null
  overnight_city?: string | null
  service_type: string
  service_code?: string | null
  service_name: string
  quantity: number | null
  supplier_name: string | null
  notes: string | null
}

interface CategoryRule {
  label: string
  /** Days before the trip starts that the work should be done by. */
  leadDays: number
  priority: TaskPriority
}

/** The categories the app generates today, in the order tasks are listed. */
export const TASK_CATEGORIES: Readonly<Record<string, CategoryRule>> = {
  accommodation: { label: 'Accommodation', leadDays: 14, priority: 'high' },
  flight: { label: 'Flights', leadDays: 14, priority: 'high' },
  transportation: { label: 'Transportation', leadDays: 7, priority: 'medium' },
  guide: { label: 'Guides', leadDays: 7, priority: 'medium' },
  activity: { label: 'Activities', leadDays: 7, priority: 'medium' },
  airport_service: { label: 'Airport services', leadDays: 5, priority: 'medium' },
  hotel_service: { label: 'Hotel services', leadDays: 5, priority: 'medium' },
  meal: { label: 'Meals', leadDays: 5, priority: 'medium' },
  entrance: { label: 'Entrance tickets', leadDays: 3, priority: 'low' },
}

/** Anything else an operator has added (a custom type) still gets a task. */
const DEFAULT_RULE = { leadDays: 7, priority: 'medium' as TaskPriority }

/** Nothing to book: handed out on the day. */
const NO_TASK_TYPES = new Set(['tips', 'supplies'])

/**
 * A sleeper train is priced as a transportation service, but the ticket IS
 * the night's bed (lib/auto-pricing-service.ts puts it in the rooming nights),
 * so it is booked alongside the hotels.
 */
export function isSleeperTrain(service: Pick<ServiceForTasks, 'service_name' | 'service_code'>): boolean {
  const text = `${service.service_name ?? ''} ${service.service_code ?? ''}`.toLowerCase()
  return /sleep(ing|er)[\s_-]*train|\bsleeper\b/.test(text)
}

/** The task category a service belongs to, or null for no task at all. */
export function taskCategoryOf(service: ServiceForTasks): string | null {
  const type = normalizeServiceType(service.service_type)
  if (!type || NO_TASK_TYPES.has(type)) return null
  if (type === 'accommodation' || type === 'cruise') return 'accommodation'
  if (type === 'transportation' && isSleeperTrain(service)) return 'accommodation'
  return type
}

export function categoryLabel(category: string): string {
  return TASK_CATEGORIES[category]?.label
    ?? category.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

function categoryRule(category: string) {
  return TASK_CATEGORIES[category] ?? DEFAULT_RULE
}

/** What a generated task listed when it was last written — compared on regenerate. */
export interface GenerationSnapshot {
  header: string
  lines: string[]
}

export interface PlannedTask {
  service_type: string
  label: string
  title: string
  description: string
  snapshot: GenerationSnapshot
  due_date: string | null
  priority: TaskPriority
  department: { id: string; name: string }
  service_count: number
}

export interface SkippedCategory {
  service_type: string
  label: string
  service_count: number
  reason: 'no_active_department'
}

export interface TaskPlan {
  tasks: PlannedTask[]
  skipped: SkippedCategory[]
}

function paxText(it: ItineraryForTasks): string {
  const n = (v: number | null | undefined) => v ?? 0
  return [
    `${n(it.num_adults)} adult${n(it.num_adults) === 1 ? '' : 's'}`,
    n(it.num_children) > 0 ? `${n(it.num_children)} child${n(it.num_children) === 1 ? '' : 'ren'}` : '',
    n(it.num_infants) > 0 ? `${n(it.num_infants)} infant${n(it.num_infants) === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(', ')
}

function headerOf(it: ItineraryForTasks): string {
  const first = [it.itinerary_code, it.client_name, it.trip_name].filter(Boolean).join(' · ')
  const dates = it.start_date ? `${it.start_date} → ${it.end_date ?? '?'}` : 'Dates not set'
  return `${first}\n${dates} · ${paxText(it)}`
}

/**
 * One line per service, in day order. Identical services on consecutive days
 * (the same hotel four nights running) collapse into one line with a day range.
 */
export function serviceLines(category: string, services: ServiceForTasks[]): string[] {
  const sorted = services
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.day_number - b.s.day_number || a.i - b.i)
    .map(x => x.s)

  const sameItem = (a: ServiceForTasks, b: ServiceForTasks) =>
    a.service_name === b.service_name &&
    (a.supplier_name ?? '') === (b.supplier_name ?? '') &&
    (a.quantity ?? 1) === (b.quantity ?? 1) &&
    (a.notes ?? '') === (b.notes ?? '')

  const runs: { first: ServiceForTasks; last: ServiceForTasks; days: number }[] = []
  for (const s of sorted) {
    const run = runs[runs.length - 1]
    if (run && sameItem(run.last, s) && s.day_number === run.last.day_number + 1) {
      run.last = s
      run.days++
    } else {
      runs.push({ first: s, last: s, days: 1 })
    }
  }

  const isBed = category === 'accommodation'
  return runs.map(({ first, last, days }) => {
    const dayText = days > 1 ? `Days ${first.day_number}–${last.day_number}` : `Day ${first.day_number}`
    const dateText = days > 1 && first.date && last.date ? `${first.date} → ${last.date}` : first.date
    // Where the guests SLEEP is what a hotel booking needs; otherwise the city
    // the service happens in.
    const place = isBed ? first.overnight_city || first.city : first.city
    let item = first.service_name
    if ((first.quantity ?? 1) !== 1) item += ` ×${first.quantity}`
    if (isBed) item += ` (${days} night${days === 1 ? '' : 's'})`
    let line = `${[dayText, dateText, place].filter(Boolean).join(' · ')} — ${item}`
    if (first.supplier_name) line += ` · Supplier: ${first.supplier_name}`
    if (first.notes) line += ` · Notes: ${first.notes.replace(/\s+/g, ' ').trim()}`
    return line
  })
}

export function taskDescription(snapshot: GenerationSnapshot): string {
  return `${snapshot.header}\n\n${snapshot.lines.join('\n')}`
}

/**
 * Plan the tasks for an itinerary. `departments` must be the ACTIVE ones: a
 * category no active department handles is skipped entirely — switching a
 * department off means its work is not generated.
 */
export function planItineraryTasks(input: {
  itinerary: ItineraryForTasks
  services: ServiceForTasks[]
  departments: DepartmentRow[]
  today: string
}): TaskPlan {
  const { itinerary, services, departments, today } = input

  const byCategory = new Map<string, ServiceForTasks[]>()
  for (const s of services) {
    const category = taskCategoryOf(s)
    if (!category) continue
    ;(byCategory.get(category) ?? byCategory.set(category, []).get(category)!).push(s)
  }

  const order = Object.keys(TASK_CATEGORIES)
  const categories = [...byCategory.keys()].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b)
  })

  const header = headerOf(itinerary)
  const tasks: PlannedTask[] = []
  const skipped: SkippedCategory[] = []

  for (const category of categories) {
    const list = byCategory.get(category)!
    const label = categoryLabel(category)
    // The combined Accommodation task goes where 'accommodation' is routed,
    // even when cruises are routed elsewhere — one task, one owner.
    const dept = resolveDepartment(category, departments)
    if (!dept) {
      skipped.push({ service_type: category, label, service_count: list.length, reason: 'no_active_department' })
      continue
    }

    const rule = categoryRule(category)
    const snapshot: GenerationSnapshot = { header, lines: serviceLines(category, list) }
    let due: string | null = null
    if (itinerary.start_date) {
      due = shiftDateISO(itinerary.start_date, -rule.leadDays)
      // A trip booked late: the work is due now, not on a date already past.
      if (due < today) due = today
    }

    const count = list.length
    tasks.push({
      service_type: category,
      label,
      title: `${label} — ${[itinerary.itinerary_code, itinerary.client_name].filter(Boolean).join(' · ')}${itinerary.start_date ? ` · ${itinerary.start_date}` : ''} (${count} service${count === 1 ? '' : 's'})`.slice(0, 500),
      description: taskDescription(snapshot),
      snapshot,
      due_date: due,
      priority: rule.priority,
      department: { id: dept.id, name: dept.name },
      service_count: count,
    })
  }

  return { tasks, skipped }
}

// ============================================
// SYNC — what regenerating does to the tasks already there
// ============================================

export interface ExistingGeneratedTask {
  id: string
  service_type: string
  status: string | null
  archived: boolean | null
  assigned_to: string | null
  generation_snapshot: GenerationSnapshot | null
}

export type TaskAction =
  | { kind: 'create'; task: PlannedTask }
  | { kind: 'update'; id: string; task: PlannedTask }
  | { kind: 'reopen'; id: string; task: PlannedTask; added: string[]; removed: string[]; tripChanged: boolean }
  | { kind: 'unchanged'; id: string; task: PlannedTask }

export interface OrphanedTask {
  id: string
  service_type: string
  label: string
  /** 'excluded': its category has no active department now.
   *  'removed': the itinerary no longer has any of its services. */
  reason: 'excluded' | 'removed'
}

export interface SyncPlan {
  actions: TaskAction[]
  orphaned: OrphanedTask[]
}

function isFinished(t: ExistingGeneratedTask): boolean {
  return t.status === 'done' || t.archived === true
}

function sameSnapshot(a: GenerationSnapshot | null, b: GenerationSnapshot): boolean {
  return !!a && a.header === b.header &&
    a.lines.length === b.lines.length && a.lines.every((l, i) => l === b.lines[i])
}

export function planSync(plan: TaskPlan, existing: ExistingGeneratedTask[]): SyncPlan {
  // Should there ever be two (a double-click), the first is the one kept in sync.
  const byType = new Map<string, ExistingGeneratedTask>()
  for (const t of existing) if (!byType.has(t.service_type)) byType.set(t.service_type, t)

  const actions: TaskAction[] = plan.tasks.map(task => {
    const current = byType.get(task.service_type)
    if (!current) return { kind: 'create', task }
    if (sameSnapshot(current.generation_snapshot, task.snapshot)) return { kind: 'unchanged', id: current.id, task }
    if (!isFinished(current)) return { kind: 'update', id: current.id, task }
    const before = new Set(current.generation_snapshot?.lines ?? [])
    const after = new Set(task.snapshot.lines)
    return {
      kind: 'reopen',
      id: current.id,
      task,
      added: task.snapshot.lines.filter(l => !before.has(l)),
      removed: (current.generation_snapshot?.lines ?? []).filter(l => !after.has(l)),
      tripChanged: (current.generation_snapshot?.header ?? '') !== task.snapshot.header,
    }
  })

  const planned = new Set(plan.tasks.map(t => t.service_type))
  const excluded = new Set(plan.skipped.map(s => s.service_type))
  const orphaned: OrphanedTask[] = []
  for (const [type, t] of byType) {
    if (planned.has(type)) continue
    orphaned.push({ id: t.id, service_type: type, label: categoryLabel(type), reason: excluded.has(type) ? 'excluded' : 'removed' })
  }

  return { actions, orphaned }
}

/** The note a reopened task leads with, so its owner sees only what is new. */
export function changeNote(action: Extract<TaskAction, { kind: 'reopen' }>, today: string): string {
  const lines = [`⚠ Changed after completion (${today}):`]
  for (const l of action.added) lines.push(`+ Added: ${l}`)
  for (const l of action.removed) lines.push(`− Removed: ${l}`)
  if (action.tripChanged) lines.push('• Trip details changed (dates or travellers) — check the header below.')
  return lines.join('\n')
}
