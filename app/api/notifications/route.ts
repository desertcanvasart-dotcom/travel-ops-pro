import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { linkedTeamMemberIds, notificationScopeFilter } from '@/lib/notifications-scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - the signed-in user's own notifications (+ their unread count).
// Rows are addressed to a login (user_id) or, for legacy rows, to a
// team_members entry linked to that login. Nothing else is visible.
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20') || 20, 1), 200)
    const scope = notificationScopeFilter(userId, await linkedTeamMemberIds(supabase, userId))

    let query = supabase
      .from('notifications')
      .select(`
        *,
        team_member:team_members(id, name, email)
      `)
      .or(scope)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (unreadOnly) query = query.eq('is_read', false)

    const { data, error } = await query
    if (error) throw error

    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .or(scope)
      .eq('is_read', false)

    return NextResponse.json({ success: true, data, unreadCount: unreadCount || 0 })
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
      user_id: body.user_id ?? null,
      team_member_id: body.team_member_id ?? null,
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
// - task_assigned / task_due_soon / task_overdue / task_completed
// - trip_assigned: An itinerary was assigned to this user
// - whatsapp_assigned / whatsapp_new_message
// - booking_change_request: a customer asked for a change on the portal (managers)
