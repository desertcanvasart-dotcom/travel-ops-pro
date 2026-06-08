import { NextRequest, NextResponse } from 'next/server'
import { fetchEmails, getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import { clientMessage } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('query') || ''
  const pageToken = searchParams.get('pageToken') || undefined
  const maxResults = parseInt(searchParams.get('maxResults') || '20')

  // Derive the user from the session — never trust a client-supplied userId.
  const { user, error: authError } = await getAuthenticatedUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const userId = user.id

  try {
    // Get authenticated Gmail client (handles token fetch + refresh)
    const { accessToken, refreshToken } = await getAuthenticatedGmail(userId)

    // Fetch emails
    const { messages, nextPageToken } = await fetchEmails(
      accessToken,
      refreshToken,
      { maxResults, query, pageToken }
    )

    return NextResponse.json({ messages, nextPageToken })
  } catch (err: any) {
    if (err instanceof GmailAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    console.error('Fetch emails error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Failed to fetch emails') }, { status: 500 })
  }
}
