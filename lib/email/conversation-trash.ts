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
// owner of the connected Gmail), not the viewer's.

import { getAuthenticatedGmail } from '@/lib/gmail'

export type GmailTrashResult = { ok: true } | { ok: false; error: string }

export async function moveThreadInGmail(
  mailboxUserId: string | null | undefined,
  threadId: string | null | undefined,
  to: 'trash' | 'untrash'
): Promise<GmailTrashResult> {
  if (!mailboxUserId || !threadId) return { ok: false, error: 'This conversation has no Gmail thread to move.' }
  try {
    const { gmail } = await getAuthenticatedGmail(mailboxUserId)
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
