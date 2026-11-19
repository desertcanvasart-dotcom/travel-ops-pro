// ============================================
// GET /api/whatsapp/media/[id] — a WhatsApp message's file
// ============================================
// [id] is the whatsapp_messages row. ?download=1 saves the file under its own
// name (lib/whatsapp/attachments downloadName); without it the file opens in
// the browser.
//
// The file is a CUSTOMER'S: a passport page, a payment slip. So the message is
// read through its conversation and must be this company's (whatsapp_messages
// carry no org of their own), and only then:
//   - our copy in the PRIVATE whatsapp-media bucket gets a signed link for a
//     minute, if its path is one written for this message of this company
//     (lib/whatsapp/media-storage storagePathBelongsTo);
//   - else Twilio's link is streamed through here with the account's
//     credentials, only when it is our own account's media link.
// Ported from autoura-saas #819.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { MEDIA_BUCKET, storagePathBelongsTo, isOwnTwilioMediaUrl } from '@/lib/whatsapp/media-storage'
import { downloadName } from '@/lib/whatsapp/attachments'

export const dynamic = 'force-dynamic'

// Long enough to open an image, short enough that a leaked URL is worthless.
const SIGNED_URL_TTL_SECONDS = 60

interface MediaRow {
  message_sid: string | null
  media_url: string | null
  media_type: string | null
  media_storage_path?: string | null
  media_filename?: string | null
  created_at: string | null
  sent_at: string | null
  whatsapp_conversations: { org_id: string | null } | null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const db = createServerClient()

    // '*': media_storage_path / media_filename arrive with migration 20270121;
    // before it the row simply has neither and Twilio's link is used.
    const { data, error } = await db
      .from('whatsapp_messages')
      .select('*, whatsapp_conversations!inner(org_id)')
      .eq('id', id)
      .eq('whatsapp_conversations.org_id', orgId)
      .maybeSingle()
    const message = data as MediaRow | null
    if (error || !message || message.whatsapp_conversations?.org_id !== orgId) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })
    }

    const download = new URL(request.url).searchParams.get('download') === '1'
    const fileName = downloadName(message)
    const storagePath = message.media_storage_path

    if (storagePath && storagePathBelongsTo(storagePath, { message_sid: message.message_sid, org_id: orgId })) {
      const { data: signed, error: signError } = await db
        .storage.from(MEDIA_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, download ? { download: fileName } : undefined)
      if (!signError && signed?.signedUrl) {
        // A redirect: the signed URL never has to live in page state.
        return NextResponse.redirect(signed.signedUrl)
      }
      console.error('whatsapp media sign error:', signError?.message)
      // Fall through to Twilio's link, if there is one.
    }

    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    if (isOwnTwilioMediaUrl(message.media_url, sid) && token) {
      return proxyTwilioMedia(message.media_url!, sid!, token, request.headers.get('range'), message.media_type, { fileName, download })
    }
    return NextResponse.json({ success: false, error: 'No stored attachment' }, { status: 404 })
  } catch (e) {
    console.error('whatsapp media route error:', (e as Error)?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/** Twilio media, streamed with the account's credentials; Range passes through so audio and video can seek. */
async function proxyTwilioMedia(url: string, sid: string, token: string, range: string | null, mediaType: string | null, name: { fileName: string; download: boolean }) {
  const upstream = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      ...(range ? { Range: range } : {}),
    },
    // Twilio answers with a redirect to its file store; fetch drops the
    // Authorization header on that cross-origin hop, as it should.
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!upstream.ok || !upstream.body) {
    console.error('twilio media fetch failed:', upstream.status)
    return NextResponse.json({ success: false, error: 'Could not load the attachment' }, { status: 502 })
  }
  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') || mediaType || 'application/octet-stream',
    'Cache-Control': 'private, max-age=300',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
    'Content-Disposition': `${name.download ? 'attachment' : 'inline'}; filename="${name.fileName}"`,
  })
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
