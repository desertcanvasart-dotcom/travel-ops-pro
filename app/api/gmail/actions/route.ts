import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getCurrentUserId } from '@/lib/auth/current-org'

export async function POST(request: NextRequest) {
  try {
    const { messageIds, action, labelId } = await request.json()

    // Derive the user from the session, never a client-supplied userId (IDOR).
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!messageIds || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Tokens are stored ENCRYPTED. This route used to read gmail_tokens itself
    // and hand the ciphertext straight to Google, which answered invalid_grant
    // — so every delete, archive, star and mark-read 500'd with "Internal
    // server error" while the inbox listing (which goes through this helper)
    // worked fine. getAuthenticatedGmail decrypts at the boundary and handles
    // the expiry refresh, and is the ONE way this codebase talks to Gmail.
    const { gmail } = await getAuthenticatedGmail(userId)

    const ids = Array.isArray(messageIds) ? messageIds : [messageIds]

    switch (action) {
      case 'delete':
        // Move to trash
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: ['TRASH'],
            removeLabelIds: ['INBOX'],
          },
        })
        break

      case 'archive':
        // Remove from inbox
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: ['INBOX'],
          },
        })
        break

      case 'star':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: ['STARRED'],
          },
        })
        break

      case 'unstar':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: ['STARRED'],
          },
        })
        break

      case 'markRead':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: ['UNREAD'],
          },
        })
        break

      case 'markUnread':
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: ['UNREAD'],
          },
        })
        break

      case 'move':
        if (!labelId) {
          return NextResponse.json({ error: 'Label ID required for move action' }, { status: 400 })
        }
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: [labelId],
            removeLabelIds: ['INBOX'],
          },
        })
        break

      case 'addLabel':
        if (!labelId) {
          return NextResponse.json({ error: 'Label ID required' }, { status: 400 })
        }
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: [labelId],
          },
        })
        break

      case 'removeLabel':
        if (!labelId) {
          return NextResponse.json({ error: 'Label ID required' }, { status: 400 })
        }
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            removeLabelIds: [labelId],
          },
        })
        break

      case 'permanentDelete':
        // Permanently delete (use with caution)
        for (const id of ids) {
          await gmail.users.messages.delete({
            userId: 'me',
            id,
          })
        }
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Email action error:', err)
    // A mailbox that needs reconnecting is not a server fault, and telling the
    // operator "Internal server error" sends them looking in the wrong place.
    if (err instanceof GmailAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}