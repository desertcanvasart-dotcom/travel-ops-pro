import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, refreshAccessToken } from '@/lib/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, to, subject, body, threadId } = await request.json()

    if (!userId || !to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    // Check if token is expired
    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      await supabase
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }

    // Send email
    const result = await sendEmail(access_token, refresh_token, to, subject, body, threadId)

    return NextResponse.json({ success: true, messageId: result.id })
  } catch (err: any) {
    console.error('Send email error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}