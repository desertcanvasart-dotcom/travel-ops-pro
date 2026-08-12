import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch notifications for a team member
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamMemberId = searchParams.get('teamMemberId')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabase
      .from('notifications')
      .select(`
        *,
        team_member:team_members(id, name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (teamMemberId) {
      query = query.eq('team_member_id', teamMemberId)
    }

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query

    if (error) throw error

    // Also get unread count
    let countQuery = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)

    if (teamMemberId) {
      countQuery = countQuery.eq('team_member_id', teamMemberId)
    }

    const { count: unreadCount } = await countQuery

    return NextResponse.json({
      success: true,
      data,
      unreadCount: unreadCount || 0
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

// POST - Create a new notification
//
// A thin wrapper over lib/notifications.createNotification. The creation logic
// lives there because server code CANNOT reach this route: the /api/* auth gate
// rejects a session-less server-to-server fetch, so anything calling it from
// the server silently created nothing (see the note in lib/notifications.ts).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const result = await createNotification({
      team_member_id: body.team_member_id,
      type: body.type,
      title: body.title,
      message: body.message,
      link: body.link ?? null,
      related_task_id: body.related_task_id ?? null,
      related_itinerary_id: body.related_itinerary_id ?? null,
      send_email: body.send_email !== false,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to create notification' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data: result.notification, emailed: result.emailed })
  } catch (error) {
    console.error('Error creating notification:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    )
  }
}

// Notification types reference:
// - task_assigned: New task assigned
// - task_due_soon: Task due soon reminder
// - task_overdue: Task is overdue
// - task_completed: Task was completed
// - trip_assigned: An itinerary was assigned to this team member
// - whatsapp_assigned: WhatsApp conversation assigned
// - whatsapp_new_message: New message in assigned chat
