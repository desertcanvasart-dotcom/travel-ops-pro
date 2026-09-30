// ============================================
// ITINERARY TASKS — one operations task per kind of service
// ============================================
// Each itinerary gets at most ONE generated task per category: all its hotels
// (plus Nile cruises and sleeper trains — every night's bed) in one
// Accommodation task, every transfer in one Transportation task, every meal in
// one Meals task, and so on.
//
// Each task carries a CHECKLIST (tasks.checklist): one row per service, which
// staff tick as booked and give a confirmation number. The task is done when
// every row is ticked and nothing is waiting to be cancelled.
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
// A row's identity is its KEY — the service line as text (day, date, city,
// service, quantity, supplier, notes). Generating again compares keys:
//   - a row whose key is unchanged keeps its tick and confirmation number;
//   - a new or changed row arrives unticked and flagged "new";
//   - a row that left the itinerary is dropped — unless it was already
//     booked, in which case it stays, flagged "removed", until someone marks
//     the booking cancelled. A booking is never silently forgotten.
// The task's status follows its rows, so a finished task that gains a new row
// is reopened, and one whose rows are all still booked stays done.
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

// ============================================
// CHECKLIST ROWS
// ============================================

/** One service (or a run of identical consecutive days) as generated. */
export interface PlannedItem {
  /** Identity across regenerations: the service line as text. */
  key: string
  day_from: number
  day_to: number
  date_from: string | null
  date_to: string | null
  city: string | null
  name: string
  quantity: number
  /** Accommodation rows only: how many nights the row covers. */
  nights: number | null
  supplier: string | null
  notes: string | null
}

/** A row as stored on the task: the generated fields plus its booking state. */
export interface ChecklistItem extends PlannedItem {
  booked: boolean
  confirmation: string | null
  booked_at: string | null
  /** Appeared when the itinerary changed after the task was first made. */
  is_new?: boolean
  /** Left the itinerary after it was booked — the booking must be cancelled. */
  removed?: boolean
}

/** What a generated task listed when last written — compared on regenerate. */
export interface GenerationSnapshot {
  header: string
  /** The rows' keys, in order. */
  lines: string[]
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
 * One row per service, in day order. Identical services on consecutive days
 * (the same hotel four nights running) collapse into one row with a day range.
 */
export function serviceItems(category: string, services: ServiceForTasks[]): PlannedItem[] {
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
    // Where the guests SLEEP is what a hotel booking needs; otherwise the city
    // the service happens in.
    const city = (isBed ? first.overnight_city || first.city : first.city) || null
    const quantity = first.quantity ?? 1
    const notes = first.notes ? first.notes.replace(/\s+/g, ' ').trim() : null

    // The key is the row as text — also what the task's plain-text
    // description lists, so it reads naturally anywhere it is shown.
    const dayText = days > 1 ? `Days ${first.day_number}–${last.day_number}` : `Day ${first.day_number}`
    const dateText = days > 1 && first.date && last.date ? `${first.date} → ${last.date}` : first.date
    let item = first.service_name
    if (quantity !== 1) item += ` ×${quantity}`
    if (isBed) item += ` (${days} night${days === 1 ? '' : 's'})`
    let key = `${[dayText, dateText, city].filter(Boolean).join(' · ')} — ${item}`
    if (first.supplier_name) key += ` · Supplier: ${first.supplier_name}`
    if (notes) key += ` · Notes: ${notes}`

    return {
      key,
      day_from: first.day_number,
      day_to: last.day_number,
      date_from: first.date,
      date_to: last.date,
      city,
      name: first.service_name,
      quantity,
      nights: isBed ? days : null,
      supplier: first.supplier_name || null,
      notes,
    }
  })
}

export function taskDescription(snapshot: GenerationSnapshot): string {
  return `${snapshot.header}\n\n${snapshot.lines.join('\n')}`
}

// ============================================
// PLAN — which tasks the itinerary needs
// ============================================

export interface PlannedTask {
  service_type: string
  label: string
  title: string
  description: string
  items: PlannedItem[]
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
    const items = serviceItems(category, list)
    const snapshot: GenerationSnapshot = { header, lines: items.map(i => i.key) }
    let due: string | null = null
    if (itinerary.start_date) {
      due = shiftDateISO(itinerary.start_date, -rule.leadDays)
      // A trip booked late: the work is due now, not on a date already past.
      if (due < today) due = today
    }

    tasks.push({
      service_type: category,
      label,
      // Short: the rows, dates and progress are shown by the checklist.
      title: `${label} — ${[itinerary.itinerary_code, itinerary.client_name].filter(Boolean).join(' · ')}`.slice(0, 500),
      description: taskDescription(snapshot),
      items,
      snapshot,
      due_date: due,
      priority: rule.priority,
      department: { id: dept.id, name: dept.name },
      service_count: list.length,
    })
  }

  return { tasks, skipped }
}

