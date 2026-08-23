// ============================================
// API: COPILOT SETTINGS
// ============================================
// GET        /api/copilot/settings — the signed-in user's copilot settings
// PUT/PATCH  /api/copilot/settings — update them ({ tone })
//
// The user is the SIGNED-IN user, resolved server-side. The route used to
// take a client-supplied user_id — any signed-in user could read or set a
// colleague's tone — and 400'd without one, which is how the Knowledge
// page's tone card (no user_id, PATCH) never worked. A user_id in the
// request is ignored.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_TONES = ['professional', 'friendly', 'formal']

export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const { data: settings } = await supabase
      .from('copilot_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

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
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user_id = await getCurrentUserId()
    if (!user_id) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const { tone } = body

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
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// The Knowledge page saves with PATCH; same contract.
export const PATCH = PUT
