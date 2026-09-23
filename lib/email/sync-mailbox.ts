// ============================================
// Sync one connected Gmail mailbox into the shared inbox
// ============================================
// Moved out of POST /api/email/sync (2026-09-17) so the same sync runs on a
// schedule (app/api/cron/gmail-sync): until then it ran only when someone
// pressed Sync in the inbox, and the office's mail was last synced on
// 2026-09-03. Whether a customer is still waiting for an answer
// (email_conversations.awaiting_reply_since, migration 20261019) is only as
// fresh as the last sync — including a reply sent from Gmail directly.
//
// WHAT A RUN FETCHES (2026-09-23). The scheduled run used to list the last 50
// messages, download every one of them in full — one at a time — check each
// against the store one query at a time, and rewrite every conversation it saw
// (each write firing the auto_link_email_to_client trigger). Every 10 minutes,
// for mail it already had: ~7,000 redundant downloads a day. It also stored
// Gmail's resultSizeEstimate (a message COUNT) as the history id, so the
// incremental path Gmail offers could never be used. Now:
//
//   1. WHICH messages: with a stored history id (and `use_history`), only what
//      Gmail's history says was added since the last run (users.history.list).
//      Without one — first run, manual Sync, or Gmail answering 404 because
//      the id is too old — the date-window listing as before.
//   2. ONE query for which of those are already stored; only the rest are
//      downloaded, five at a time.
//   3. A conversation is written only when a message was actually added to it.
//   4. The id stored for next time is Gmail's real historyId.
//
// The awaiting-reply state needs nothing from here beyond storing each new
// message: the email_messages insert trigger recomputes it (20261019).

import { isOfficeAddress, officeRule, type OfficeRule } from '@/lib/email/office-addresses'
import { loadOfficeRule } from '@/lib/email/office-addresses-server'
import { createClient } from '@supabase/supabase-js'
import type { gmail_v1 } from 'googleapis'
import { getAuthenticatedGmail, getUserEmail } from '@/lib/gmail'
import type { EmailSyncOptions, EmailSyncResult } from '@/types/unified'
import { createCopilotInboxEntry } from '@/lib/copilot-intake'
import { loadKnownContactEmails, looksAutomated } from '@/lib/email-scoping'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type GmailMessage = gmail_v1.Schema$Message

/** Gmail downloads in flight at once. One at a time made a 50-message run
 *  50 sequential round trips; unbounded would trip Gmail's per-user rate limit. */
export const FETCH_CONCURRENCY = 5
/** History records per page, and pages per run. A backlog larger than this
 *  (a long outage) is worked through over several runs, never lost: the id
 *  stored is the last record READ, not the mailbox's current one. */
const HISTORY_PAGE_SIZE = 100
const MAX_HISTORY_PAGES = 5
/** Ids per `.in()` query — they travel in the URL (lib/text-handoff: a long
 *  query string is an HTTP 431 the app never sees). */
const IN_CHUNK = 100

// Not correspondence, whatever else they are. A draft in particular must never
// be stored: it would be an "outbound" message and mark the customer answered
// before anything was sent — and Gmail makes a new draft message on every
// autosave, which the history feed reports one by one.
const NOT_MAIL_LABELS = ['DRAFT', 'SPAM', 'TRASH']
const isMail = (labelIds: string[] | null | undefined) =>
  !(labelIds ?? []).some(l => NOT_MAIL_LABELS.includes(l))

export class MailboxNotFoundError extends Error {}

// Helper to extract email address from "Name <email>" format
export function extractEmailAddress(fromString: string | undefined | null): string {
  if (!fromString) return ''
  const match = fromString.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : fromString.toLowerCase()
}

// Ours when the sender is the office — the connected mailbox, its domain, or
// an address listed in Settings (lib/email/office-addresses). It was the
// connected address only, so a reply from a colleague's office address read
// as the customer writing.
function getDirection(from: string | undefined | null, rule: OfficeRule): 'inbound' | 'outbound' {
  if (!from) return 'inbound' // Default to inbound if we can't determine
  return isOfficeAddress(rule, from) ? 'outbound' : 'inbound'
}

/** Gmail's "no such thing": a history id too old to replay, or a message
 *  deleted between being listed and being fetched. googleapis puts the status
 *  on `code`; gaxios on `status` / `response.status`. */
