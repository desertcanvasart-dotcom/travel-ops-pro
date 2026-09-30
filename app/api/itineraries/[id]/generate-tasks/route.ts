import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  planItineraryTasks,
  planSync,
  changeNote,
  type ExistingGeneratedTask,
  type ServiceForTasks,
} from '@/lib/tasks/itinerary-tasks'
import { createNotifications } from '@/lib/notifications'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { todayFromRequest } from '@/lib/today'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST — generate (or re-sync) the itinerary's operations tasks: one per
// service category, built from the services directly (lib/tasks/itinerary-tasks.ts).
//
// Body: { assignments?: { [departmentId]: teamMemberId }, dry_run?: boolean }
// dry_run returns what WOULD happen — the dialog shows it before anything is
// written.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id: itineraryId } = await params
    const body = await request.json().catch(() => ({}))
    const assignments: Record<string, string> = body.assignments || {}
    const dryRun = body.dry_run === true
    const today = todayFromRequest(request.url)

    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('id, itinerary_code, client_name, trip_name, start_date, end_date, num_adults, num_children, num_infants')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    const { data: days, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select('id, day_number, date, city, overnight_city')
      .eq('itinerary_id', itineraryId)
      .order('day_number')

    if (daysError || !days?.length) {
      return NextResponse.json({ success: false, error: 'No itinerary days found' }, { status: 400 })
    }

    const [servicesRes, departmentsRes, existingRes] = await Promise.all([
      supabaseAdmin
        .from('itinerary_services')
        .select('itinerary_day_id, service_type, service_code, service_name, quantity, notes, supplier_name')
        .in('itinerary_day_id', days.map(d => d.id)),
      // Active only: a department switched off gets no tasks at all.
      supabaseAdmin
        .from('departments')
        .select('id, name, service_types')
        .eq('is_active', true),
      supabaseAdmin
        .from('tasks')
        .select('id, service_type, status, archived, assigned_to, generation_snapshot')
        .eq('linked_type', 'itinerary')
        .eq('linked_id', itineraryId)
        .order('created_at'),
    ])

    if (servicesRes.error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch services' }, { status: 500 })
    }
    if (!servicesRes.data?.length) {
      return NextResponse.json({ success: false, error: 'No services found for this itinerary. Generate pricing first.' }, { status: 400 })
    }
    if (departmentsRes.error) throw departmentsRes.error
    if (existingRes.error) throw existingRes.error

    const dayById = new Map(days.map(d => [d.id, d]))
    const services: ServiceForTasks[] = servicesRes.data.map(s => {
      const day = dayById.get(s.itinerary_day_id)!
      return {
        day_number: day.day_number,
        date: day.date,
        city: day.city,
        overnight_city: day.overnight_city,
        service_type: s.service_type,
        service_code: s.service_code,
        service_name: s.service_name,
        quantity: s.quantity,
        supplier_name: s.supplier_name,
        notes: s.notes,
      }
    })

    const plan = planItineraryTasks({
      itinerary,
      services,
      departments: departmentsRes.data ?? [],
      today,
    })

    const existing = existingRes.data ?? []
    const generated = existing.filter(t => t.service_type) as ExistingGeneratedTask[]
    // Tasks made by hand, or by the old AI generator — left exactly as they are.
    const otherTasks = existing.length - generated.length

    const sync = planSync(plan, generated)

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        tasks: sync.actions.map(a => ({
          action: a.kind,
          service_type: a.task.service_type,
          label: a.task.label,
          service_count: a.task.service_count,
          department: a.task.department,
          due_date: a.task.due_date,
          priority: a.task.priority,
        })),
        skipped: plan.skipped,
        orphaned: sync.orphaned,
        other_tasks: otherTasks,
      })
    }

    const now = new Date().toISOString()
    const assigneeFor = (deptId: string, current: string | null = null) =>
      current || assignments[deptId] || null

    // Creates — one insert.
    const creates = sync.actions.filter(a => a.kind === 'create')
    let created: Array<{ id: string; assigned_to: string | null }> = []
    if (creates.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .insert(creates.map(({ task }) => ({
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          priority: task.priority,
          status: 'todo',
          assigned_to: assigneeFor(task.department.id),
          department_id: task.department.id,
          linked_type: 'itinerary',
          linked_id: itineraryId,
          service_type: task.service_type,
          generation_snapshot: task.snapshot,
          notes: `Auto-generated from ${itinerary.itinerary_code}`,
          archived: false,
          archived_at: null,
        })))
        .select('id, assigned_to')
      if (error) {
        console.error('Failed to insert tasks:', error)
        return NextResponse.json({ success: false, error: 'Failed to create tasks' }, { status: 500 })
      }
      created = data ?? []
    }

    // Updates and reopens — one row each; status and assignee are kept, and
    // an empty assignee is filled from the dialog.
    const currentById = new Map(generated.map(t => [t.id, t]))
    const reopened: Array<{ id: string; assigned_to: string | null }> = []
    let updatedCount = 0
    for (const action of sync.actions) {
      if (action.kind !== 'update' && action.kind !== 'reopen') continue
      const { task } = action
      const current = currentById.get(action.id)!
      const assignedTo = assigneeFor(task.department.id, current.assigned_to)
      const fields: Record<string, unknown> = {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        priority: task.priority,
        department_id: task.department.id,
        assigned_to: assignedTo,
        generation_snapshot: task.snapshot,
        updated_at: now,
      }
      if (action.kind === 'reopen') {
        Object.assign(fields, {
          description: `${changeNote(action, today)}\n\n${task.description}`,
          status: 'todo',
          completed_at: null,
          archived: false,
          archived_at: null,
        })
      }
      const { error } = await supabaseAdmin.from('tasks').update(fields).eq('id', action.id)
      if (error) throw error
      if (action.kind === 'reopen') reopened.push({ id: action.id, assigned_to: assignedTo })
      else updatedCount++
    }

    // Tell each person what landed on their list: new tasks and reopened ones.
    const byAssignee = new Map<string, { created: string[]; reopened: string[] }>()
    const tally = (list: typeof created, key: 'created' | 'reopened') => {
      for (const t of list) {
        if (!t.assigned_to) continue
        if (!byAssignee.has(t.assigned_to)) byAssignee.set(t.assigned_to, { created: [], reopened: [] })
        byAssignee.get(t.assigned_to)![key].push(t.id)
      }
    }
    tally(created, 'created')
    tally(reopened, 'reopened')
    const notified = await createNotifications(
      [...byAssignee].map(([assigneeId, mine]) => {
        const parts = [
          mine.created.length ? `${mine.created.length} new` : '',
          mine.reopened.length ? `${mine.reopened.length} reopened (itinerary changed)` : '',
        ].filter(Boolean).join(', ')
        return {
          team_member_id: assigneeId,
          type: 'task_assigned' as const,
          title: `Operations tasks for ${itinerary.itinerary_code}: ${parts}`,
          message: `Operations tasks for itinerary ${itinerary.itinerary_code} (${itinerary.client_name}, ${itinerary.start_date} to ${itinerary.end_date}): ${parts}. Please review and begin processing.`,
          link: '/tasks',
          related_task_id: mine.created[0] ?? mine.reopened[0] ?? null,
          related_itinerary_id: itineraryId,
        }
      })
    )

    const counts = {
      created: created.length,
      updated: updatedCount,
      reopened: reopened.length,
      unchanged: sync.actions.filter(a => a.kind === 'unchanged').length,
    }

    return NextResponse.json({
      success: true,
      count: counts.created + counts.updated + counts.reopened,
      counts,
      message: `Tasks: ${counts.created} created, ${counts.updated} updated, ${counts.reopened} reopened, ${counts.unchanged} unchanged`,
      skipped: plan.skipped,
      orphaned: sync.orphaned,
      notified: notified.created,
    })
  } catch (error) {
    console.error('Error generating tasks:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate tasks' }, { status: 500 })
  }
}
