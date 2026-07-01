import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getCurrentUserId } from '@/lib/auth/current-org'

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
    const { userId: bodyUserId, to, subject, body, threadId, attachments } = await request.json()

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

    // Build email with or without attachments
    let rawEmail: string

    if (attachments && attachments.length > 0) {
      rawEmail = buildEmailWithAttachments(to, subject, body, attachments)
    } else {
      rawEmail = buildSimpleEmail(to, subject, body)
    }

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawEmail,
        threadId,
      },
    })

    // Store sent message in email_messages table for unified view
    const sentMessageId = response.data.id
    const sentThreadId = response.data.threadId

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
            sent_at: new Date().toISOString()
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

function buildSimpleEmail(to: string, subject: string, body: string): string {
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
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
  attachments: Attachment[]
): string {
  const boundary = `boundary_${Date.now()}`
  
  const emailParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
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