// ============================================
// POST /api/whatsapp/attachment — send a file from the inbox
// ============================================
// Multipart form: `conversation_id`, `file`, and an optional `caption`. The
// file must be a type WhatsApp delivers, within its size
// (lib/whatsapp/attachments checkSendable). It is stored in the PRIVATE
// whatsapp-media bucket under outbound/<org>/<uuid>/<its own name>, so the
// link Twilio fetches, and the document the customer receives, carry the real
// file name. Twilio gets a signed link valid for an hour (it fetches at once).
// The message row keeps the storage path and the name, so the inbox shows and
// downloads it through /api/whatsapp/media/[id]. A failed send removes the
// file. Sending is staff-only (middleware: /api/whatsapp, agent and above).
// Ported from autoura-saas #819.

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { MEDIA_BUCKET, outboundFilePath, uploadWhatsAppMedia } from '@/lib/whatsapp/media-storage'
import { checkSendable, safeFileName } from '@/lib/whatsapp/attachments'

export const dynamic = 'force-dynamic'

const PROVIDER_LINK_TTL_SECONDS = 60 * 60
const MAX_CAPTION = 1000

/** Postgres "no such column" and PostgREST "column not in the schema cache". */
const MISSING_COLUMN = new Set(['42703', 'PGRST204'])

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status })

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const db = createServerClient()

    const form = await request.formData().catch(() => null)
    const conversationId = form?.get('conversation_id')
    const file = form?.get('file')
    const captionRaw = form?.get('caption')
    if (typeof conversationId !== 'string' || !(file instanceof File)) {
      return fail('Send conversation_id and the file.', 400)
    }
    const caption = typeof captionRaw === 'string' ? captionRaw.trim().slice(0, MAX_CAPTION) : ''

    const check = checkSendable({ name: file.name, type: file.type, size: file.size })
    if (!check.ok) return fail(check.error, check.error.includes(' MB') ? 413 : 400)

    // This company's thread only.
    const { data: conv } = await db
      .from('whatsapp_conversations')
      .select('id, phone_number')
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!conv) return fail('Conversation not found', 404)

    // Before anything is uploaded or sent: the columns the sent file is
    // recorded in (migration 20270121). Without them the customer would get a
    // file the inbox could never show.
    const probe = await db.from('whatsapp_messages').select('media_storage_path, media_filename').limit(1)
    if (probe.error) {
      if (probe.error.code && MISSING_COLUMN.has(probe.error.code)) {
        return fail('Sending files needs a database update that has not been applied yet (migration 20270121).', 503)
      }
      throw probe.error
    }

    const name = safeFileName(file.name, check.mime)
    const path = outboundFilePath(orgId, randomUUID(), name)
    const { error: upErr } = await uploadWhatsAppMedia(db as never, path, new Uint8Array(await file.arrayBuffer()), { contentType: check.mime, upsert: false })
    if (upErr) {
      console.error('attachment upload error:', upErr.message)
      return fail('Could not store the file.', 500)
    }
    const removeFile = () => db.storage.from(MEDIA_BUCKET).remove([path]).then(() => undefined, () => undefined)

    const { data: signed, error: signErr } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(path, PROVIDER_LINK_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) {
      await removeFile()
      return fail('Could not prepare the file.', 500)
    }

    const to = conv.phone_number.startsWith('+') ? conv.phone_number : `+${conv.phone_number}`
    const sent = await sendWhatsAppMessage({ to, body: caption, mediaUrl: signed.signedUrl, orgId })
    if (!sent.success || !sent.messageId) {
      await removeFile()
      return fail(sent.error || 'WhatsApp did not accept the file.', 502)
    }

    const { data: saved, error: saveErr } = await db
      .from('whatsapp_messages')
      .insert({
        conversation_id: conv.id,
        message_sid: sent.messageId,
        direction: 'outbound',
        message_body: caption,
        media_type: check.mime,
        media_storage_path: path,
        media_filename: file.name.slice(0, 200),
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (saveErr) throw saveErr

    // The inbox list shows the latest message.
    await db
      .from('whatsapp_conversations')
      .update({ last_message: caption || `📎 ${file.name.slice(0, 100)}`, last_message_at: new Date().toISOString() })
      .eq('id', conv.id)
      .eq('org_id', orgId)

    return NextResponse.json({ success: true, message: saved, message_id: sent.messageId, ...(sent.warning ? { warning: sent.warning } : {}) })
  } catch (error) {
    console.error('attachment send error:', error)
    return fail('Failed to send the file.', 500)
  }
}
