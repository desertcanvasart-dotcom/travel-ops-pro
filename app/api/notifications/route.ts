import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { getCurrentOrgId, getCurrentUserId, requireRole } from '@/lib/auth/current-org'
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
//
// Who may send what: this creates an in-app alert AND, by default, an email
// from the operator's own mailbox — so it was a phishing channel for any
// session, viewer included (any recipient, any text, any link). Now: agent and
// above only (the only UI caller is task assignment), a login recipient must be
// in the caller's workspace, the link must be a path inside this app (the bell
// navigates to it), and text is capped.
const MAX_TITLE = 200
const MAX_MESSAGE = 2000

function inAppLink(link: unknown): string | null | undefined {
  if (link == null || link === '') return null
  if (typeof link !== 'string') return undefined
  return link.startsWith('/') && !link.startsWith('//') && !link.startsWith('/\\') ? link : undefined
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied

    const body = await request.json()

    const link = inAppLink(body.link)
    if (link === undefined) {
      return NextResponse.json({ success: false, error: 'link must be a path inside this app' }, { status: 400 })
    }
    if (typeof body.title !== 'string' || body.title.length > MAX_TITLE ||
        (body.message != null && (typeof body.message !== 'string' || body.message.length > MAX_MESSAGE))) {
      return NextResponse.json({ success: false, error: 'title or message missing or too long' }, { status: 400 })
    }
    if (body.user_id) {
      const orgId = await getCurrentOrgId()
      const { data: member } = orgId
        ? await supabase
            .from('organization_members')
            .select('user_id')
            .eq('org_id', orgId)
            .eq('user_id', body.user_id)
            .maybeSingle()
        : { data: null }
      if (!member) {
        return NextResponse.json({ success: false, error: 'Recipient not found' }, { status: 404 })
      }
    }

    const result = await createNotification({
      user_id: body.user_id ?? null,
      team_member_id: body.team_member_id ?? null,
      type: body.type,
      title: body.title,
      message: body.message,
      link,
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
