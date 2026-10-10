import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getCurrentUserId } from '@/lib/auth/current-org'

// One Gmail client per request, for the session user's own mailbox. This route
// used to keep a single module-level OAuth2 client and setCredentials() on it
// per request: two users' requests in flight at once shared it, so one could
// list, create or delete labels in the other's Gmail. getAuthenticatedGmail
// also stores a refreshed token (DELETE and POST refreshed it and threw the
// new one away).
async function mailbox(): Promise<{ gmail: Awaited<ReturnType<typeof getAuthenticatedGmail>>['gmail'] } | NextResponse> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { gmail } = await getAuthenticatedGmail(userId)
    return { gmail }
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }
    throw err
  }
}

// GET - Fetch all labels
export async function GET() {
  try {
    // Derive the user from the session, never a client-supplied userId (IDOR).
    const auth = await mailbox()
    if (auth instanceof NextResponse) return auth
    const { gmail } = auth

    const response = await gmail.users.labels.list({ userId: 'me' })

    // Filter to show only user-created labels and some system labels
    const labels = response.data.labels?.filter(label =>
      label.type === 'user' ||
      ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED', 'IMPORTANT'].includes(label.id || '')
    ) || []

    return NextResponse.json({ labels })
  } catch (err: any) {
    console.error('Get labels error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

// POST - Create new label
export async function POST(request: NextRequest) {
  try {
    // The mailbox is the SESSION user's. A userId from the body let any
    // signed-in user create or delete labels in someone else's Gmail.
    const auth = await mailbox()
    if (auth instanceof NextResponse) return auth
    const { gmail } = auth
    const { name, backgroundColor, textColor } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const response = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        color: backgroundColor && textColor ? {
          backgroundColor,
          textColor,
        } : undefined,
      },
    })

    return NextResponse.json({ label: response.data })
  } catch (err: any) {
    console.error('Create label error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

// DELETE - Delete a label
export async function DELETE(request: NextRequest) {
  try {
    // The mailbox is the SESSION user's. A userId from the body let any
    // signed-in user create or delete labels in someone else's Gmail.
    const auth = await mailbox()
    if (auth instanceof NextResponse) return auth
    const { gmail } = auth
    const { labelId } = await request.json()

    if (!labelId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Delete label error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
