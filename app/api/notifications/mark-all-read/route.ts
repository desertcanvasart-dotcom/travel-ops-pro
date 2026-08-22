import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { ownNotificationIds } from '@/lib/notifications-scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PUT - Mark all of the signed-in user's notifications as read
export async function PUT(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    const ids = await ownNotificationIds(supabase, userId, { unreadOnly: true })
    if (!ids.length) return NextResponse.json({ success: true, message: '0 notifications marked as read', count: 0 })

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('id')

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0} notifications marked as read`,
      count: data?.length || 0
    })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    )
  }
}
