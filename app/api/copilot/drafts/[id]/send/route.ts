// ============================================
// API: COPILOT SEND DRAFT
// ============================================
// POST /api/copilot/drafts/[id]/send — Send an approved draft
// This is the man-in-the-loop gate: only approved drafts can be sent.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { getAuthenticatedGmail } from '@/lib/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WHATSAPP_WINDOW_HOURS = 23

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let claimedForSend = false
  let draftId: string | null = null
  try {
    const { id } = await params
    draftId = id
    const body = await request.json()
    const userId = body.user_id

    // 1. Fetch the draft
    const { data: draft, error: draftError } = await supabase
      .from('communication_drafts')
      .select('*')
      .eq('id', id)
      .single()

    if (draftError || !draft) {
      return NextResponse.json(
        { success: false, error: 'Draft not found' },
        { status: 404 }
      )
    }

    // 2. Verify draft is approved (man-in-the-loop gate)
    if (draft.status !== 'approved') {
      return NextResponse.json(
        { success: false, error: `Cannot send a draft with status "${draft.status}". Draft must be approved first.` },
        { status: 400 }
      )
    }

    // 3. Fetch the thread and inbox message
    const [threadResult, inboxResult] = await Promise.all([
      supabase.from('communication_threads').select('*').eq('id', draft.thread_id).single(),
      supabase.from('communication_inbox').select('*').eq('id', draft.inbox_message_id).single(),
    ])

    const thread = threadResult.data
    const inboxMessage = inboxResult.data

    if (!thread || !inboxMessage) {
      return NextResponse.json(
        { success: false, error: 'Thread or inbox message not found' },
        { status: 404 }
      )
    }

    // 4. WhatsApp 24-hour window check
    if (thread.channel === 'whatsapp') {
      const receivedAt = new Date(inboxMessage.received_at)
      const now = new Date()
      const hoursElapsed = (now.getTime() - receivedAt.getTime()) / (1000 * 60 * 60)

      if (hoursElapsed >= WHATSAPP_WINDOW_HOURS) {
        const expiresAt = new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000)
        return NextResponse.json(
          {
            success: false,
            error: 'whatsapp_window_expired',
            message: `WhatsApp 24-hour messaging window has expired. The customer must send a new message first.`,
            expires_at: expiresAt.toISOString(),
            hours_elapsed: Math.round(hoursElapsed * 10) / 10,
          },
          { status: 400 }
        )
      }
    }

    // Atomically CLAIM the draft for sending. There's no 'sending' status (the
    // CHECK constraint only allows pending/approved/rejected/sent/expired), so we
    // use sent_at as the lock: stamp it WHERE status='approved' AND sent_at IS
    // NULL. PostgreSQL serializes the row update, so of two concurrent POSTs only
    // one gets a row back from RETURNING; the other matches 0 rows and bails —
    // preventing a double-send. On failure we clear sent_at again to release it.
    const { data: claimed, error: claimError } = await supabase
      .from('communication_drafts')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'approved')
      .is('sent_at', null)
      .select('id')

    if (claimError) {
      return NextResponse.json(
        { success: false, error: 'Failed to claim draft for sending' },
        { status: 500 }
      )
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Draft is already being sent or has already been sent.' },
        { status: 409 }
      )
    }
    claimedForSend = true

    // 5. Determine the message body to send
    const messageBody = draft.was_edited && draft.edited_body
      ? draft.edited_body
      : draft.draft_body

    let sendResult: { success: boolean; messageId?: string; error?: string }

    // 6. Send via the appropriate channel
    if (thread.channel === 'whatsapp') {
      sendResult = await sendWhatsAppMessage({
        to: thread.contact_info,
        body: messageBody,
      })

      if (sendResult.success) {
        // Store outbound message in whatsapp_messages for conversation continuity
        await supabase.from('whatsapp_messages').insert({
          conversation_id: thread.whatsapp_conversation_id,
          message_sid: sendResult.messageId,
          direction: 'outbound',
          message_body: messageBody,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
      }
    } else if (thread.channel === 'email') {
      if (!userId) {
        return NextResponse.json(
          { success: false, error: 'user_id is required for sending emails' },
          { status: 400 }
        )
      }

      try {
        const { gmail, emailAddress } = await getAuthenticatedGmail(userId)

        // Build email subject (reply to original subject)
        const subject = inboxMessage.subject
          ? (inboxMessage.subject.startsWith('Re:') ? inboxMessage.subject : `Re: ${inboxMessage.subject}`)
          : 'Re: Your inquiry'

        // Build raw email message
        const emailContent = [
          `To: ${thread.contact_info}`,
          `From: ${emailAddress}`,
          `Subject: ${subject}`,
          thread.email_conversation_id ? `In-Reply-To: ${thread.email_conversation_id}` : '',
          'Content-Type: text/plain; charset=utf-8',
          '',
          messageBody,
        ].filter(Boolean).join('\r\n')

        const encodedMessage = Buffer.from(emailContent)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        const sent = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodedMessage },
        })

        sendResult = { success: true, messageId: sent.data.id || undefined }

        // Store in email_messages for continuity
        if (thread.email_conversation_id) {
          await supabase.from('email_messages').insert({
            conversation_id: thread.email_conversation_id,
            message_id: sent.data.id,
            thread_id: sent.data.threadId,
            direction: 'outbound',
            from_address: emailAddress,
            to_addresses: [thread.contact_info],
            subject,
            body_text: messageBody,
            is_read: true,
            sent_at: new Date().toISOString(),
          })
        }
      } catch (emailError: any) {
        sendResult = { success: false, error: emailError.message }
      }
    } else {
      return NextResponse.json(
        { success: false, error: `Unknown channel: ${thread.channel}` },
        { status: 400 }
      )
    }

    // 7. Update draft status
    if (sendResult.success) {
      await supabase
        .from('communication_drafts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          send_channel: thread.channel,
          send_message_id: sendResult.messageId || null,
        })
        .eq('id', id)

      // Update inbox message status
      await supabase
        .from('communication_inbox')
        .update({ status: 'responded' })
        .eq('id', draft.inbox_message_id)

      // Update thread status
      await supabase
        .from('communication_threads')
        .update({ status: 'waiting', updated_at: new Date().toISOString() })
        .eq('id', draft.thread_id)

      return NextResponse.json({
        success: true,
        message_id: sendResult.messageId,
      })
    } else {
      // Send failed — release the claim (clear sent_at; status is still 'approved')
      // so the operator can retry, and record why it failed.
      await supabase
        .from('communication_drafts')
        .update({ sent_at: null, send_error: sendResult.error })
        .eq('id', id)

      return NextResponse.json(
        { success: false, error: sendResult.error || 'Failed to send message' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error sending copilot draft:', error)
    // If we'd claimed the draft (sent_at stamped) but threw before finalizing,
    // clear sent_at so it isn't stranded un-sendable. Guarded on status='approved'
    // so we never clobber a draft another request legitimately moved to 'sent'.
    if (claimedForSend && draftId) {
      await supabase
        .from('communication_drafts')
        .update({ sent_at: null, send_error: error.message })
        .eq('id', draftId)
        .eq('status', 'approved')
    }
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
