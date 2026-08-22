import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { linkedTeamMemberIds, notificationScopeFilter } from '@/lib/notifications-scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PUT - Mark all of the signed-in user's notifications as read
export async function PUT(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    const scope = notificationScopeFilter(userId, await linkedTeamMemberIds(supabase, userId))

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('is_read', false)
      .or(scope)
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
