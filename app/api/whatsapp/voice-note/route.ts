// ============================================
// POST /api/whatsapp/voice-note — send a recorded voice note
// ============================================
// The inbox's microphone button posts the browser's recording here as
// multipart form data: `conversation_id` and `audio`. The recording is
// re-wrapped as Ogg/Opus (lib/whatsapp/webm-opus-to-ogg: the only audio
// WhatsApp plays as a voice note), stored in the PRIVATE whatsapp-media bucket
// under outbound/<org>/<uuid>.ogg, and sent with a signed link Twilio fetches
// once. The message row keeps the storage path, so the inbox plays it back
// through /api/whatsapp/media/[id] like an inbound one. A failed send removes
// the file. Staff only (middleware: /api/whatsapp, agent and above).
// Ported from autoura-saas #807.

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { toWhatsAppVoiceNote, oggOpusDurationSeconds, VoiceNoteFormatError } from '@/lib/whatsapp/webm-opus-to-ogg'
import { MEDIA_BUCKET, outboundVoicePath, MAX_VOICE_NOTE_BYTES, MAX_VOICE_NOTE_SECONDS, uploadWhatsAppMedia } from '@/lib/whatsapp/media-storage'

export const dynamic = 'force-dynamic'

// Twilio fetches the file right after the send; an hour covers retries.
const PROVIDER_LINK_TTL_SECONDS = 60 * 60

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
    const audio = form?.get('audio')
    if (typeof conversationId !== 'string' || !(audio instanceof Blob)) {
      return fail('Send conversation_id and the recording as audio.', 400)
    }
    if (audio.size === 0) return fail('The recording is empty.', 400)
    if (audio.size > MAX_VOICE_NOTE_BYTES) return fail('The recording is too large.', 413)

    // This company's thread only.
    const { data: conv } = await db
      .from('whatsapp_conversations')
      .select('id, phone_number')
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!conv) return fail('Conversation not found', 404)

    // The columns a sent voice note is recorded in (20270121, 20270122):
    // without them the customer would get a voice note the inbox never shows.
    const probe = await db.from('whatsapp_messages').select('media_storage_path, metadata').limit(1)
    if (probe.error) {
      if (probe.error.code && MISSING_COLUMN.has(probe.error.code)) {
        return fail('Voice notes need a database update that has not been applied yet (migrations 20270121 and 20270122).', 503)
      }
      throw probe.error
    }

    let ogg: Uint8Array
    try {
      ogg = toWhatsAppVoiceNote(new Uint8Array(await audio.arrayBuffer()))
    } catch (e) {
      if (e instanceof VoiceNoteFormatError) return fail(e.message, 400)
      throw e
    }
    const seconds = oggOpusDurationSeconds(ogg)
    if (seconds > MAX_VOICE_NOTE_SECONDS) return fail(`Voice notes can be up to ${MAX_VOICE_NOTE_SECONDS / 60} minutes.`, 400)

    const path = outboundVoicePath(orgId, randomUUID())
    const { error: upErr } = await uploadWhatsAppMedia(db as never, path, ogg, { contentType: 'audio/ogg', upsert: false })
    if (upErr) {
      console.error('voice note upload error:', upErr.message)
      return fail('Could not store the voice note.', 500)
    }
    const removeFile = () => db.storage.from(MEDIA_BUCKET).remove([path]).then(() => undefined, () => undefined)

    const { data: signed, error: signErr } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(path, PROVIDER_LINK_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) {
      await removeFile()
      return fail('Could not prepare the voice note.', 500)
    }

    const to = conv.phone_number.startsWith('+') ? conv.phone_number : `+${conv.phone_number}`
    const sent = await sendWhatsAppMessage({ to, body: '', mediaUrl: signed.signedUrl, orgId })
    if (!sent.success || !sent.messageId) {
      await removeFile()
      return fail(sent.error || 'WhatsApp did not accept the voice note.', 502)
    }

    const { data: saved, error: saveErr } = await db
      .from('whatsapp_messages')
      .insert({
        conversation_id: conv.id,
        message_sid: sent.messageId,
        direction: 'outbound',
        message_body: '',
        media_type: 'audio/ogg',
        media_storage_path: path,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: { voice_note: true, seconds: Math.round(seconds * 10) / 10 },
      })
      .select()
      .single()
    if (saveErr) throw saveErr

    await db
      .from('whatsapp_conversations')
      .update({ last_message: '🎤 Voice message', last_message_at: new Date().toISOString() })
      .eq('id', conv.id)
      .eq('org_id', orgId)

    return NextResponse.json({ success: true, message: saved, message_id: sent.messageId })
  } catch (error) {
    console.error('voice note send error:', error)
    return fail('Failed to send the voice note.', 500)
  }
}
