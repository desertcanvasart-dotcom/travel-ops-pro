// ============================================
// A Communicate email conversation into / out of Gmail's Trash
// ============================================
// Deleting a conversation in Communicate puts it in Communicate's Trash
// (email_conversations.is_hidden) AND moves its thread to Gmail's Trash in
// the mailbox it came from — so the Inbox and Communicate agree, and Restore
// brings it back in both (operator, 2026-10-11). Gmail keeps trash for 30
// days; the copy in Communicate stays until restored.
//
// The mailbox is the conversation's own (email_conversations.user_id, the
// owner of the connected Gmail), not the viewer's — and only while that
// connection serves the conversation's company (gmail_tokens.org_id,
// 20261204): a person who reconnected their mailbox to the other company
// must not have this company's delete reach into it.

import { getAuthenticatedGmail } from '@/lib/gmail'

export type GmailTrashResult = { ok: true } | { ok: false; error: string }

export async function moveThreadInGmail(
  mailboxUserId: string | null | undefined,
  threadId: string | null | undefined,
  to: 'trash' | 'untrash',
  orgId: string,
): Promise<GmailTrashResult> {
  if (!mailboxUserId || !threadId) return { ok: false, error: 'This conversation has no Gmail thread to move.' }
  try {
    const { gmail, orgId: mailboxOrg } = await getAuthenticatedGmail(mailboxUserId)
    if (mailboxOrg !== orgId) return { ok: false, error: 'The mailbox this conversation came from is connected to another company.' }
    if (to === 'trash') await gmail.users.threads.trash({ userId: 'me', id: threadId })
    else await gmail.users.threads.untrash({ userId: 'me', id: threadId })
    return { ok: true }
  } catch (err) {
    const status = (err as { code?: unknown; response?: { status?: unknown } })?.response?.status ?? (err as { code?: unknown })?.code
    // Already gone from Gmail (deleted forever there): nothing left to move.
    if (status === 404) return { ok: true }
    console.error(`[email trash] Gmail ${to} failed for thread ${threadId}:`, err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Archive and read state, the same way ─────────────────────────────────────
// Archive and mark read / unread in Communicate change the stored
// conversation (status, unread_count — what the list shows) and the thread's
// labels in the conversation's own mailbox. They used to change only the
// labels, and in the VIEWER's mailbox: the stored conversation stayed active
// and unread, so an archived conversation was back on the next refresh.

export type ThreadLabelAction = 'archive' | 'unarchive' | 'markRead' | 'markUnread'

const THREAD_LABELS: Record<ThreadLabelAction, { addLabelIds?: string[]; removeLabelIds?: string[] }> = {
  archive: { removeLabelIds: ['INBOX'] },
  unarchive: { addLabelIds: ['INBOX'] },
  markRead: { removeLabelIds: ['UNREAD'] },
  markUnread: { addLabelIds: ['UNREAD'] },
}

export async function labelThreadInGmail(
  mailboxUserId: string | null | undefined,
  threadId: string | null | undefined,
  action: ThreadLabelAction,
  orgId: string,
): Promise<GmailTrashResult> {
  if (!mailboxUserId || !threadId) return { ok: false, error: 'This conversation has no Gmail thread.' }
  try {
    const { gmail, orgId: mailboxOrg } = await getAuthenticatedGmail(mailboxUserId)
    if (mailboxOrg !== orgId) return { ok: false, error: 'The mailbox this conversation came from is connected to another company.' }
    await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: { ...THREAD_LABELS[action] } })
    return { ok: true }
  } catch (err) {
    const status = (err as { code?: unknown; response?: { status?: unknown } })?.response?.status ?? (err as { code?: unknown })?.code
    if (status === 404) return { ok: true }
    console.error(`[email labels] Gmail ${action} failed for thread ${threadId}:`, err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
