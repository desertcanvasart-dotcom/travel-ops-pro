import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchEmails, refreshAccessToken } from '@/lib/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('userId')
  const query = searchParams.get('query') || ''
  const pageToken = searchParams.get('pageToken') || undefined
  const maxResults = parseInt(searchParams.get('maxResults') || '20')

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  try {
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
      // Refresh the token
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      // Update tokens in database
      await supabase
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }

    // Fetch emails
    const { messages, nextPageToken } = await fetchEmails(
      access_token,
      refresh_token,
      { maxResults, query, pageToken }
    )

    return NextResponse.json({ messages, nextPageToken })
  } catch (err: any) {
    console.error('Fetch emails error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}