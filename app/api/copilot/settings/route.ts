// ============================================
// API: COPILOT SETTINGS
// ============================================
// GET  /api/copilot/settings — Get user's copilot settings
// PUT  /api/copilot/settings — Update user's copilot settings
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_TONES = ['professional', 'friendly', 'formal']

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'user_id is required' },
        { status: 400 }
      )
    }

    const { data: settings } = await supabase
      .from('copilot_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    // Return defaults if no settings exist
    return NextResponse.json({
      success: true,
      settings: settings || {
        user_id: userId,
        tone: 'professional',
      },
    })
  } catch (error: any) {
    console.error('Error fetching copilot settings:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to load settings') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, tone } = body

    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id is required' },
        { status: 400 }
      )
    }

    if (tone && !VALID_TONES.includes(tone)) {
      return NextResponse.json(
        { success: false, error: `tone must be one of: ${VALID_TONES.join(', ')}` },
        { status: 400 }
      )
    }

    // Upsert settings
    const { data: settings, error } = await supabase
      .from('copilot_settings')
      .upsert(
        {
          user_id,
          tone: tone || 'professional',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, settings })
  } catch (error: any) {
    console.error('Error updating copilot settings:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to update settings') },
      { status: 500 }
    )
  }
}
