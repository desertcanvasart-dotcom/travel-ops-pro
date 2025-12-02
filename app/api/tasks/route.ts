import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch tasks with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignedTo = searchParams.get('assignedTo')
    const linkedType = searchParams.get('linkedType')
    const linkedId = searchParams.get('linkedId')
    const dueDate = searchParams.get('dueDate') // today, overdue, upcoming, week

    let query = supabaseAdmin
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, role)
      `)
      .order('due_date', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    if (linkedType) {
      query = query.eq('linked_type', linkedType)
    }

    if (linkedId) {
      query = query.eq('linked_id', linkedId)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    if (dueDate) {
      switch (dueDate) {
        case 'today':
          query = query.eq('due_date', todayStr)
          break
        case 'overdue':
          query = query.lt('due_date', todayStr).neq('status', 'done')
          break
        case 'upcoming':
          query = query.gte('due_date', todayStr)
          break
        case 'week':
          const weekFromNow = new Date(today)
          weekFromNow.setDate(weekFromNow.getDate() + 7)
          query = query.gte('due_date', todayStr).lte('due_date', weekFromNow.toISOString().split('T')[0])
          break
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching tasks:', error)
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
    }

    // Calculate summary stats
    const allTasks = data || []
    const summary = {
      total: allTasks.length,
      todo: allTasks.filter(t => t.status === 'todo').length,
      in_progress: allTasks.filter(t => t.status === 'in_progress').length,
      done: allTasks.filter(t => t.status === 'done').length,
      overdue: allTasks.filter(t => {
        if (t.status === 'done') return false
        return t.due_date && new Date(t.due_date) < today
      }).length,
      due_today: allTasks.filter(t => t.due_date === todayStr && t.status !== 'done').length,
      high_priority: allTasks.filter(t => (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'done').length
    }

    return NextResponse.json({ success: true, data, summary })
  } catch (error) {
    console.error('Error in tasks GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { 
      title, 
      description,
      due_date, 
      priority = 'medium', 
      assigned_to,
      linked_type,
      linked_id,
      notes 
    } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        title,
        description: description || null,
        due_date: due_date || null,
        priority,
        status: 'todo',
        assigned_to: assigned_to || null,
        linked_type: linked_type || null,
        linked_id: linked_id || null,
        notes: notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        *,
        assigned_member:team_members(id, name, role)
      `)
      .single()

    if (error) {
      console.error('Error creating task:', error)
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in tasks POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}