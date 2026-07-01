import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getCurrentUserId } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/gmail/poll?userId=xxx&historyId=xxx
// Poll for new emails since last history ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Derive the user from the session, never a client-supplied userId (IDOR).
    const userId = await getCurrentUserId()
    const historyId = searchParams.get('historyId')

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get authenticated Gmail client (handles token fetch + refresh)
    let auth
    try {
      auth = await getAuthenticatedGmail(userId)
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 401 })
      }
      throw err
    }

    const { gmail, emailAddress } = auth
    const userEmail = emailAddress?.toLowerCase()

    // If no historyId, get the current one
    if (!historyId) {
      const profile = await gmail.users.getProfile({ userId: 'me' })
      return NextResponse.json({
        historyId: profile.data.historyId,
        hasChanges: false,
        newMessages: [],
        deletedMessages: [],
        labelChanges: [],
      })
    }

    // Get history since last check
    try {
      const history = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      })

      if (!history.data.history) {
        return NextResponse.json({
          historyId: history.data.historyId || historyId,
          hasChanges: false,
          newMessages: [],
          deletedMessages: [],
          labelChanges: [],
        })
      }

      const newMessageIds: string[] = []
      const deletedMessageIds: string[] = []
      const labelChanges: Array<{
        messageId: string
        labelsAdded?: string[]
        labelsRemoved?: string[]
      }> = []

      for (const item of history.data.history) {
        // New messages
        if (item.messagesAdded) {
          for (const msg of item.messagesAdded) {
            if (msg.message?.id) {
              newMessageIds.push(msg.message.id)
            }
          }
        }

        // Deleted messages
        if (item.messagesDeleted) {
          for (const msg of item.messagesDeleted) {
            if (msg.message?.id) {
              deletedMessageIds.push(msg.message.id)
            }
          }
        }

        // Label changes
        if (item.labelsAdded || item.labelsRemoved) {
          const messageId = item.labelsAdded?.[0]?.message?.id ||
                           item.labelsRemoved?.[0]?.message?.id

          if (messageId) {
            labelChanges.push({
              messageId,
              labelsAdded: item.labelsAdded?.map(l => l.labelIds || []).flat(),
              labelsRemoved: item.labelsRemoved?.map(l => l.labelIds || []).flat(),
            })
          }
        }
      }

      // Fetch details for new messages
      const newMessages = []

      for (const messageId of newMessageIds.slice(0, 10)) { // Limit to 10
        try {
          const message = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full', // Get full message for storage
          })

          const headers = message.data.payload?.headers || []
          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

          const from = getHeader('From')
          const to = getHeader('To')
          const subject = getHeader('Subject')
          const date = getHeader('Date')
          const threadId = message.data.threadId

          newMessages.push({
            id: message.data.id,
            threadId,
            snippet: message.data.snippet,
            from,
            to,
            subject,
            date,
            labelIds: message.data.labelIds,
            isUnread: message.data.labelIds?.includes('UNREAD'),
          })

          // Store message in email_messages table for unified view
          if (threadId) {
            try {
              // Extract email from "Name <email>" format
              const extractEmail = (str: string) => {
                const match = str.match(/<([^>]+)>/)
                return match ? match[1].toLowerCase() : str.toLowerCase()
              }

              const fromEmail = extractEmail(from)
              const direction = fromEmail === userEmail ? 'outbound' : 'inbound'
              const clientEmail = direction === 'inbound' ? fromEmail : extractEmail(to)

              // Extract body
              let bodyHtml = ''
              let bodyText = ''
              const extractBody = (payload: any) => {
                if (payload?.body?.data) {
                  const content = Buffer.from(payload.body.data, 'base64').toString('utf-8')
                  if (payload.mimeType === 'text/html') bodyHtml = content
                  else if (payload.mimeType === 'text/plain') bodyText = content
                }
                if (payload?.parts) {
                  for (const part of payload.parts) extractBody(part)
                }
              }
              extractBody(message.data.payload)

              // Extract attachments
              const attachments: any[] = []
              const extractAttachments = (payload: any) => {
                if (payload?.filename && payload?.body?.attachmentId) {
                  attachments.push({
                    id: payload.body.attachmentId,
                    filename: payload.filename,
                    mimeType: payload.mimeType || 'application/octet-stream',
                    size: payload.body.size || 0
                  })
                }
                if (payload?.parts) {
                  for (const part of payload.parts) extractAttachments(part)
                }
              }
              extractAttachments(message.data.payload)

              // Find or create conversation
              const { data: existingConv } = await supabase
                .from('email_conversations')
                .select('id')
                .eq('thread_id', threadId)
                .single()

              let conversationId = existingConv?.id

              if (!conversationId) {
                const { data: newConv } = await supabase
                  .from('email_conversations')
                  .insert({
                    thread_id: threadId,
                    user_id: userId,
                    client_email: clientEmail,
                    subject,
                    last_message_snippet: message.data.snippet,
                    last_message_at: new Date(date || Date.now()).toISOString(),
                    unread_count: direction === 'inbound' ? 1 : 0,
                    status: 'active',
                    is_hidden: false,
                    last_sync_at: new Date().toISOString()
                  })
                  .select()
                  .single()
                conversationId = newConv?.id
              } else {
                // Update conversation
                await supabase
                  .from('email_conversations')
                  .update({
                    last_message_snippet: message.data.snippet,
                    last_message_at: new Date(date || Date.now()).toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', conversationId)
              }

              // Store message (if not exists)
              const { data: existingMsg } = await supabase
                .from('email_messages')
                .select('id')
                .eq('message_id', message.data.id)
                .single()

              if (!existingMsg) {
                await supabase
                  .from('email_messages')
                  .insert({
                    conversation_id: conversationId,
                    message_id: message.data.id,
                    thread_id: threadId,
                    direction,
                    from_address: from,
                    to_addresses: to ? to.split(',').map((e: string) => e.trim()) : [],
                    subject,
                    body_text: bodyText || null,
                    body_html: bodyHtml || null,
                    snippet: message.data.snippet,
                    attachments,
                    is_read: !message.data.labelIds?.includes('UNREAD'),
                    is_starred: message.data.labelIds?.includes('STARRED') || false,
                    labels: message.data.labelIds,
                    sent_at: new Date(date || Date.now()).toISOString()
                  })
              }
            } catch (storeError) {
              console.error('Error storing polled message:', storeError)
            }
          }
        } catch (e) {
          // Message might have been deleted
          console.error('Error fetching message:', messageId, e)
        }
      }

      return NextResponse.json({
        historyId: history.data.historyId,
        hasChanges: newMessages.length > 0 || deletedMessageIds.length > 0 || labelChanges.length > 0,
        newMessages,
        deletedMessages: deletedMessageIds,
        labelChanges,
        totalNew: newMessageIds.length,
      })

    } catch (error: any) {
      // History ID might be too old
      if (error.code === 404) {
        // Get fresh history ID
        const profile = await gmail.users.getProfile({ userId: 'me' })
        return NextResponse.json({
          historyId: profile.data.historyId,
          hasChanges: true, // Force refresh
          newMessages: [],
          deletedMessages: [],
          labelChanges: [],
          needsFullRefresh: true,
        })
      }
      throw error
    }

  } catch (error: any) {
    console.error('Error polling emails:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST /api/gmail/poll
// Get unread count
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get authenticated Gmail client (handles token fetch + refresh)
    let gmail
    try {
      const auth = await getAuthenticatedGmail(userId)
      gmail = auth.gmail
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 401 })
      }
      throw err
    }

    // Get unread count
    const unreadList = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox is:unread',
      maxResults: 1,
    })

    // Get total inbox count (for pagination info)
    const inboxList = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox',
      maxResults: 1,
    })

    return NextResponse.json({
      unreadCount: unreadList.data.resultSizeEstimate || 0,
      totalInbox: inboxList.data.resultSizeEstimate || 0,
    })

  } catch (error: any) {
    console.error('Error getting email counts:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
