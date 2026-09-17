// ============================================
// Never the same email reply twice
// ============================================
// Operator, 2026-09-17: "a guard for not sending or replying to the same
// message more than one time". /api/gmail/send sent whatever reached it: a
// double submit, a retried request, a second tab, or two colleagues answering
// the same customer each sent a reply.
//
// Three checks, in the send route, BEFORE Gmail is called:
//
//   1. The same attempt (requestKey): the composer makes one key per reply
//      and resends it on retry. The key is CLAIMED in email_send_claims
//      (primary key) — a second request with it is refused by the database,
//      however close together the two arrive. Its answer is the first
//      attempt's result, not a second email.
//   2. Somebody already answered (seenUpTo): the composer says the time of
//      the newest message it was showing (the message being answered). A reply
//      sent after that — from the app by a colleague, from Gmail directly, or
//      another attempt still sending — is reported with who and when; the
//      sender confirms to send anyway.
//   3. The same text to the same thread within 10 minutes, under a new key
//      (a reply pasted twice): reported the same way.
//
// The route decides; this module holds the rules so they can be tested.

import { createHash } from 'node:crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export const SAME_REPLY_WINDOW_MINUTES = 10

/** A hash of what a reply says, ignoring markup, case and spacing. */
export function replyBodyHash(body: string): string {
  const text = String(body ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return createHash('sha256').update(text).digest('hex')
}

export type SendClaim =
  | { ok: true }
  | { ok: false; status: 'sending' | 'sent' | 'failed'; gmailMessageId: string | null; gmailThreadId: string | null }

/** Claim a send attempt key. A key already claimed returns that attempt. A
 *  failed attempt may be retried with its key. */
export async function claimSend(
  db: Db,
  requestKey: string,
  info: { userId: string; threadId: string | null; bodyHash: string },
): Promise<SendClaim> {
  const row = { request_key: requestKey, user_id: info.userId, thread_id: info.threadId, body_hash: info.bodyHash, status: 'sending' }
  const ins = await db.from('email_send_claims').insert(row)
  if (!ins.error) return { ok: true }
  // The table arrives by migration 20261019: before it, sending still works
  // (unguarded, as it always was) rather than every email failing.
  if (ins.error.code === '42P01' || ins.error.code === 'PGRST205') return { ok: true }
  if (ins.error.code !== '23505') throw ins.error

  const { data: existing } = await db.from('email_send_claims')
    .select('status, gmail_message_id, gmail_thread_id')
    .eq('request_key', requestKey)
    .maybeSingle()
  if (existing?.status === 'failed') {
    // Retrying a failed attempt: take it back, guarded on it still being failed.
    const upd = await db.from('email_send_claims')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('request_key', requestKey).eq('status', 'failed').select('request_key')
    if (!upd.error && (upd.data?.length ?? 0) > 0) return { ok: true }
  }
  return {
    ok: false,
    status: (existing?.status ?? 'sending') as 'sending' | 'sent' | 'failed',
    gmailMessageId: existing?.gmail_message_id ?? null,
    gmailThreadId: existing?.gmail_thread_id ?? null,
  }
}

export async function finishSend(db: Db, requestKey: string, result: { ok: true; gmailMessageId: string | null; gmailThreadId: string | null } | { ok: false }): Promise<void> {
  await db.from('email_send_claims')
    .update(result.ok
      ? { status: 'sent', gmail_message_id: result.gmailMessageId, gmail_thread_id: result.gmailThreadId, updated_at: new Date().toISOString() }
      : { status: 'failed', updated_at: new Date().toISOString() })
    .eq('request_key', requestKey)
}

export type ThreadConflict =
  | { code: 'ALREADY_REPLIED'; repliedAt: string; repliedBy: string | null }
  | { code: 'SAME_REPLY'; sentAt: string }

/**
 * What stands in the way of sending this reply to this thread, if anything.
 * `seenUpTo`: the time of the newest message the sender was looking at —
 * undefined when the caller does not say (then only the same-text check runs),
 * null when it showed none.
 */
export async function threadConflict(
  db: Db,
  args: { threadId: string; requestKey: string | null; seenUpTo: string | null | undefined; bodyHash: string; now?: Date },
): Promise<ThreadConflict | null> {
  const now = args.now ?? new Date()

  if (args.seenUpTo !== undefined) {
    const after = args.seenUpTo ?? '1970-01-01T00:00:00Z'
    const { data: replies } = await db.from('email_messages')
      .select('sent_at, sent_by')
      .eq('thread_id', args.threadId)
      .eq('direction', 'outbound')
      .gt('sent_at', after)
      .order('sent_at', { ascending: false })
      .limit(1)
    let latest = (replies ?? [])[0] as { sent_at: string; sent_by: string | null } | undefined

    // Another attempt on this thread that is still sending (not stored yet).
    if (!latest) {
      const { data: inFlight } = await db.from('email_send_claims')
        .select('created_at, user_id, request_key')
        .eq('thread_id', args.threadId)
        .in('status', ['sending', 'sent'])
        .gt('created_at', after)
        .order('created_at', { ascending: false })
        .limit(5)
      const other = ((inFlight ?? []) as { created_at: string; user_id: string | null; request_key: string }[])
        .find(c => c.request_key !== args.requestKey)
      if (other) latest = { sent_at: other.created_at, sent_by: other.user_id }
    }

    if (latest) {
      let repliedBy: string | null = null
      if (latest.sent_by) {
        const { data: profile } = await db.from('user_profiles').select('full_name, email').eq('id', latest.sent_by).maybeSingle()
        repliedBy = profile?.full_name || profile?.email || null
      }
      return { code: 'ALREADY_REPLIED', repliedAt: latest.sent_at, repliedBy }
    }
  }

  const since = new Date(now.getTime() - SAME_REPLY_WINDOW_MINUTES * 60_000).toISOString()
  const { data: same } = await db.from('email_send_claims')
    .select('created_at, request_key')
    .eq('thread_id', args.threadId)
    .eq('body_hash', args.bodyHash)
    .eq('status', 'sent')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5)
  const earlier = ((same ?? []) as { created_at: string; request_key: string }[]).find(c => c.request_key !== args.requestKey)
  if (earlier) return { code: 'SAME_REPLY', sentAt: earlier.created_at }
  return null
}
