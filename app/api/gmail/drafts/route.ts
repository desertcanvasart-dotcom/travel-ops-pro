// ============================================
// API: /api/gmail/drafts — save, reopen and discard a draft
// ============================================
// Drafts are Gmail's own (users.drafts), in the same mailbox the inbox reads
// (lib/gmail-mailbox), so a draft saved here is in Gmail's Drafts and one
// started in Gmail opens here. The Drafts folder lists draft MESSAGES; a
// draft is opened by its message id (?messageId=) or its draft id (?id=).
// Sending a draft is /api/gmail/send with its draftId: sent, then removed.
//
// A draft need not be complete: recipients that are not addresses yet are
// left out rather than refused, and To may be empty.

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { GmailAuthError, parseEmailMessage } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { buildRawMessage, parseRecipients, type ComposeAttachment } from '@/lib/email/compose-mime'
import { gmailReplyHeaders } from '@/lib/email/reply-threading'

const ID = /^[A-Za-z0-9_-]{1,200}$/

async function mailbox() {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return await getMailboxGmail(userId)
  } catch (err) {
    if (err instanceof GmailAuthError) return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    throw err
  }
}

type Gmail = Awaited<ReturnType<typeof getMailboxGmail>>['gmail']

/** The draft whose message is `messageId` (the Drafts folder lists messages). */
async function draftIdForMessage(gmail: Gmail, messageId: string): Promise<string | null> {
  let pageToken: string | undefined
  for (let page = 0; page < 10; page++) {
    const { data } = await gmail.users.drafts.list({ userId: 'me', maxResults: 100, pageToken })
    const hit = data.drafts?.find(d => d.message?.id === messageId)
    if (hit?.id) return hit.id
    if (!data.nextPageToken) return null
    pageToken = data.nextPageToken
  }
  return null
}

// GET ?id= | ?messageId= — the draft, to open in compose.
export async function GET(request: NextRequest) {
  try {
    const auth = await mailbox()
    if (auth instanceof NextResponse) return auth
    const { gmail } = auth

    const params = request.nextUrl.searchParams
    let id = params.get('id')
    const messageId = params.get('messageId')
    if (!id && messageId && ID.test(messageId)) id = await draftIdForMessage(gmail, messageId)
    if (!id || !ID.test(id)) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    const { data } = await gmail.users.drafts.get({ userId: 'me', id, format: 'full' })
    if (!data.message) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    const m = parseEmailMessage(data.message)
    return NextResponse.json({
      draft: {
        id: data.id,
        messageId: m.id,
        threadId: m.threadId,
        to: m.to,
        cc: m.cc,
        bcc: m.bcc,
        subject: m.subject,
        body: m.body,
      },
    })
  } catch (err) {
    console.error('Get draft error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

// POST { id?, to, cc, bcc, subject, body, threadId?, attachments? } — create
// a draft, or update the one named.
export async function POST(request: NextRequest) {
  try {
    const auth = await mailbox()
    if (auth instanceof NextResponse) return auth
    const { gmail } = auth

    const { id, to, cc, bcc, subject, body, threadId, attachments } = await request.json()
    if (id !== undefined && id !== null && (typeof id !== 'string' || !ID.test(id))) {
      return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
    }
    const thread = typeof threadId === 'string' && ID.test(threadId) ? threadId : undefined

    const raw = buildRawMessage({
      to: parseRecipients(to).list,
      cc: parseRecipients(cc).list,
      bcc: parseRecipients(bcc).list,
      subject: typeof subject === 'string' ? subject : '',
      body: typeof body === 'string' ? body : '',
      attachments: Array.isArray(attachments) ? (attachments as ComposeAttachment[]) : undefined,
      threading: thread ? await gmailReplyHeaders(gmail, thread) : {},
    })
    const requestBody = { message: { raw, ...(thread ? { threadId: thread } : {}) } }

    const { data } = id
      ? await gmail.users.drafts.update({ userId: 'me', id, requestBody: { id, ...requestBody } })
      : await gmail.users.drafts.create({ userId: 'me', requestBody })

    return NextResponse.json({ id: data.id, messageId: data.message?.id ?? null })
  } catch (err) {
    console.error('Save draft error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

// DELETE ?id= — discard a draft.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await mailbox()
    if (auth instanceof NextResponse) return auth
    const { gmail } = auth

    const id = request.nextUrl.searchParams.get('id')
    if (!id || !ID.test(id)) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
    await gmail.users.drafts.delete({ userId: 'me', id })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete draft error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
