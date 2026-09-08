import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/supabase-secure'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch email settings
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    // Email settings live on the current user's user_settings row, keyed on
    // user_id. The old code did an unfiltered .single(), which returns the
    // wrong user's row (or errors) once more than one user has settings.
    const { user } = await getAuthenticatedUser()
    let emailSettings: Record<string, any> = {}
    if (user) {
      const { data: settingsData } = await supabase
        .from('user_settings')
        .select('email_settings')
        .eq('user_id', user.id)
        .maybeSingle()
      emailSettings = settingsData?.email_settings || {}
    }

    // Check actual Gmail connection from gmail_tokens table
    // Try user-specific token first, then fall back to any token
    let tokenData: Record<string, unknown> | null = null

    if (userId) {
      const { data, error } = await supabase
        .from('gmail_tokens')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (!error && data) tokenData = data
    }

    // Fallback: check for any connected Gmail account
    if (!tokenData) {
      const { data, error } = await supabase
        .from('gmail_tokens')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      if (!error && data) tokenData = data
    }

    // The column might be 'email', 'email_address', or 'email_address' — check all
    const gmailEmail = String(tokenData?.email || tokenData?.email_address || '')
    const gmailConnected = !!gmailEmail

    return NextResponse.json({
      gmail_connected: gmailConnected,
      gmail_email: gmailEmail,
      signature: emailSettings.signature || '',
      auto_reply_enabled: emailSettings.auto_reply_enabled || false,
      auto_reply_message: emailSettings.auto_reply_message || ''
    })
  } catch (error) {
    console.error('Error fetching email settings:', error)
    return NextResponse.json({
      gmail_connected: false,
      gmail_email: '',
      signature: '',
      auto_reply_enabled: false,
      auto_reply_message: ''
    })
  }
}

// PUT - Update email settings
export async function PUT(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const settings = await request.json()

    const validSettings = {
      gmail_connected: Boolean(settings.gmail_connected),
      gmail_email: settings.gmail_email || '',
      signature: settings.signature || '',
      auto_reply_enabled: Boolean(settings.auto_reply_enabled),
      auto_reply_message: settings.auto_reply_message || ''
    }

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          email_settings: validSettings,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Error saving email settings:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to save email settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: validSettings
    })
  } catch (error) {
    console.error('Error updating email settings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save email settings' },
      { status: 500 }
    )
  }
}