function gmailStatus(err: unknown): number | undefined {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null
  const s = e?.code ?? e?.status ?? e?.response?.status
  return typeof s === 'number' ? s : typeof s === 'string' && /^\d+$/.test(s) ? Number(s) : undefined
}

/** `fn` over `items`, at most `limit` at a time; results in input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const chunks = <T>(xs: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/** Which of these Gmail message ids are already in the store — one query per
 *  hundred ids, instead of one per message. Throws on a read error: guessing
 *  "not stored" would insert duplicates (message_id is indexed, not unique). */
async function storedMessageIds(ids: readonly string[]): Promise<Set<string>> {
  const stored = new Set<string>()
  for (const chunk of chunks([...new Set(ids)], IN_CHUNK)) {
    const { data, error } = await supabase.from('email_messages').select('message_id').in('message_id', chunk)
    if (error) throw new Error(`Could not check stored messages: ${error.message}`)
    for (const r of (data ?? []) as { message_id: string }[]) stored.add(r.message_id)
  }
  return stored
}

type Candidate = { id: string; threadId: string }

/**
 * What changed since `startHistoryId`: messages added to the mailbox, plus
 * messages that gained SENT or INBOX (a draft sent from Gmail can keep its
 * id; mail moved out of spam). Null when Gmail cannot replay from that id —
 * 404 (older than Gmail keeps, about a week) or 400 (not a history id at all:
 * the resultSizeEstimate the old code stored) — and the caller lists instead.
 */
async function changesSince(gmail: gmail_v1.Gmail, startHistoryId: string): Promise<{ candidates: Candidate[]; historyId: string } | null> {
  const found = new Map<string, Candidate>()
  let pageToken: string | undefined
  let pages = 0
  let lastRecordId: string | null = null
  let mailboxHistoryId: string | null = null
  do {
    let res
    try {
      res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'labelAdded'],
        maxResults: HISTORY_PAGE_SIZE,
        pageToken,
      })
    } catch (err) {
      const status = gmailStatus(err)
      if (status === 404 || status === 400) {
        console.log(`[Email Sync] history id ${startHistoryId} not usable (HTTP ${status}) — listing instead`)
        return null
      }
      throw err
    }
    for (const h of res.data.history ?? []) {
      for (const { message: m } of h.messagesAdded ?? []) {
        if (m?.id && m.threadId && isMail(m.labelIds)) found.set(m.id, { id: m.id, threadId: m.threadId })
      }
      for (const { message: m, labelIds: added } of h.labelsAdded ?? []) {
        if (m?.id && m.threadId && isMail(m.labelIds) && (added ?? []).some(l => l === 'SENT' || l === 'INBOX')) {
          found.set(m.id, { id: m.id, threadId: m.threadId })
        }
      }
      if (h.id) lastRecordId = h.id
    }
    mailboxHistoryId = res.data.historyId ?? mailboxHistoryId
    pageToken = res.data.nextPageToken ?? undefined
    pages++
  } while (pageToken && pages < MAX_HISTORY_PAGES)

  // Pages left over: resume after the last record read next run. Otherwise
  // the mailbox's current id — nothing between the two is lost either way.
  const historyId = pageToken
    ? (lastRecordId ?? startHistoryId)
    : (mailboxHistoryId ?? lastRecordId ?? startHistoryId)
  return { candidates: [...found.values()], historyId }
}

