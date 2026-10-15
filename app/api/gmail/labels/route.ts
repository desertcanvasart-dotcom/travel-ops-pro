import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { GmailAuthError } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { paletteColor } from '@/lib/email/label-colors'

// One Gmail client per request, for the session user's own mailbox. This route
// used to keep a single module-level OAuth2 client and setCredentials() on it
// per request: two users' requests in flight at once shared it, so one could
// list, create or delete labels in the other's Gmail. getAuthenticatedGmail
// also stores a refreshed token (DELETE and POST refreshed it and threw the
// new one away).
async function mailbox(): Promise<{ gmail: Awaited<ReturnType<typeof getMailboxGmail>>['gmail'] } | NextResponse> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Your own mailbox, else the organisation's shared one (lib/gmail-mailbox).
    const { gmail } = await getMailboxGmail(userId)
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
        // Only Gmail's palette (lib/email/label-colors); anything else is dropped.
        color: paletteColor(backgroundColor, textColor) ?? undefined,
      },
    })

    return NextResponse.json({ label: response.data })
  } catch (err: any) {
    console.error('Create label error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

const USER_LABEL_ID = /^Label_[0-9]+$/

// PATCH - Rename a folder { labelId, name }. Gmail keeps the emails filed
// under it; only the name changes.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await mailbox()
    if (auth instanceof NextResponse) return auth
    const { gmail } = auth
    const { labelId, name, backgroundColor, textColor } = await request.json()

    // A new name, a new colour, or both. A colour is changed, not removed:
    // Gmail's palette has Grey for a quiet one.
    const newName = typeof name === 'string' ? name.trim() : ''
    const colorGiven = backgroundColor !== undefined
    const color = colorGiven ? paletteColor(backgroundColor, textColor) : undefined
    if (!labelId || (!newName && !colorGiven)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (colorGiven && !color) {
      return NextResponse.json({ error: 'Pick one of the folder colours' }, { status: 400 })
    }
    if (!USER_LABEL_ID.test(String(labelId))) {
      return NextResponse.json({ error: 'Only a folder you created can be renamed' }, { status: 400 })
    }
    if (newName.length > 225) {
      return NextResponse.json({ error: 'Folder name is too long' }, { status: 400 })
    }

    const response = await gmail.users.labels.patch({
      userId: 'me',
      id: String(labelId),
      requestBody: {
        ...(newName ? { name: newName } : {}),
        ...(color ? { color } : {}),
      },
    })
    return NextResponse.json({ label: response.data })
  } catch (err: any) {
    console.error('Rename label error:', err)
    // Gmail answers 409 when a folder of that name exists.
    if (err?.code === 409 || err?.status === 409) {
      return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
    }
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
    // Only a folder someone made (Gmail's user labels are Label_<n>).
    if (!USER_LABEL_ID.test(String(labelId))) {
      return NextResponse.json({ error: 'Only a folder you created can be deleted' }, { status: 400 })
    }

    // Its emails go back to the Inbox first: one moved into the folder left
    // the inbox, and with the folder gone it would be in "All Mail" only.
    let pageToken: string | undefined
    for (let page = 0; page < 20; page++) {
      const { data } = await gmail.users.messages.list({ userId: 'me', labelIds: [String(labelId)], maxResults: 500, pageToken })
      const ids = (data.messages || []).map(m => m.id).filter((id): id is string => !!id)
      if (ids.length > 0) {
        await gmail.users.messages.batchModify({ userId: 'me', requestBody: { ids, addLabelIds: ['INBOX'] } })
      }
      if (!data.nextPageToken) break
      pageToken = data.nextPageToken
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
