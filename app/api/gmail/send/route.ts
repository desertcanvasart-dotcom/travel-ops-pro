import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshAccessToken } from '@/lib/gmail'
import { google } from 'googleapis'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

interface Attachment {
  filename: string
  mimeType: string
  data: string // base64 encoded
}

export async function POST(request: NextRequest) {
  try {
    const { userId, to, subject, body, threadId, attachments } = await request.json()

    if (!userId || !to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    let { access_token, refresh_token, token_expiry } = tokenData

    // Check if token is expired
    if (new Date(token_expiry) <= new Date()) {
      const newTokens = await refreshAccessToken(refresh_token)
      access_token = newTokens.access_token!

      await supabase
        .from('gmail_tokens')
        .update({
          access_token: newTokens.access_token,
          token_expiry: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }

    // Set credentials
    oauth2Client.setCredentials({
      access_token,
      refresh_token,
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

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
            from_address: tokenData.email_address,
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
    return NextResponse.json({ error: err.message }, { status: 500 })
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