/** Sync `user_id`'s connected mailbox. Records the run in email_sync_state. */
export async function syncMailbox(user_id: string, options: Partial<Omit<EmailSyncOptions, 'user_id'>> = {}): Promise<EmailSyncResult> {
  const { full_sync = false, max_results = 100, days_back = 30, use_history = false } = options
  console.log('[Email Sync] Starting sync for user:', user_id)
  try {
    // Get authenticated Gmail client (handles token fetch + refresh)
    const auth = await getAuthenticatedGmail(user_id)
    const gmail = auth.gmail
    let userEmail: string = auth.emailAddress

    // If email_address wasn't stored yet, fetch it
    if (!userEmail) {
      console.log('[Email Sync] User email not stored, fetching from Gmail...')
      userEmail = (await getUserEmail(auth.accessToken)) || ''
      if (userEmail) {
        await supabase
          .from('gmail_tokens')
          .update({ email: userEmail, updated_at: new Date().toISOString() })
          .eq('user_id', user_id)
      }
    }

    if (!userEmail) {
      throw new MailboxNotFoundError('Gmail email address not found. Please reconnect your Gmail account.')
    }

    console.log('[Email Sync] Using email:', userEmail)
    const loaded = await loadOfficeRule(supabase)
    const rule = officeRule([userEmail], [...loaded.addresses, ...loaded.domains])

    // Where the last run got to. A read failure only costs the incremental
    // path this run — the listing below still syncs.
    const { data: syncState } = await supabase
      .from('email_sync_state')
      .select('last_history_id')
      .eq('user_id', user_id)
      .maybeSingle()
    const storedHistoryId: string | null =
      typeof syncState?.last_history_id === 'string' && /^\d+$/.test(syncState.last_history_id)
        ? syncState.last_history_id
        : null

    // Update sync state to running
    await supabase
      .from('email_sync_state')
      .upsert({
        user_id,
        sync_status: 'running',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    // ── 1. Which messages to look at ──────────────────────────────────────
    let candidates: Candidate[] = []
    let nextHistoryId: string | null = null
    let mode: 'history' | 'list' = 'list'
    // A stored id Gmail refused is worthless — never keep it for next time.
    let storedIdRefused = false

    if (use_history && !full_sync && storedHistoryId) {
      const changes = await changesSince(gmail, storedHistoryId)
      if (changes) {
        mode = 'history'
        candidates = changes.candidates
        nextHistoryId = changes.historyId
      } else {
        storedIdRefused = true
      }
    }

    if (mode === 'list') {
      // The mailbox's history id BEFORE listing: mail arriving after this
      // point is in the history the next run replays, so nothing falls in
      // between (anything seen twice is caught by the stored-id check). Fail
      // open — without it the next run lists again, as every run used to.
      try {
        const profile = await gmail.users.getProfile({ userId: 'me' })
        nextHistoryId = profile.data.historyId ?? null
      } catch (profileError) {
        console.error('[Email Sync] Could not read the mailbox history id:', profileError)
      }

      // Build query for Gmail API - use simpler query that matches working email inbox
      // Format date as YYYY/MM/DD for Gmail search
      let query = ''
      if (!full_sync) {
        const daysAgo = new Date()
        daysAgo.setDate(daysAgo.getDate() - days_back)
        const year = daysAgo.getFullYear()
        const month = String(daysAgo.getMonth() + 1).padStart(2, '0')
        const day = String(daysAgo.getDate()).padStart(2, '0')
        query = `after:${year}/${month}/${day}`
      }

      console.log('[Email Sync] Fetching messages with query:', query || '(all)')

      let response
      try {
        response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: max_results,
          q: query || undefined
        })
      } catch (gmailError) {
        const e = gmailError as { message?: string; response?: { data?: unknown } }
        console.error('[Email Sync] Gmail API error:', e.message, e.response?.data)
        throw new Error(`Gmail API error: ${e.message}`)
      }
      candidates = (response.data.messages || [])
        .filter((m): m is Candidate => !!m.id && !!m.threadId)
        .map(m => ({ id: m.id, threadId: m.threadId }))
    }

    // ── 2. Only what is not stored yet ────────────────────────────────────
    const stored = await storedMessageIds(candidates.map(c => c.id))
    const missing = candidates.filter(c => !stored.has(c.id))
    console.log(`[Email Sync] ${mode}: ${candidates.length} candidate(s), ${stored.size} already stored, ${missing.length} to fetch`)

    const result: EmailSyncResult = {
      success: true,
      conversations_created: 0,
      conversations_updated: 0,
      messages_created: 0,
      history_id: null,
      sync_mode: mode,
      messages_already_stored: stored.size,
      messages_fetched: 0,
    }
    // Anything that went wrong this run. The history id only moves forward
    // on a clean run, so what failed is replayed next time rather than
    // skipped for good (the stored-id check keeps the replay cheap).
    let failures = 0

    const missingByThread = new Map<string, string[]>()
    for (const c of missing) {
      const ids = missingByThread.get(c.threadId) ?? []
      ids.push(c.id)
      missingByThread.set(c.threadId, ids)
    }

    // Conversations for those threads, in one query.
    const existingByThread = new Map<string, string>()
    for (const chunk of chunks([...missingByThread.keys()], IN_CHUNK)) {
      const { data, error } = await supabase.from('email_conversations').select('id, thread_id').in('thread_id', chunk)
      if (error) throw new Error(`Could not read conversations: ${error.message}`)
      for (const r of (data ?? []) as { id: string; thread_id: string }[]) {
        if (!existingByThread.has(r.thread_id)) existingByThread.set(r.thread_id, r.id)
      }
    }

    // ── 3. Download, five at a time ───────────────────────────────────────
    // A thread already in the store: just its new messages. A thread the
    // store has never seen: the whole thread in one call — whether it is
    // correspondence is judged on all of it (an operator reply anywhere in it
    // makes it so), and its earlier messages belong in the conversation too.
    // The history feed names only the newest message, so without this a reply
    // in a thread first skipped as machine mail would arrive alone.
    type Job = { kind: 'message' | 'thread'; id: string; threadId: string }
    const jobs: Job[] = []
    for (const [threadId, ids] of missingByThread) {
      if (existingByThread.has(threadId)) for (const id of ids) jobs.push({ kind: 'message', id, threadId })
      else jobs.push({ kind: 'thread', id: threadId, threadId })
    }

    const fetched = await mapWithConcurrency(jobs, FETCH_CONCURRENCY, async (job): Promise<GmailMessage[]> => {
      try {
        if (job.kind === 'message') {
          const detail = await gmail.users.messages.get({ userId: 'me', id: job.id, format: 'full' })
          return [detail.data]
        }
        const thread = await gmail.users.threads.get({ userId: 'me', id: job.id, format: 'full' })
        return thread.data.messages ?? []
      } catch (fetchError) {
        // Deleted since it was listed — nothing to store, nothing to retry.
        if (gmailStatus(fetchError) === 404) return []
        failures++
        console.error(`Error fetching ${job.kind} ${job.id}:`, fetchError)
        return []
      }
    })

    // A whole thread can bring messages the stored-id check never saw.
    const threadExtras = jobs
      .flatMap((job, i) => job.kind === 'thread' ? fetched[i] : [])
      .map(m => m.id!)
      .filter(id => id && !stored.has(id))
    const storedExtras = threadExtras.length ? await storedMessageIds(threadExtras) : new Set<string>()

    // Group messages by thread for processing
    const threadMessages: Map<string, GmailMessage[]> = new Map()
    jobs.forEach((job, i) => {
      for (const message of fetched[i]) {
        if (!message.id || stored.has(message.id) || storedExtras.has(message.id)) continue
        if (!isMail(message.labelIds)) continue
        const list = threadMessages.get(job.threadId) ?? []
        if (!list.some(m => m.id === message.id)) list.push(message)
        threadMessages.set(job.threadId, list)
      }
    })
    result.messages_fetched = [...threadMessages.values()].reduce((n, l) => n + l.length, 0)

    // The shared store holds correspondence, not the whole mailbox — see
    // lib/email-scoping.ts. Loaded once per run, not per message — and not
    // at all when nothing new arrived.
    const knownContacts = threadMessages.size ? await loadKnownContactEmails(supabase) : new Set<string>()
    let threadsSkipped = 0

    // Process each thread
    for (const [threadId, unsorted] of threadMessages) {
      try {
        // Oldest first: the thread's first message says who the customer is.
        const messages = [...unsorted].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0))
        const firstMessage = messages[0]
        const headers = firstMessage.payload?.headers || []
        const getHeader = (name: string) =>
          headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

        const from = getHeader('From')
        const to = getHeader('To')
        const subject = getHeader('Subject')

        // Determine client email (the external party)
        const direction = getDirection(from, rule)
        const clientEmail = direction === 'inbound'
          ? extractEmailAddress(from)
          : (to.split(',').map(extractEmailAddress).find((addr: string) => addr.includes('@') && !isOfficeAddress(rule, addr)) || extractEmailAddress(to))

        // Get last message for snippet
        const lastMessage = messages[messages.length - 1]
        const lastMessageDate = new Date(parseInt(lastMessage.internalDate || '0')).toISOString()

        const existingConvId = existingByThread.get(threadId) ?? null

        // A NEW thread enters the shared store only if it is correspondence.
        // A thread already in the store keeps syncing regardless — whether it
        // stays visible is the operator's call (is_hidden), and re-judging it
        // here would silently undo that call. A thread the operator has
        // written in is correspondence by definition, whoever the other side
        // is — machine signals on the counterparty do not outweigh a reply.
        if (!existingConvId) {
          const operatorWroteHere = messages.some(
            m => getDirection(
              (m.payload?.headers || []).find(h => h.name?.toLowerCase() === 'from')?.value,
              rule
            ) === 'outbound'
          )
          const everyInboundAutomated = messages.every(m => {
            const hdrs: Record<string, string> = {}
            for (const h of m.payload?.headers || []) {
              if (h.name && typeof h.value === 'string') hdrs[h.name] = h.value
            }
            const fromValue = hdrs['From'] ?? hdrs['from'] ?? ''
            if (getDirection(fromValue, rule) === 'outbound') return true // judge inbound only
            return looksAutomated({
              counterpartyEmail: extractEmailAddress(fromValue),
              headers: hdrs,
              labelIds: m.labelIds || [],
              subject: hdrs['Subject'] ?? hdrs['subject'] ?? '',
              snippet: m.snippet ?? '',
            })
          })
          // Known contact and operator-participation each override the
          // machine signals — booking systems legitimately write from
          // no-reply@, and a thread you replied in is correspondence.
          const store =
            knownContacts.has(clientEmail) || operatorWroteHere || !everyInboundAutomated
          if (!store) {
            threadsSkipped++
            continue
          }
        }

        let conversationId: string

        if (existingConvId) {
          conversationId = existingConvId
        } else {
          // Create new conversation. message_count starts at 0: the message
          // insert trigger counts each message as it is stored (20261019) —
          // starting from messages.length counted every message twice.
          const { data: newConv, error: convError } = await supabase
            .from('email_conversations')
            .insert({
              thread_id: threadId,
              user_id,
              client_email: clientEmail,
              subject,
              last_message_snippet: lastMessage.snippet,
              last_message_at: lastMessageDate,
              message_count: 0,
              status: 'active',
              is_hidden: false,
              last_sync_at: new Date().toISOString()
            })
            .select()
            .single()

          if (convError) throw convError
          conversationId = newConv.id
          result.conversations_created++
        }

        // Store messages
        let insertedHere = 0
        for (const message of messages) {
          const msgHeaders = message.payload?.headers || []
          const getMsgHeader = (name: string) =>
            msgHeaders.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

          const msgFrom = getMsgHeader('From')
          const msgTo = getMsgHeader('To')
          const msgCc = getMsgHeader('Cc')
          const msgSubject = getMsgHeader('Subject')
          const msgDate = new Date(parseInt(message.internalDate || '0')).toISOString()
          const msgDirection = getDirection(msgFrom, rule)

          // Extract body
          let bodyHtml = ''
          let bodyText = ''

          const extractBody = (payload: gmail_v1.Schema$MessagePart) => {
            if (payload.body?.data) {
              const content = Buffer.from(payload.body.data, 'base64').toString('utf-8')
              if (payload.mimeType === 'text/html') {
                bodyHtml = content
              } else if (payload.mimeType === 'text/plain') {
                bodyText = content
              }
            }
            if (payload.parts) {
              for (const part of payload.parts) {
                extractBody(part)
              }
            }
          }

          if (message.payload) {
            extractBody(message.payload)
          }

          // Extract attachments
          const attachments: Array<{ id: string; filename: string; mimeType: string; size: number }> = []
          const extractAttachments = (payload: gmail_v1.Schema$MessagePart) => {
            if (payload.filename && payload.body?.attachmentId) {
              attachments.push({
                id: payload.body.attachmentId,
                filename: payload.filename,
                mimeType: payload.mimeType || 'application/octet-stream',
                size: payload.body.size || 0
              })
            }
            if (payload.parts) {
              for (const part of payload.parts) {
                extractAttachments(part)
              }
            }
          }

          if (message.payload) {
            extractAttachments(message.payload)
          }

          // Already-stored messages were filtered out before downloading.
          const { error: insertError } = await supabase
            .from('email_messages')
            .insert({
              conversation_id: conversationId,
              message_id: message.id,
              thread_id: threadId,
              direction: msgDirection,
              from_address: msgFrom,
              to_addresses: msgTo ? msgTo.split(',').map((e: string) => e.trim()) : [],
              cc_addresses: msgCc ? msgCc.split(',').map((e: string) => e.trim()) : null,
              subject: msgSubject,
              body_text: bodyText || null,
              body_html: bodyHtml || null,
              snippet: message.snippet,
              attachments,
              is_read: !message.labelIds?.includes('UNREAD'),
              is_starred: message.labelIds?.includes('STARRED') || false,
              labels: message.labelIds,
              sent_at: msgDate,
              // For In-Reply-To / References when we answer it (20261019).
              rfc_message_id: getMsgHeader('Message-ID') || getMsgHeader('Message-Id') || null,
            })
          if (insertError) {
            // Was silently ignored. Now it holds the history id back, so the
            // message is tried again next run instead of vanishing.
            failures++
            console.error(`[Email Sync] Could not store message ${message.id}:`, insertError.message)
            continue
          }

          result.messages_created++
          insertedHere++

          // Create copilot inbox entry for inbound emails
          if (msgDirection === 'inbound' && message.id) {
            try {
              // Try to find client by email
              const senderEmail = extractEmailAddress(msgFrom)
              const { data: matchedClient } = await supabase
                .from('clients')
                .select('id, first_name, last_name')
                .eq('email', senderEmail)
                .single()

              const senderDisplayName = msgFrom.match(/^([^<]+)<?/)
                ? msgFrom.match(/^([^<]+)<?/)![1].trim()
                : senderEmail

              await createCopilotInboxEntry(
                {
                  channel: 'email',
                  emailConversationId: conversationId,
                  sourceMessageId: message.id,
                  senderName: matchedClient
                    ? `${matchedClient.first_name || ''} ${matchedClient.last_name || ''}`.trim()
                    : senderDisplayName,
                  senderContact: senderEmail,
                  messageBody: bodyText || message.snippet || '',
                  subject: msgSubject || null,
                  receivedAt: msgDate,
                  clientId: matchedClient?.id || null,
                  clientName: matchedClient
                    ? `${matchedClient.first_name || ''} ${matchedClient.last_name || ''}`.trim()
                    : null,
                },
                supabase
              )
            } catch (copilotError) {
              // Copilot failures must never break email sync
              console.error('[Email Sync] Copilot intake failed (non-blocking):', copilotError)
            }
          }
        }

        // An existing conversation is written only when a message was added
        // to it — and then only last_sync_at: the insert trigger has already
        // moved last_message_at / snippet / counts / reply state forward.
        // (It was rewritten every run — subject, snippet, and message_count
        // reset to however many messages this run happened to list — firing
        // auto_link_email_to_client each time for nothing.)
        if (existingConvId && insertedHere > 0) {
          await supabase
            .from('email_conversations')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('id', existingConvId)
          result.conversations_updated++
        }
      } catch (threadError) {
        failures++
        console.error(`Error processing thread ${threadId}:`, threadError)
      }
    }

    result.threads_skipped = threadsSkipped
    if (threadsSkipped > 0) {
      console.log('[Email Sync] Skipped', threadsSkipped, 'machine-mail thread(s) — not correspondence')
    }

    // ── 4. Where the next run starts ──────────────────────────────────────
    // Forward only after a clean run. After a failure keep the id this run
    // started from, so the history is replayed; an id Gmail refused is
    // dropped, so the next run lists instead.
    const keep = storedIdRefused ? null : storedHistoryId
    result.history_id = failures > 0 ? keep : (nextHistoryId ?? keep)
    if (failures > 0) console.log(`[Email Sync] ${failures} failure(s) — history id not advanced`)

    // Update sync state
    await supabase
      .from('email_sync_state')
      .upsert({
        user_id,
        sync_status: 'idle',
        last_history_id: result.history_id,
        last_full_sync_at: full_sync ? new Date().toISOString() : undefined,
        last_incremental_sync_at: new Date().toISOString(),
        emails_synced: result.messages_created,
        error_message: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    console.log('[Email Sync] Sync complete:', result)
    return result
  } catch (error) {
    await supabase
      .from('email_sync_state')
      .upsert({
        user_id,
        sync_status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
    throw error
  }
}
