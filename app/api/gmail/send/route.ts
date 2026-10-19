import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { resolveMailbox } from '@/lib/gmail-mailbox'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { mailboxServesOrg } from '@/lib/email/org-gmail-sender'
import { findThreadConversation, type MailboxRef } from '@/lib/email/conversation-access'
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

    // The organisation this is sent for: the active workspace. Everything
    // read and stored below is its (email_conversations.org_id, 20261204).
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Your own mailbox when it serves this organisation, else the
    // organisation's (lib/gmail-mailbox). Never a connection that serves
    // another company — your own included, when you connected it there.
    const mailbox = await resolveMailbox(userId)
    if (!mailbox) {
      return NextResponse.json({ error: 'Gmail not connected. Please connect your Gmail account first.' }, { status: 401 })
    }
    let mailboxUserId: string = mailbox.mailboxUserId
    let gmailThreadId: string | undefined = threadId || undefined
    let storedThreading: ThreadingHeaders | null = null
    // A reply in the shared inbox may be in a colleague's mailbox: the stored
    // conversation for this Gmail thread belongs to whoever's Gmail synced it,
    // and its thread id means nothing in another mailbox. Reply from that
    // mailbox while it still serves this organisation; otherwise send from
    // this one as a new thread, kept in the customer's conversation by
    // In-Reply-To / References from the stored Message-IDs. Only this
    // organisation's conversations are read: another company's thread id
    // finds nothing here (no guard, no stored threading of theirs).
    if (threadId) {
      const { data: convRows } = await supabase
        .from('email_conversations')
        .select('id, user_id')
        .eq('org_id', orgId)
        .eq('thread_id', threadId)
      const stored = (convRows ?? []) as { id: string; user_id: string | null }[]
      const conv = stored.find(c => c.user_id === mailboxUserId) ?? stored[0] ?? null
      if (conv?.user_id && conv.user_id !== mailboxUserId) {
        if (await mailboxServesOrg(supabase, orgId, conv.user_id)) {
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
      if (auth.orgId !== orgId) throw new GmailAuthError('Gmail not connected. Please connect your Gmail account first.')
      gmail = auth.gmail
      emailAddress = auth.emailAddress
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return NextResponse.json({ error: err.message }, { status: 401 })
      }
      throw err
    }

    // Never the same reply twice (operator, 2026-09-17).
    const key = typeof requestKey === 'string' && requestKey.trim() ? requestKey.trim().slice(0, 200) : null
    const bodyHash = replyBodyHash(body)
    if (threadId && !confirmDuplicate) {
      const conflict = await threadConflict(supabase, {
        orgId,
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
        // Find or create conversation for this thread — in the mailbox it
        // was sent from (a Gmail thread id is per mailbox), in this
        // organisation.
        const sentFrom: MailboxRef = { orgId, mailboxEmail: String(emailAddress || '').toLowerCase(), mailboxUserId }
        const existingConv = await findThreadConversation<{ id: string }>(supabase, sentFrom, sentThreadId)

        let conversationId = existingConv?.id

        if (!conversationId) {
          // Create new conversation
          const { data: newConv } = await supabase
            .from('email_conversations')
            .insert({
              org_id: orgId,
              mailbox_email: sentFrom.mailboxEmail || null,
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
            .eq('org_id', orgId)
        }

        // Store the sent message
        await supabase
          .from('email_messages')
          .insert({
            org_id: orgId,
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