// ============================================
// CHECKLIST STATE — merging on regenerate, ticking, and the task's status
// ============================================

/**
 * Carry each row's booking state over to the newly generated rows.
 *
 * `previous` is the task's stored checklist, or null for a task generated
 * before checklists existed; then `legacyLines` (its snapshot) stands in, and
 * a task that was already done counts every one of its old rows as booked.
 * `isRegenerate` marks genuinely new rows as new — not on first creation.
 */
export function mergeChecklist(input: {
  previous: ChecklistItem[] | null
  legacyLines?: string[] | null
  legacyDone?: boolean
  planned: PlannedItem[]
  isRegenerate: boolean
}): ChecklistItem[] {
  const { planned, isRegenerate } = input
  const previous: ChecklistItem[] = input.previous
    ?? (input.legacyLines ?? []).map(key => ({
      key, day_from: 0, day_to: 0, date_from: null, date_to: null, city: null,
      name: key, quantity: 1, nights: null, supplier: null, notes: null,
      booked: !!input.legacyDone, confirmation: null, booked_at: null,
    }))

  const before = new Map(previous.map(p => [p.key, p]))
  const plannedKeys = new Set(planned.map(p => p.key))

  const rows: ChecklistItem[] = planned.map(p => {
    const prev = before.get(p.key)
    if (prev) {
      return {
        ...p,
        booked: prev.booked,
        confirmation: prev.confirmation,
        booked_at: prev.booked_at,
        ...(prev.is_new && !prev.booked ? { is_new: true } : {}),
      }
    }
    return { ...p, booked: false, confirmation: null, booked_at: null, ...(isRegenerate ? { is_new: true } : {}) }
  })

  // Booked rows that left the itinerary stay until the cancellation is done.
  for (const prev of previous) {
    if (plannedKeys.has(prev.key) || !prev.booked) continue
    rows.push({ ...prev, removed: true, is_new: undefined })
  }
  return rows
}

export interface ChecklistProgress {
  total: number
  booked: number
  toCancel: number
  newRows: number
  complete: boolean
}

export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  const active = items.filter(i => !i.removed)
  const booked = active.filter(i => i.booked).length
  const toCancel = items.filter(i => i.removed).length
  return {
    total: active.length,
    booked,
    toCancel,
    newRows: active.filter(i => i.is_new && !i.booked).length,
    complete: active.length > 0 && booked === active.length && toCancel === 0,
  }
}

/** The task status its checklist implies, starting from the current one. */
export function statusFromChecklist(items: ChecklistItem[], current: string | null): string {
  const p = checklistProgress(items)
  if (p.complete) return 'done'
  const started = p.booked > 0 || p.toCancel > 0
  if (current === 'done') return started ? 'in_progress' : 'todo'
  if ((current ?? 'todo') === 'todo' && started) return 'in_progress'
  return current ?? 'todo'
}

export type ChecklistChange =
  | { key: string; booked: boolean }
  | { key: string; confirmation: string | null }
  /** A removed row's booking has been cancelled: drop the row. */
  | { key: string; cancelled: true }

/** Apply one change a user made. Returns null when the row does not exist. */
export function applyChecklistChange(items: ChecklistItem[], change: ChecklistChange, now: string): ChecklistItem[] | null {
  const index = items.findIndex(i => i.key === change.key)
  if (index < 0) return null
  const row = items[index]
  if ('cancelled' in change) {
    if (!row.removed) return null
    return items.filter((_, i) => i !== index)
  }
  const next = { ...row }
  if ('booked' in change) {
    next.booked = change.booked
    next.booked_at = change.booked ? now : null
    if (change.booked) delete next.is_new
  } else {
    const c = (change.confirmation ?? '').trim().slice(0, 100)
    next.confirmation = c || null
  }
  return items.map((it, i) => (i === index ? next : it))
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
  checklist: ChecklistItem[] | null
}

export type TaskAction =
  | { kind: 'create'; task: PlannedTask; checklist: ChecklistItem[]; status: string }
  | { kind: 'update' | 'reopen'; id: string; task: PlannedTask; checklist: ChecklistItem[]; status: string; tripChanged: boolean }
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
    if (!current) {
      const checklist = mergeChecklist({ previous: [], planned: task.items, isRegenerate: false })
      return { kind: 'create', task, checklist, status: 'todo' }
    }
    // Unchanged — unless it predates checklists, then it is converted once.
    if (current.checklist && sameSnapshot(current.generation_snapshot, task.snapshot)) {
      return { kind: 'unchanged', id: current.id, task }
    }
    const checklist = mergeChecklist({
      previous: current.checklist,
      legacyLines: current.generation_snapshot?.lines ?? null,
      legacyDone: isFinished(current),
      planned: task.items,
      isRegenerate: true,
    })
    const status = statusFromChecklist(checklist, current.status)
    return {
      kind: isFinished(current) && status !== 'done' ? 'reopen' : 'update',
      id: current.id,
      task,
      checklist,
      status,
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
