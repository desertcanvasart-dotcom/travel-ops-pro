import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { GmailAuthError } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'
import { getCurrentUserId } from '@/lib/auth/current-org'

export async function POST(request: NextRequest) {
  try {
    const { messageIds, threadIds, action, labelId, fromLabelId } = await request.json()

    // Derive the user from the session, never a client-supplied userId (IDOR).
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if ((!messageIds && !threadIds) || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // A label id is Gmail's (INBOX, Label_123 …); anything else is refused.
    const LABEL_ID = /^[A-Za-z0-9_-]{1,100}$/
    if (labelId !== undefined && (typeof labelId !== 'string' || !LABEL_ID.test(labelId))) {
      return NextResponse.json({ error: 'Invalid label id' }, { status: 400 })
    }
    if (fromLabelId !== undefined && (typeof fromLabelId !== 'string' || !LABEL_ID.test(fromLabelId))) {
      return NextResponse.json({ error: 'Invalid label id' }, { status: 400 })
    }
    const moveFrom: string = fromLabelId || 'INBOX'
    if (action === 'move' && labelId === moveFrom) {
      return NextResponse.json({ error: 'The email is already in that folder' }, { status: 400 })
    }

    // What each action does to the labels. (permanentDelete is the one action
    // that is not a label change.)
    const LABEL_CHANGES: Record<string, { add?: string[]; remove?: string[] } | undefined> = {
      delete: { add: ['TRASH'], remove: ['INBOX'] }, // move to trash
      archive: { remove: ['INBOX'] },
      star: { add: ['STARRED'] },
      unstar: { remove: ['STARRED'] },
      markRead: { remove: ['UNREAD'] },
      markUnread: { add: ['UNREAD'] },
      // Out of the folder it is in (the inbox unless said), into the one
      // picked. From a folder, moving "to Inbox" is labelId INBOX.
      move: labelId ? { add: [labelId], remove: [moveFrom] } : undefined,
      // Out of Spam, back to the inbox — Gmail's "Not spam".
      notSpam: { add: ['INBOX'], remove: ['SPAM'] },
      addLabel: labelId ? { add: [labelId] } : undefined,
      removeLabel: labelId ? { remove: [labelId] } : undefined,
    }
    if (['move', 'addLabel', 'removeLabel'].includes(action) && !labelId) {
      return NextResponse.json({ error: action === 'move' ? 'Label ID required for move action' : 'Label ID required' }, { status: 400 })
    }
    if (action !== 'permanentDelete' && action !== 'restore' && !(action in LABEL_CHANGES)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    if (action === 'permanentDelete' && threadIds) {
      return NextResponse.json({ error: 'Permanent delete takes message ids only' }, { status: 400 })
    }

    // Tokens are stored ENCRYPTED. This route used to read gmail_tokens itself
    // and hand the ciphertext straight to Google, which answered invalid_grant
    // — so every delete, archive, star and mark-read 500'd with "Internal
    // server error" while the inbox listing (which goes through this helper)
    // worked fine. getAuthenticatedGmail decrypts at the boundary and handles
    // the expiry refresh, and is the ONE way this codebase talks to Gmail.
    // Your own mailbox, else the organisation's shared one (lib/gmail-mailbox).
    const { gmail } = await getMailboxGmail(userId)

    // Delete is Gmail's own trash call, not a label edit: it is what Gmail's
    // trash button does, and the message leaves the inbox for certain.
    if (action === 'delete') {
      if (threadIds) {
        for (const id of Array.isArray(threadIds) ? threadIds : [threadIds]) {
          await gmail.users.threads.trash({ userId: 'me', id })
        }
      } else {
        for (const id of Array.isArray(messageIds) ? messageIds : [messageIds]) {
          await gmail.users.messages.trash({ userId: 'me', id })
        }
      }
      return NextResponse.json({ success: true })
    }

    // Out of Trash, back where it was — Gmail's own untrash.
    if (action === 'restore') {
      if (threadIds) {
        for (const id of Array.isArray(threadIds) ? threadIds : [threadIds]) {
          await gmail.users.threads.untrash({ userId: 'me', id })
        }
      } else {
        for (const id of Array.isArray(messageIds) ? messageIds : [messageIds]) {
          await gmail.users.messages.untrash({ userId: 'me', id })
        }
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'permanentDelete') {
      // Permanently delete (use with caution)
      for (const id of Array.isArray(messageIds) ? messageIds : [messageIds]) {
        await gmail.users.messages.delete({ userId: 'me', id })
      }
      return NextResponse.json({ success: true })
    }

    const change = LABEL_CHANGES[action]!
    if (threadIds) {
      // A conversation in the inbox IS a Gmail thread. Its id used to be sent
      // as a MESSAGE id — Gmail's first message shares the thread's id — so
      // archive / mark read / mark unread touched only the first message and
      // every reply stayed unread in the inbox.
      for (const id of Array.isArray(threadIds) ? threadIds : [threadIds]) {
        await gmail.users.threads.modify({
          userId: 'me',
          id,
          requestBody: { addLabelIds: change.add, removeLabelIds: change.remove },
        })
      }
    } else {
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: Array.isArray(messageIds) ? messageIds : [messageIds],
          addLabelIds: change.add,
          removeLabelIds: change.remove,
        },
      })
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