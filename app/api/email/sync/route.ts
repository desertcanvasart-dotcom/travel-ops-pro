import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError, getUserEmail } from '@/lib/gmail'
import type { EmailSyncOptions, EmailSyncResult } from '@/types/unified'
import { createCopilotInboxEntry } from '@/lib/copilot-intake'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { loadKnownContactEmails, looksAutomated } from '@/lib/email-scoping'

// Use service role for API routes to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to extract email address from "Name <email>" format
function extractEmailAddress(fromString: string | undefined | null): string {
  if (!fromString) return ''
  const match = fromString.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : fromString.toLowerCase()
}

// Helper to determine direction based on user's email
function getDirection(from: string | undefined | null, userEmail: string): 'inbound' | 'outbound' {
  if (!from || !userEmail) return 'inbound' // Default to inbound if we can't determine
  const fromEmail = extractEmailAddress(from)
  return fromEmail === userEmail.toLowerCase() ? 'outbound' : 'inbound'
}

// GET /api/email/sync - Get sync status for the SIGNED-IN user.
//
// `user_id` used to come from the query string and was never checked against
// the session, so any authenticated account could read anyone's mailbox sync
// state. GET is not a mutating method, so the middleware role gate never
// applied either — a viewer could ask about anybody.
export async function GET() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in', success: false }, { status: 401 })
    }

    const { data: syncState, error } = await supabase
      .from('email_sync_state')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json({
      sync_state: syncState || {
        user_id: userId,
        sync_status: 'idle',
        last_history_id: null,
        last_full_sync_at: null,
        emails_synced: 0
      },
      success: true
    })
  } catch (error: any) {
    console.error('Error fetching sync state:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}

// POST /api/email/sync - Trigger email sync
export async function POST(request: NextRequest) {
  let userId: string | undefined

  try {
    // WHOSE mailbox this syncs comes from the SESSION, never from the body.
    //
    // `user_id` used to be taken straight off the request. Two lines later it
    // reaches getAuthenticatedGmail(user_id), which loads THAT user's stored
    // OAuth token — so any authenticated account could name a colleague and
    // pull their Gmail into the shared inbox. Not a permissions bug at the edge
    // of the app: it hands over somebody else's mail.
    //
    // Same failure as the avatar route (#171), same fix. See
    // lib/auth/current-org.ts, which exists precisely for this.
    const sessionUserId = await getCurrentUserId()
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not signed in', success: false }, { status: 401 })
    }

    const body: EmailSyncOptions = await request.json()
    const { full_sync = false, max_results = 100, days_back = 30 } = body
    const user_id = sessionUserId
    userId = user_id // Store for error handler

    console.log('[Email Sync] Starting sync for user:', user_id)

    // Get authenticated Gmail client (handles token fetch + refresh)
    let gmail, userEmail: string
    try {
      const auth = await getAuthenticatedGmail(user_id)
      gmail = auth.gmail
      userEmail = auth.emailAddress

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
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return NextResponse.json({ error: clientMessage(err, 'Internal server error'), success: false }, { status: 401 })
      }
      throw err
    }

    if (!userEmail) {
      return NextResponse.json({
        error: 'Gmail email address not found. Please reconnect your Gmail account.',
        success: false
      }, { status: 400 })
    }

    console.log('[Email Sync] Using email:', userEmail)

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
        const direction = getDirection(from, userEmail)
        const clientEmail = direction === 'inbound'
          ? extractEmailAddress(from)
          : extractEmailAddress(to)

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
              userEmail
            ) === 'outbound'
          )
          const everyInboundAutomated = messages.every((m: any) => {
            const hdrs: Record<string, string> = {}
            for (const h of m.payload?.headers || []) {
              if (h.name && typeof h.value === 'string') hdrs[h.name] = h.value
            }
            const fromValue = hdrs['From'] ?? hdrs['from'] ?? ''
            if (getDirection(fromValue, userEmail) === 'outbound') return true // judge inbound only
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
          const msgDirection = getDirection(msgFrom, userEmail)

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
                sent_at: msgDate
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
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Email Sync] Error syncing emails:', error.message, error.stack)

    // Update sync state with error (use captured userId, not request.json())
    if (userId) {
      await supabase
        .from('email_sync_state')
        .upsert({
          user_id: userId,
          sync_status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
    }

    return NextResponse.json({
      error: clientMessage(error, 'Internal server error'),
      success: false
    }, { status: 500 })
  }
}
