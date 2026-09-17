import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { claimSend, finishSend, replyBodyHash, threadConflict } from '@/lib/email/send-guard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Attachment {
  filename: string
  mimeType: string
  data: string // base64 encoded
}

export async function POST(request: NextRequest) {
  try {
    const {
      userId: bodyUserId, to, subject, body, threadId, attachments,
      // The duplicate guard (lib/email/send-guard): one key per reply the
      // composer writes, the time of the newest message it was showing, and the
      // sender's "send anyway" after being told someone already answered.
      requestKey, seenUpTo, confirmDuplicate,
    } = await request.json()

    // Send as the authenticated session user (a compose from the browser).
    // Only fall back to a body-supplied userId when there is no session — a
    // trusted server-to-server caller. External no-session callers can't reach
    // here anyway (the /api/* gate 401s them), so this fallback never lets a
    // client-supplied userId override a real session (IDOR-safe).
    const userId = (await getCurrentUserId()) || bodyUserId

    if (!userId || !to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get authenticated Gmail client (handles token fetch + refresh)
    let gmail, emailAddress: string
    try {
      const auth = await getAuthenticatedGmail(userId)
      gmail = auth.gmail
      emailAddress = auth.emailAddress
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 401 })
      }
      throw err
    }

    // Never the same reply twice (operator, 2026-09-17).
    const key = typeof requestKey === 'string' && requestKey.trim() ? requestKey.trim().slice(0, 200) : null
    const bodyHash = replyBodyHash(body)
    if (threadId && !confirmDuplicate) {
      const conflict = await threadConflict(supabase, {
        threadId,
        requestKey: key,
        seenUpTo: seenUpTo === undefined ? undefined : (seenUpTo || null),
        bodyHash,
      })
      if (conflict) {
        return NextResponse.json({
          error: conflict.code === 'ALREADY_REPLIED'
            ? 'This conversation was already answered after you opened it.'
            : 'The same reply was sent to this conversation a few minutes ago.',
          ...conflict,
        }, { status: 409 })
      }
    }
    if (key) {
      const claim = await claimSend(supabase, key, { userId, threadId: threadId || null, bodyHash })
      if (!claim.ok) {
        if (claim.status === 'sent') {
          // The same attempt again (retry, double submit): its answer, not a second email.
          return NextResponse.json({ success: true, duplicate: true, messageId: claim.gmailMessageId, threadId: claim.gmailThreadId })
        }
        return NextResponse.json({ error: 'This reply is already being sent.', code: 'IN_PROGRESS' }, { status: 409 })
      }
    }

    // Answer the thread's latest message by its Message-ID, so the reply stays
    // in the customer's conversation in every mail client, not only in Gmail.
    const threading = threadId ? await replyHeaders(gmail, threadId) : {}

    // Build email with or without attachments
    let rawEmail: string

    if (attachments && attachments.length > 0) {
      rawEmail = buildEmailWithAttachments(to, subject, body, attachments, threading)
    } else {
      rawEmail = buildSimpleEmail(to, subject, body, threading)
    }

    // Send email
    let response
    try {
      response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawEmail,
          threadId,
        },
      })
    } catch (sendError) {
      if (key) await finishSend(supabase, key, { ok: false })
      throw sendError
    }

    // Store sent message in email_messages table for unified view
    const sentMessageId = response.data.id
    const sentThreadId = response.data.threadId
    if (key) await finishSend(supabase, key, { ok: true, gmailMessageId: sentMessageId ?? null, gmailThreadId: sentThreadId ?? null })

    if (sentMessageId && sentThreadId) {
      try {
        // Find or create conversation for this thread
        const { data: existingConv } = await supabase
          .from('email_conversations')
          .select('id')
          .eq('thread_id', sentThreadId)
          .single()

        let conversationId = existingConv?.id

        if (!conversationId) {
          // Create new conversation
          const { data: newConv } = await supabase
            .from('email_conversations')
            .insert({
              thread_id: sentThreadId,
              user_id: userId,
              client_email: to,
              subject: subject,
              last_message_snippet: body.substring(0, 200).replace(/<[^>]*>/g, ''),
              last_message_at: new Date().toISOString(),
              message_count: 1,
              status: 'active',
              is_hidden: false,
              last_sync_at: new Date().toISOString()
            })
            .select()
            .single()

          conversationId = newConv?.id
        } else {
          // Update existing conversation
          await supabase
            .from('email_conversations')
            .update({
              last_message_snippet: body.substring(0, 200).replace(/<[^>]*>/g, ''),
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId)
        }

        // Store the sent message
        await supabase
          .from('email_messages')
          .insert({
            conversation_id: conversationId,
            message_id: sentMessageId,
            thread_id: sentThreadId,
            direction: 'outbound',
            from_address: emailAddress,
            to_addresses: [to],
            subject: subject,
            body_html: body,
            snippet: body.substring(0, 200).replace(/<[^>]*>/g, ''),
            attachments: attachments?.map((a: Attachment) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              size: a.data ? Math.round(a.data.length * 0.75) : 0
            })) || [],
            is_read: true,
            sent_at: new Date().toISOString(),
            // Who answered — shown to a colleague about to answer again.
            sent_by: userId,
          })
      } catch (storeError) {
        // Log but don't fail - email was still sent
        console.error('Error storing sent email:', storeError)
      }
    }

    return NextResponse.json({ success: true, messageId: sentMessageId, threadId: sentThreadId })
  } catch (err: any) {
    console.error('Send email error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

interface ThreadingHeaders { inReplyTo?: string; references?: string }

/** In-Reply-To / References for a reply in `threadId`: its latest message's
 *  Message-ID. Empty when Gmail cannot say (the reply still threads in Gmail
 *  by threadId). */
async function replyHeaders(gmail: Awaited<ReturnType<typeof getAuthenticatedGmail>>['gmail'], threadId: string): Promise<ThreadingHeaders> {
  try {
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['Message-ID', 'References'] })
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

const threadingLines = (t: ThreadingHeaders): string[] => [
  ...(t.inReplyTo ? [`In-Reply-To: ${t.inReplyTo}`] : []),
  ...(t.references ? [`References: ${t.references}`] : []),
]

function buildSimpleEmail(to: string, subject: string, body: string, threading: ThreadingHeaders = {}): string {
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    ...threadingLines(threading),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ]
  
  return Buffer.from(emailLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildEmailWithAttachments(
  to: string, 
  subject: string, 
  body: string, 
  attachments: Attachment[],
  threading: ThreadingHeaders = {}
): string {
  const boundary = `boundary_${Date.now()}`
  
  const emailParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    ...threadingLines(threading),
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ]

  // Add attachments
  for (const attachment of attachments) {
    emailParts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      attachment.data
    )
  }

  emailParts.push(`--${boundary}--`)

  return Buffer.from(emailParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}