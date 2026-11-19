// ============================================
// POST /api/whatsapp/messages/[id]/transcribe — the inbox's "Transcribe" button
// ============================================
// For a voice note that came in before transcription existed, or whose
// transcript failed. New voice notes are transcribed by the webhook on
// arrival. A finished transcript is returned as it is (no second charge);
// `?retry=1` redoes it. Staff only (middleware: /api/whatsapp), and the
// message must be this company's (through its conversation).
// Ported from autoura-saas #808.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { transcribeMessage, transcriptionEnabled, VOICE_ROW_SELECT, voiceRowOf } from '@/lib/whatsapp/transcribe'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  if (!transcriptionEnabled()) {
    return NextResponse.json({ success: false, error: 'Voice transcription is not set up (no OpenAI key).' }, { status: 503 })
  }
  const { id } = await params
  const db = createServerClient()

  // This company's message, before anything is fetched or paid for.
  const { data } = await db.from('whatsapp_messages')
    .select(VOICE_ROW_SELECT)
    .eq('id', id)
    .eq('whatsapp_conversations.org_id', orgId)
    .maybeSingle()
  const row = voiceRowOf(data)
  if (!row || row.org_id !== orgId) return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })

  const retry = request.nextUrl.searchParams.get('retry') === '1'
  const out = await transcribeMessage(db as never, row, { force: retry })
  if (!out.ok) {
    const error = out.reason === 'not_voice' ? 'This message has no voice note.'
      : out.reason === 'busy' ? 'It is already being transcribed. It will appear in a moment.'
      : 'Voice transcription is not set up (no OpenAI key).'
    return NextResponse.json({ success: false, error, transcript: out.transcript ?? null }, { status: out.reason === 'busy' ? 409 : 400 })
  }
  return NextResponse.json({ success: true, transcript: out.transcript })
}
