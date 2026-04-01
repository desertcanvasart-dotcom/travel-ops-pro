import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch email settings
export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('email_settings')
      .single()

    if (data?.email_settings) {
      return NextResponse.json(data.email_settings)
    }

    // Return defaults if no settings exist
    return NextResponse.json({
      gmail_connected: false,
      gmail_email: '',
      signature: '',
      auto_reply_enabled: false,
      auto_reply_message: ''
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
      .upsert({
        id: 'default',
        email_settings: validSettings,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Error saving email settings:', error)
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
