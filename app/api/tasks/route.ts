import { NextRequest, NextResponse } from 'next/server'
import { shiftDateISO, todayFromRequest } from '@/lib/today'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { taskRefsInOrg, teamMemberInactive, INACTIVE_ASSIGNEE } from '@/lib/org-refs'
import { taskSummary, TASK_LIST_LIMIT, NOT_ARCHIVED } from '@/lib/tasks/summary'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The organisation's own tasks only (tasks.org_id, migration 20261203): this
// listed, and created tasks against, every company's.
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignedTo = searchParams.get('assignedTo')
    const dueDate = searchParams.get('dueDate')
    const includeArchived = searchParams.get('includeArchived') === 'true'

    // Build query
    const departmentId = searchParams.get('departmentId')
    // One trip's tasks (the itinerary page's Tasks card): generate-tasks links
    // them as linked_type 'itinerary'.
    const itineraryId = searchParams.get('itineraryId')

    // count: 'exact' says how many matched; the list itself is capped (newest
    // first) at TASK_LIST_LIMIT, below PostgREST's max-rows, so the screen
    // knows — and says — when it shows fewer than matched instead of silently
    // dropping the oldest.
    let query = supabase
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members!tasks_assigned_to_fkey(id, name, role, email),
        department:departments(id, name)
      `, { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    if (itineraryId) {
      query = query.eq('linked_type', 'itinerary').eq('linked_id', itineraryId)
    }

    // Filter by archived status - only show non-archived by default
    if (!includeArchived) {
      query = query.or(NOT_ARCHIVED)
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    // Due date filters
    if (dueDate) {
      // The caller's calendar date, not the UTC server's (see todayFromRequest).
      const todayStr = todayFromRequest(request.url)

      if (dueDate === 'overdue') {
        query = query.lt('due_date', todayStr).neq('status', 'done')
      } else if (dueDate === 'today') {
        query = query.eq('due_date', todayStr)
      } else if (dueDate === 'week') {
        const weekEndStr = shiftDateISO(todayStr, 7)
        query = query.gte('due_date', todayStr).lte('due_date', weekEndStr)
      } else if (dueDate === 'upcoming') {
        query = query.gte('due_date', todayStr)
      }
    }

    const { data: tasks, error, count } = await query.limit(TASK_LIST_LIMIT)

    if (error) {
      console.error('Error fetching tasks:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Exact counts over every task of the org (lib/tasks/summary).
    const summary = await taskSummary(supabase, orgId, todayFromRequest(request.url))

    return NextResponse.json({
      success: true,
      data: tasks || [],
      // How many tasks matched the filters; more than data.length when capped.
      matched: count ?? (tasks || []).length,
      limit: TASK_LIST_LIMIT,
      summary
    })
  } catch (error) {
    console.error('Error in tasks GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()

    // Who it is for, where it routes and what it is about must be this
    // organisation's own.
    if (!(await taskRefsInOrg(supabase, orgId, body))) {
      return NextResponse.json({ success: false, error: 'Assignee, department or linked record not found' }, { status: 404 })
    }
    // A removed (deactivated) member gets no reminders (task-reminders skips
    // them), so a task given to one would never remind anybody.
    if (body.assigned_to && (await teamMemberInactive(supabase, orgId, body.assigned_to))) {
      return NextResponse.json({ success: false, error: INACTIVE_ASSIGNEE }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        org_id: orgId,
        title: body.title,
        description: body.description || null,
        due_date: body.due_date || null,
        priority: body.priority || 'medium',
        status: 'todo',
        assigned_to: body.assigned_to || null,
        linked_type: body.linked_type || null,
        linked_id: body.linked_id || null,
        notes: body.notes || null,
        department_id: body.department_id || null,
        archived: false,
        archived_at: null
      })
      .select(`
        *,
        assigned_member:team_members!tasks_assigned_to_fkey(id, name, role, email)
      `)
      .single()

    if (error) {
      console.error('Error creating task:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in tasks POST:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}