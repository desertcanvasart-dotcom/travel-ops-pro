import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { ownNotificationIds } from '@/lib/notifications-scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Only the addressee may read-mark or delete a notification; anyone else's
// id simply does not match and comes back 404. The ownership check is a
// SELECT, the mutation is by id — see ownNotificationIds for why.
async function owned(id: string): Promise<'unauthenticated' | 'not-found' | 'ok'> {
  const userId = await getCurrentUserId()
  if (!userId) return 'unauthenticated'
  const ids = await ownNotificationIds(supabase, userId, { id })
  return ids.length ? 'ok' : 'not-found'
}

// PUT - Mark notification as read
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const own = await owned(id)
    if (own === 'unauthenticated') return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    if (own === 'not-found') return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 })
    const body = await request.json()
    const { is_read = true } = body

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read, updated_at: new Date().toISOString() })
      .eq('id', id)
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
    const { id } = await params
    const own = await owned(id)
    if (own === 'unauthenticated') return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    if (own === 'not-found') return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
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
