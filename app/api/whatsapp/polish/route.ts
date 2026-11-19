// ============================================
// POST /api/whatsapp/polish — the operator's notes → a finished message
// ============================================
// Body: { conversation_id, notes, style }
// Returns { success, message, language, style, unsourced_numbers }. Sends
// NOTHING: the text goes back into the message box for the operator to read
// and send. Rules and styles: lib/whatsapp/polish-reply.ts.
//
// Behind the company's WhatsApp AI switch (organizations.whatsapp_ai_enabled,
// Settings → WhatsApp AI), like the AI draft, and the same per-user AI budget.
// Ported from autoura-saas #839.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { guardAiRate } from '@/lib/rate-limit/ai-limit'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'
import { MODEL_DRAFT } from '@/lib/ai/models'
import { messageWords } from '@/lib/whatsapp/transcript'
import { buildPolishPrompt, parsePolishReply, polishStyle, unsourcedNumbers, type PolishMessage } from '@/lib/whatsapp/polish-reply'

export const dynamic = 'force-dynamic'

/** Notes longer than this are not notes. */
const MAX_NOTES = 8000

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()

    const { data: org } = await supabase
      .from('organizations')
      .select('name, whatsapp_ai_enabled')
      .eq('id', orgId)
      .maybeSingle()
    const orgRow = org as { name?: string | null; whatsapp_ai_enabled?: boolean | null } | null
    if (!orgRow?.whatsapp_ai_enabled) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp AI is not enabled for this company (Settings → WhatsApp AI).' },
        { status: 403 }
      )
    }

    const limited = await guardAiRate()
    if (limited) return limited

    const body = await request.json().catch(() => ({}))
    const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    if (!conversationId) return NextResponse.json({ success: false, error: 'conversation_id is required' }, { status: 400 })
    if (!notes) return NextResponse.json({ success: false, error: 'Type what you want to say first' }, { status: 400 })
    if (notes.length > MAX_NOTES) {
      return NextResponse.json({ success: false, error: `Notes are limited to ${MAX_NOTES} characters` }, { status: 413 })
    }
    const style = polishStyle(body.style)

    // This company's thread only.
    const { data: conv } = await supabase
      .from('whatsapp_conversations')
      .select('id, client_name')
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!conv) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })

    const { data: rows } = await supabase
      .from('whatsapp_messages')
      // '*': metadata (a voice note's transcript, 20270122) when it exists.
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(12)
    // A voice note counts by its transcript (lib/whatsapp/transcript).
    const messages: PolishMessage[] = ((rows ?? []) as Array<{ direction: string | null; message_body: string | null; metadata?: unknown }>)
      .map(m => ({ direction: m.direction === 'inbound' ? 'inbound' as const : 'outbound' as const, text: messageWords(m) }))
      .filter(m => m.text)
      .reverse()

    const businessName = orgRow.name?.trim() || 'the travel agency'
    const prompt = buildPolishPrompt({ businessName, style: style.key, notes, messages, customerName: (conv as { client_name?: string | null }).client_name })

    let result: ReturnType<typeof parsePolishReply> = null
    try {
      const resp = await createMessageWithRetry({
        model: MODEL_DRAFT,
        max_tokens: 2048,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      })
      const text = resp.content
        .filter(b => b.type === 'text')
        .map(b => ('text' in b ? b.text : ''))
        .join('')
      result = parsePolishReply(text)
    } catch (err) {
      const e = getUserFriendlyError(err)
      return NextResponse.json({ success: false, error: e.message }, { status: e.status })
    }
    if (!result) return NextResponse.json({ success: false, error: 'The AI gave no usable message. Try again.' }, { status: 502 })

    return NextResponse.json({
      success: true,
      message: result.message,
      language: result.language,
      style: style.key,
      // A number in the message that is in neither the notes nor the chat.
      unsourced_numbers: unsourcedNumbers(result.message, [notes, ...messages.map(m => m.text)]),
    })
  } catch (err) {
    console.error('whatsapp polish error:', err)
    return NextResponse.json({ success: false, error: 'Could not polish the message' }, { status: 500 })
  }
}
