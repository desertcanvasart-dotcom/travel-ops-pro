// ============================================
// Threading a reply from what we stored
// ============================================
// A reply keeps its place in the customer's conversation through two things:
// Gmail's threadId (only meaningful inside the mailbox that owns the thread)
// and In-Reply-To / References (meaningful to every mail client). When the
// sending mailbox is not the one that holds the thread — a draft approved by
// a colleague, a shared inbox — only the headers can do it, so they come from
// the Message-ID we stored when the mail was synced
// (email_messages.rfc_message_id). Our own row ids are not Message-IDs and
// must never be sent as one.

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ThreadingHeaders { inReplyTo?: string; references?: string }

// A Message-ID is `<local@domain>`. Anything else (our UUIDs, a header that
// carries CR/LF) is left out rather than sent.
const MESSAGE_ID = /^<[^<>\s]+@[^<>\s]+>$/

export function isMessageId(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_ID.test(value.trim())
}

/** In-Reply-To / References for a reply to the newest stored message that has a Message-ID. */
export function threadingFromMessageIds(ids: unknown[]): ThreadingHeaders {
  const valid = ids.map(v => (typeof v === 'string' ? v.trim() : v)).filter(isMessageId)
  if (valid.length === 0) return {}
  const latest = valid[valid.length - 1]
  return { inReplyTo: latest, references: valid.join(' ') }
}

/** Header lines for the raw message. */
export function threadingLines(t: ThreadingHeaders): string[] {
  return [
    ...(t.inReplyTo ? [`In-Reply-To: ${t.inReplyTo}`] : []),
    ...(t.references ? [`References: ${t.references}`] : []),
  ]
}

/** Threading headers for a reply in a stored email_conversation. Empty when nothing usable was stored. */
export async function storedReplyHeaders(db: Db, conversationId: string | null | undefined): Promise<ThreadingHeaders> {
  if (!conversationId) return {}
  try {
    // Newest first, then reversed: References lists the conversation oldest
    // to newest, and a long conversation keeps only its last few ids.
    const { data } = await db
      .from('email_messages')
      .select('rfc_message_id, sent_at')
      .eq('conversation_id', conversationId)
      .not('rfc_message_id', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(10)
    const ids = ((data ?? []) as Array<{ rfc_message_id: string | null }>).map(r => r.rfc_message_id).reverse()
    return threadingFromMessageIds(ids)
  } catch {
    return {}
  }
}

/** The slice of a Gmail client the lookup below uses. */
type GmailThreads = {
  users: { threads: { get: (params: { userId: string; id: string; format: string; metadataHeaders: string[] }) => Promise<{ data: { messages?: Array<{ payload?: { headers?: Array<{ name?: string | null; value?: string | null }> } }> } }> } }
}

/** In-Reply-To / References for a reply in a Gmail thread: its latest
 *  message's Message-ID. Empty when Gmail cannot say (the reply still threads
 *  in Gmail by threadId). Used by the send route and by saved drafts. */
export async function gmailReplyHeaders(gmail: unknown, threadId: string): Promise<ThreadingHeaders> {
  try {
    const thread = await (gmail as GmailThreads).users.threads.get({ userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['Message-ID', 'References'] })
    const last = thread.data.messages?.[thread.data.messages.length - 1]
    const header = (name: string) => last?.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
    const messageId = header('Message-ID')
    if (!messageId) return {}
    const refs = header('References')
    return { inReplyTo: messageId, references: refs ? `${refs} ${messageId}` : messageId }
  } catch {
    return {}
  }
}
