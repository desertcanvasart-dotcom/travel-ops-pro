import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { resolveMailbox } from '@/lib/gmail-mailbox'
import { getCurrentOrgId, getCurrentUserId } from '@/lib/auth/current-org'
import { gmailReplyHeaders, storedReplyHeaders, type ThreadingHeaders } from '@/lib/email/reply-threading'
import { buildRawMessage, parseRecipients, type ComposeAttachment } from '@/lib/email/compose-mime'
import { claimSend, finishSend, replyBodyHash, threadConflict } from '@/lib/email/send-guard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const {
      userId: bodyUserId, to, cc, bcc, subject, body, threadId, attachments,
      // Sent from a saved draft: it is removed once the email has gone.
      draftId,
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

    // To, Cc and Bcc: lists, comma- or semicolon-separated. A part that is not
    // an address is refused rather than dropped — sending to part of a list
    // the sender typed is worse than asking them to fix it.
    const toList = parseRecipients(to)
    const ccList = parseRecipients(cc)
    const bccList = parseRecipients(bcc)
    const invalid = [...toList.invalid, ...ccList.invalid, ...bccList.invalid]
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Not an email address: ${invalid.join(', ')}` }, { status: 400 })
    }
    if (toList.list.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // A reply in the shared inbox may be in a colleague's mailbox: the stored
    // conversation for this Gmail thread belongs to whoever's Gmail synced it,
    // and its thread id means nothing in the sender's own mailbox. Reply from
    // that mailbox when its owner is a member of the sender's organisation and
    // still connected (the rule lib/email/org-gmail-sender.ts applies to
    // vouchers); otherwise send from the sender's own Gmail as a new thread,
    // kept in the customer's conversation by In-Reply-To / References from the
    // stored Message-IDs.
    // Your own mailbox, else the organisation's shared one (lib/gmail-mailbox).
    let mailboxUserId: string = (await resolveMailbox(userId))?.mailboxUserId ?? userId
    let gmailThreadId: string | undefined = threadId || undefined
    let storedThreading: ThreadingHeaders | null = null
    if (threadId) {
      const { data: conv } = await supabase
        .from('email_conversations')
        .select('id, user_id')
        .eq('thread_id', threadId)
        .maybeSingle()
      if (conv?.user_id && conv.user_id !== mailboxUserId) {
        const orgId = await getCurrentOrgId()
        const { data: ownerMembership } = orgId
          ? await supabase.from('organization_members').select('user_id').eq('org_id', orgId).eq('user_id', conv.user_id).limit(1)
          : { data: null }
        const { data: ownerToken } = (ownerMembership?.length ?? 0) > 0
          ? await supabase.from('gmail_tokens').select('user_id').eq('user_id', conv.user_id).limit(1)
          : { data: null }
        if ((ownerToken?.length ?? 0) > 0) {
          mailboxUserId = conv.user_id
        } else {
          gmailThreadId = undefined
          storedThreading = await storedReplyHeaders(supabase, conv.id)
        }
      }
    }

    // Get authenticated Gmail client (handles token fetch + refresh)
    let gmail, emailAddress: string
    try {
      const auth = await getAuthenticatedGmail(mailboxUserId)
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
    const threading = storedThreading ?? (gmailThreadId ? await gmailReplyHeaders(gmail, gmailThreadId) : {})

    const rawEmail = buildRawMessage({
      to: toList.list, cc: ccList.list, bcc: bccList.list,
      subject, body, attachments, threading,
    })

    // Send email
    let response
    try {
      response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawEmail,
          threadId: gmailThreadId,
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

    // Sent from a saved draft: the draft goes, as in Gmail. A failure here
    // leaves a stale draft, not an unsent email — logged, not raised.
    if (typeof draftId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(draftId)) {
      try {
        await gmail.users.drafts.delete({ userId: 'me', id: draftId })
      } catch (draftError) {
        console.warn('[gmail send] draft not removed after sending:', draftError instanceof Error ? draftError.message : draftError)
      }
    }

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
              // The mailbox's owner — the shared mailbox's threads stay its own.
              user_id: mailboxUserId,
              client_email: toList.list[0],
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
            to_addresses: toList.list,
            cc_addresses: ccList.list,
            bcc_addresses: bccList.list,
            subject: subject,
            body_html: body,
            snippet: body.substring(0, 200).replace(/<[^>]*>/g, ''),
            attachments: attachments?.map((a: ComposeAttachment) => ({
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
