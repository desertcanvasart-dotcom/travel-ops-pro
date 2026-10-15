import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { GmailAuthError } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'
import { getCurrentUserId } from '@/lib/auth/current-org'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { threadIds, action, labelId, fromLabelId, match } = body
    // `match` instead of ids: every email in a folder (and search), across
    // pages — the "Select all N" of the list (resolved below).
    let messageIds = body.messageIds

    // Derive the user from the session, never a client-supplied userId (IDOR).
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const matchSel = parseMatch(match)
    if (match !== undefined && !matchSel) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 })
    }
    if (matchSel && action === 'permanentDelete') {
      return NextResponse.json({ error: 'Delete forever takes chosen emails only' }, { status: 400 })
    }
    if ((!messageIds && !threadIds && !matchSel) || !action) {
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
      // Gmail's "Report spam": into Spam, out of the inbox (Gmail learns from it).
      spam: { add: ['SPAM'], remove: ['INBOX'] },
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

    let capped = false
    if (matchSel) {
      const found = await matchingMessageIds(gmail, matchSel)
      messageIds = found.ids
      capped = found.capped
      if (messageIds.length === 0) return NextResponse.json({ success: true, count: 0 })
    }
    const ids: string[] = Array.isArray(messageIds) ? messageIds : messageIds ? [messageIds] : []

    // Delete is Gmail's own trash call, not a label edit: it is what Gmail's
    // trash button does, and the message leaves the inbox for certain.
    if (action === 'delete') {
      if (threadIds) {
        for (const id of Array.isArray(threadIds) ? threadIds : [threadIds]) {
          await gmail.users.threads.trash({ userId: 'me', id })
        }
      } else {
        await inBatches(ids, id => gmail.users.messages.trash({ userId: 'me', id }))
      }
      return NextResponse.json({ success: true, count: ids.length, capped })
    }

    // Out of Trash, back where it was — Gmail's own untrash.
    if (action === 'restore') {
      if (threadIds) {
        for (const id of Array.isArray(threadIds) ? threadIds : [threadIds]) {
          await gmail.users.threads.untrash({ userId: 'me', id })
        }
      } else {
        await inBatches(ids, id => gmail.users.messages.untrash({ userId: 'me', id }))
      }
      return NextResponse.json({ success: true, count: ids.length, capped })
    }

    if (action === 'permanentDelete') {
      // Permanently delete (use with caution)
      for (const id of ids) {
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
      // Gmail takes up to 1,000 ids per batchModify.
      for (let i = 0; i < ids.length; i += 1000) {
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: ids.slice(i, i + 1000),
            addLabelIds: change.add,
            removeLabelIds: change.remove,
          },
        })
      }
    }

    return NextResponse.json({ success: true, count: ids.length, capped })
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
// ---- "Select all N": every email in a folder (and search) ----

/** At most this many emails per action; the response says when there were more. */
const MATCH_LIMIT = 5000
const LABEL = /^[A-Za-z0-9_-]{1,100}$/

interface MatchSelection { labelIds: string[]; query: string }

function parseMatch(match: unknown): MatchSelection | null {
  if (!match || typeof match !== 'object') return null
  const m = match as { labelIds?: unknown; query?: unknown }
  const labelIds = Array.isArray(m.labelIds) ? m.labelIds.filter((l): l is string => typeof l === 'string' && LABEL.test(l)) : []
  // A folder is required: "all mail" in one click is not a selection anyone means.
  if (labelIds.length === 0) return null
  const query = typeof m.query === 'string' ? m.query.trim().slice(0, 500) : ''
  return { labelIds, query }
}

type ListingGmail = {
  users: { messages: { list: (p: { userId: string; labelIds: string[]; q?: string; maxResults: number; pageToken?: string; includeSpamTrash?: boolean }) => Promise<{ data: { messages?: Array<{ id?: string | null }>; nextPageToken?: string | null } }> } }
}

async function matchingMessageIds(gmail: unknown, sel: MatchSelection): Promise<{ ids: string[]; capped: boolean }> {
  const g = gmail as ListingGmail
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const { data } = await g.users.messages.list({
      userId: 'me', labelIds: sel.labelIds, maxResults: 500, pageToken,
      ...(sel.query ? { q: sel.query } : {}),
      ...(sel.labelIds.some(l => l === 'TRASH' || l === 'SPAM') ? { includeSpamTrash: true } : {}),
    })
    for (const m of data.messages || []) if (m.id) ids.push(m.id)
    pageToken = data.nextPageToken || undefined
  } while (pageToken && ids.length < MATCH_LIMIT)
  return { ids: ids.slice(0, MATCH_LIMIT), capped: !!pageToken || ids.length > MATCH_LIMIT }
}

/** One call per id, ten at a time (Gmail has no batch trash). */
async function inBatches(ids: string[], call: (id: string) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map(call))
  }
}
