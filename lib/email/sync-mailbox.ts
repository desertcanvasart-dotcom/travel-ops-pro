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
// Body unchanged from the route except: errors are thrown (the route maps
// them), and each message's RFC Message-ID is stored for threading replies.

import { isOfficeAddress, officeRule, type OfficeRule } from '@/lib/email/office-addresses'
import { loadOfficeRule } from '@/lib/email/office-addresses-server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, getUserEmail } from '@/lib/gmail'
import type { EmailSyncOptions, EmailSyncResult } from '@/types/unified'
import { createCopilotInboxEntry } from '@/lib/copilot-intake'
import { loadKnownContactEmails, looksAutomated } from '@/lib/email-scoping'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

/** Sync `user_id`'s connected mailbox. Records the run in email_sync_state. */
export async function syncMailbox(user_id: string, options: Partial<Omit<EmailSyncOptions, 'user_id'>> = {}): Promise<EmailSyncResult> {
  const { full_sync = false, max_results = 100, days_back = 30 } = options
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

    // Update sync state to running
    await supabase
      .from('email_sync_state')
      .upsert({
        user_id,
        sync_status: 'running',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

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

    // Fetch emails
    let response
    try {
      response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: max_results,
        q: query || undefined
      })
      console.log('[Email Sync] Gmail API response:', JSON.stringify(response.data).substring(0, 500))
    } catch (gmailError: any) {
      console.error('[Email Sync] Gmail API error:', gmailError.message, gmailError.response?.data)
      throw new Error(`Gmail API error: ${gmailError.message}`)
    }

    const messageIds = response.data.messages || []
    console.log('[Email Sync] Found', messageIds.length, 'messages')
    const result: EmailSyncResult = {
      success: true,
      conversations_created: 0,
      conversations_updated: 0,
      messages_created: 0,
      history_id: response.data.resultSizeEstimate?.toString() || null
    }

    // The shared store holds correspondence, not the whole mailbox — see
    // lib/email-scoping.ts. Loaded once per run, not per message.
    const knownContacts = await loadKnownContactEmails(supabase)
    let threadsSkipped = 0

    // Group messages by thread for processing
    const threadMessages: Map<string, any[]> = new Map()

    // Fetch full message details
    for (const msg of messageIds) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full'
        })

        const message = detail.data
        const threadId = message.threadId!

        if (!threadMessages.has(threadId)) {
          threadMessages.set(threadId, [])
        }
        threadMessages.get(threadId)!.push(message)
      } catch (msgError) {
        console.error(`Error fetching message ${msg.id}:`, msgError)
      }
    }

    // Process each thread
    for (const [threadId, messages] of threadMessages) {
      try {
        // Parse first message for thread metadata
        const firstMessage = messages[0]
        const headers = firstMessage.payload?.headers || []
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

        const from = getHeader('From')
        const to = getHeader('To')
        const subject = getHeader('Subject')

        // Determine client email (the external party)
        const direction = getDirection(from, rule)
        const clientEmail = direction === 'inbound'
          ? extractEmailAddress(from)
          : (to.split(',').map(extractEmailAddress).find((addr: string) => addr.includes('@') && !isOfficeAddress(rule, addr)) || extractEmailAddress(to))

        // Get last message for snippet
        const lastMessage = messages.reduce((latest, msg) => {
          const msgDate = new Date(parseInt(msg.internalDate || '0'))
          const latestDate = new Date(parseInt(latest.internalDate || '0'))
          return msgDate > latestDate ? msg : latest
        }, messages[0])

        const lastMessageDate = new Date(parseInt(lastMessage.internalDate || '0')).toISOString()

        // Create or update conversation
        const { data: existingConv } = await supabase
          .from('email_conversations')
          .select('id')
          .eq('thread_id', threadId)
          .single()

        // A NEW thread enters the shared store only if it is correspondence.
        // A thread already in the store keeps syncing regardless — whether it
        // stays visible is the operator's call (is_hidden), and re-judging it
        // here would silently undo that call. A thread the operator has
        // written in is correspondence by definition, whoever the other side
        // is — machine signals on the counterparty do not outweigh a reply.
        if (!existingConv) {
          const operatorWroteHere = messages.some(
            (m: any) => getDirection(
              (m.payload?.headers || []).find((h: any) => h.name?.toLowerCase() === 'from')?.value,
              rule
            ) === 'outbound'
          )
          const everyInboundAutomated = messages.every((m: any) => {
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

        if (existingConv) {
          // Update existing conversation
          const { data: updatedConv } = await supabase
            .from('email_conversations')
            .update({
              subject,
              last_message_snippet: lastMessage.snippet,
              last_message_at: lastMessageDate,
              message_count: messages.length,
              last_sync_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existingConv.id)
            .select()
            .single()

          conversationId = existingConv.id
          result.conversations_updated++
        } else {
          // Create new conversation
          const { data: newConv, error: convError } = await supabase
            .from('email_conversations')
            .insert({
              thread_id: threadId,
              user_id,
              client_email: clientEmail,
              subject,
              last_message_snippet: lastMessage.snippet,
              last_message_at: lastMessageDate,
              message_count: messages.length,
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
        for (const message of messages) {
          const msgHeaders = message.payload?.headers || []
          const getMsgHeader = (name: string) =>
            msgHeaders.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

          const msgFrom = getMsgHeader('From')
          const msgTo = getMsgHeader('To')
          const msgCc = getMsgHeader('Cc')
          const msgSubject = getMsgHeader('Subject')
          const msgDate = new Date(parseInt(message.internalDate || '0')).toISOString()
          const msgDirection = getDirection(msgFrom, rule)

          // Extract body
          let bodyHtml = ''
          let bodyText = ''

          const extractBody = (payload: any) => {
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
          const attachments: any[] = []
          const extractAttachments = (payload: any) => {
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

          // Check if message exists
          const { data: existingMsg } = await supabase
            .from('email_messages')
            .select('id')
            .eq('message_id', message.id)
            .single()

          if (!existingMsg) {
            // Insert message
            await supabase
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

            result.messages_created++

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
        }
      } catch (threadError) {
        console.error(`Error processing thread ${threadId}:`, threadError)
      }
    }

    result.threads_skipped = threadsSkipped
    if (threadsSkipped > 0) {
      console.log('[Email Sync] Skipped', threadsSkipped, 'machine-mail thread(s) — not correspondence')
    }

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
