import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { fetchEmails, getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getCurrentUserId } from '@/lib/auth/current-org'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  // Derive the user from the session, never a client-supplied userId (IDOR).
  const userId = await getCurrentUserId()
  const query = searchParams.get('query') || ''
  const pageToken = searchParams.get('pageToken') || undefined
  const maxResults = parseInt(searchParams.get('maxResults') || '20')

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 401 })
    }
    console.error('Fetch emails error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
