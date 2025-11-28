import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUrl } from '@/lib/gmail'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Generate OAuth URL with user ID as state
    const authUrl = getAuthUrl(userId)

    return NextResponse.json({ authUrl })
  } catch (err: any) {
    console.error('Gmail connect error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}