import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { linkedTeamMemberIds, notificationScopeFilter } from '@/lib/notifications-scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Only the addressee may read-mark or delete a notification; anyone else's
// id simply does not match and comes back 404.
async function ownScope(): Promise<string | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  return notificationScopeFilter(userId, await linkedTeamMemberIds(supabase, userId))
}

// PUT - Mark notification as read
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await ownScope()
    if (!scope) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    const { id } = await params
    const body = await request.json()
    const { is_read = true } = body

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read, updated_at: new Date().toISOString() })
      .eq('id', id)
      .or(scope)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating notification:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a notification
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await ownScope()
    if (!scope) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    const { id } = await params

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .or(scope)
      .select('id')

    if (error) throw error
    if (!data?.length) return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 })

    return NextResponse.json({ success: true, message: 'Notification deleted' })
  } catch (error) {
    console.error('Error deleting notification:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    )
  }
}
