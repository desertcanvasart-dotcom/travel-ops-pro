import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PUT - Mark all notifications as read
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamMemberId = searchParams.get('teamMemberId')

    let query = supabase
      .from('notifications')
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('is_read', false)

    if (teamMemberId) {
      query = query.eq('team_member_id', teamMemberId)
    }

    const { data, error } = await query.select()

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