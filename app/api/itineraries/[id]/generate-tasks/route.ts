import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  buildTaskGenerationPrompt,
  parseTaskGenerationResponse,
  findDepartmentForServiceType,
  type DayForTasks,
} from '@/lib/ai/task-generation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itineraryId } = await params
    const body = await request.json()
    const assignments: Record<string, string> = body.assignments || {}

    // 1. Fetch itinerary
    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, num_adults, num_children, num_infants, status')
      .eq('id', itineraryId)
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // 2. Fetch days
    const { data: days, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select('id, day_number, date, city, title, overnight_city')
      .eq('itinerary_id', itineraryId)
      .order('day_number')

    if (daysError || !days?.length) {
      return NextResponse.json({ success: false, error: 'No itinerary days found' }, { status: 400 })
    }

    // 3. Fetch services
    const dayIds = days.map(d => d.id)
    const { data: services, error: servicesError } = await supabaseAdmin
      .from('itinerary_services')
      .select('itinerary_day_id, service_type, service_name, quantity, total_cost, notes, supplier_name')
      .in('itinerary_day_id', dayIds)

    if (servicesError) {
      return NextResponse.json({ success: false, error: 'Failed to fetch services' }, { status: 500 })
    }

    if (!services?.length) {
      return NextResponse.json({ success: false, error: 'No services found for this itinerary. Generate pricing first.' }, { status: 400 })
    }

    // 4. Group services by day
    const daysWithServices: DayForTasks[] = days.map(day => ({
      day_number: day.day_number,
      date: day.date,
      city: day.city,
      title: day.title,
      overnight_city: day.overnight_city,
      services: (services || [])
        .filter(s => s.itinerary_day_id === day.id)
        .map(s => ({
          service_type: s.service_type,
          service_name: s.service_name,
          quantity: s.quantity,
          total_cost: s.total_cost,
          notes: s.notes,
          supplier_name: s.supplier_name,
        })),
    }))

    // 5. Fetch departments
    const { data: departments } = await supabaseAdmin
      .from('departments')
      .select('id, name, service_types')
      .eq('is_active', true)

    if (!departments?.length) {
      return NextResponse.json({ success: false, error: 'No departments found. Please run the departments migration.' }, { status: 500 })
    }

    // 6. Call Claude AI
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const prompt = buildTaskGenerationPrompt(itinerary, daysWithServices)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    // 7. Parse AI response
    let aiTasks
    try {
      aiTasks = parseTaskGenerationResponse(responseText)
    } catch (parseError) {
      console.error('Failed to parse AI task response:', parseError, '\nResponse:', responseText.slice(0, 500))
      return NextResponse.json({ success: false, error: 'AI failed to generate valid task data. Please try again.' }, { status: 500 })
    }

    if (aiTasks.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'No tasks were generated. The itinerary may not have enough actionable services.',
        data: [],
      })
    }

    // 8. Map tasks to records with department + assignee
    const taskRecords = aiTasks.map(task => {
      const dept = findDepartmentForServiceType(task.service_type, departments)
      const assignedTo = dept ? (assignments[dept.id] || null) : null

      return {
        title: task.title,
        description: task.description,
        due_date: task.suggested_due_date || null,
        priority: task.priority,
        status: 'todo',
        assigned_to: assignedTo,
        department_id: dept?.id || null,
        linked_type: 'itinerary',
        linked_id: itineraryId,
        notes: `Auto-generated from ${itinerary.itinerary_code}`,
        archived: false,
        archived_at: null,
      }
    })

    // 9. Bulk insert tasks
    const { data: createdTasks, error: insertError } = await supabaseAdmin
      .from('tasks')
      .insert(taskRecords)
      .select('id, title, priority, assigned_to, department_id')

    if (insertError) {
      console.error('Failed to insert tasks:', insertError)
      return NextResponse.json({ success: false, error: 'Failed to create tasks' }, { status: 500 })
    }

    // 10. Send notifications to each unique assignee
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
    const uniqueAssignees = [...new Set(
      (createdTasks || [])
        .map(t => t.assigned_to)
        .filter(Boolean)
    )]

    for (const assigneeId of uniqueAssignees) {
      const assigneeTasks = (createdTasks || []).filter(t => t.assigned_to === assigneeId)
      try {
        await fetch(`${baseUrl}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_member_id: assigneeId,
            type: 'task_assigned',
            title: `${assigneeTasks.length} new operations task${assigneeTasks.length !== 1 ? 's' : ''} for ${itinerary.itinerary_code}`,
            message: `${assigneeTasks.length} operations task${assigneeTasks.length !== 1 ? 's have' : ' has'} been generated for itinerary ${itinerary.itinerary_code} (${itinerary.client_name}, ${itinerary.start_date} to ${itinerary.end_date}). Please review and begin processing.`,
            link: '/tasks',
            related_task_id: assigneeTasks[0]?.id || null,
            send_email: true,
          }),
        })
      } catch (notifError) {
        console.error(`Failed to send notification to ${assigneeId}:`, notifError)
      }
    }

    return NextResponse.json({
      success: true,
      count: createdTasks?.length || 0,
      message: `Generated ${createdTasks?.length || 0} operations tasks`,
      data: createdTasks,
    })

  } catch (error) {
    console.error('Error generating tasks:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
