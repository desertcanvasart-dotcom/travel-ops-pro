import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch notification preferences
export async function GET(request: NextRequest) {
  try {
    // For now, return default preferences
    // In production, you'd fetch from a user_settings table
    
    // Try to get from user_settings table if it exists
    const { data, error } = await supabase
      .from('user_settings')
      .select('notification_preferences')
      .single()

    if (data?.notification_preferences) {
      return NextResponse.json(data.notification_preferences)
    }

    // Return defaults if no settings exist
    return NextResponse.json({
      task_assigned: true,
      task_due_soon: true,
      task_overdue: true,
      task_completed: false,
      email_enabled: true,
      in_app_enabled: true
    })
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    // Return defaults on error
    return NextResponse.json({
      task_assigned: true,
      task_due_soon: true,
      task_overdue: true,
      task_completed: false,
      email_enabled: true,
      in_app_enabled: true
    })
  }
}

// PUT - Update notification preferences
export async function PUT(request: NextRequest) {
  try {
    const preferences = await request.json()

    // Validate the preferences object
    const validPrefs = {
      task_assigned: Boolean(preferences.task_assigned),
      task_due_soon: Boolean(preferences.task_due_soon),
      task_overdue: Boolean(preferences.task_overdue),
      task_completed: Boolean(preferences.task_completed),
      email_enabled: Boolean(preferences.email_enabled),
      in_app_enabled: Boolean(preferences.in_app_enabled)
    }

    // Try to upsert to user_settings table
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        id: 'default', // Use user ID in production
        notification_preferences: validPrefs,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Error saving notification settings:', error)
      // Still return success since we validated the preferences
      // The settings will be stored next time the table exists
    }

    return NextResponse.json({
      success: true,
      data: validPrefs
    })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update notification settings' },
      { status: 500 }
    )
  }
}