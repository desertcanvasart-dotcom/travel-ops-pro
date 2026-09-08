import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizePreferences,
} from '@/lib/notification-preferences'

// Service role for the write/read of the settings row itself; the acting user
// is resolved from the session (getAuthenticatedUser), never trusted from the
// client. Preferences are keyed on user_settings.user_id (UNIQUE) — the old
// code upserted a literal id:'default', which isn't a valid uuid for the PK, so
// the write errored, was swallowed, and nothing was ever saved.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch the current user's notification preferences
export async function GET(_request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser()
  if (authError || !user) {
    // Unauthenticated callers get the defaults, not someone else's row.
    return NextResponse.json(DEFAULT_NOTIFICATION_PREFERENCES)
  }

  try {
    const { data } = await supabase
      .from('user_settings')
      .select('notification_preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json(
      normalizePreferences(
        (data as { notification_preferences?: Record<string, unknown> } | null)
          ?.notification_preferences
      )
    )
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    return NextResponse.json(DEFAULT_NOTIFICATION_PREFERENCES)
  }
}

// PUT - Update the current user's notification preferences
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser()
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 }
    )
  }

  try {
    const preferences = await request.json()

    const validPrefs = {
      task_assigned: Boolean(preferences.task_assigned),
      task_due_soon: Boolean(preferences.task_due_soon),
      task_overdue: Boolean(preferences.task_overdue),
      task_completed: Boolean(preferences.task_completed),
      email_enabled: Boolean(preferences.email_enabled),
      in_app_enabled: Boolean(preferences.in_app_enabled),
    }

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          notification_preferences: validPrefs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Error saving notification settings:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to save notification settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: validPrefs })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update notification settings' },
      { status: 500 }
    )
  }
}
