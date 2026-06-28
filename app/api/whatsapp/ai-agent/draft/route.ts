// ============================================
// POST /api/whatsapp/ai-agent/draft
// Generate an AI-SUGGESTED reply draft for a WhatsApp conversation.
// Draft-gated: stores the suggestion on the conversation for an operator to
// review and send. Never sends anything.
//
// Body: { conversationId: string, message?: string }
//   message — optional; defaults to the latest inbound message in the thread.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { WhatsAppAIAgent } from '@/lib/ai/whatsapp-ai-agent'

export async function POST(request: NextRequest) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const supabase = createServerClient()

  // Feature flag — draft-gated AI is off unless the org enabled it.
  const { data: org } = await supabase
    .from('organizations')
    .select('whatsapp_ai_enabled')
    .eq('id', orgId)
    .single()
  if (!(org as any)?.whatsapp_ai_enabled) {
    return NextResponse.json(
      { success: false, error: 'WhatsApp AI is not enabled for this organization.' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const conversationId: string | undefined = body.conversationId
  if (!conversationId) {
    return NextResponse.json({ success: false, error: 'conversationId is required' }, { status: 400 })
  }

  // Conversation → client + phone.
  const { data: conversation, error: convErr } = await supabase
    .from('whatsapp_conversations')
    .select('id, client_id, phone_number')
    .eq('id', conversationId)
    .single()
  if (convErr || !conversation) {
    return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
  }

  // The message to reply to — explicit, or the latest inbound.
  let incoming = (body.message || '').toString().trim()
  if (!incoming) {
    const { data: latest } = await supabase
      .from('whatsapp_messages')
      .select('message_body')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    incoming = ((latest as any)?.message_body || '').toString().trim()
  }
  if (!incoming) {
    return NextResponse.json({ success: false, error: 'No inbound message to reply to' }, { status: 400 })
  }

  // Run the draft-gated agent.
  const agent = new WhatsAppAIAgent()
  const context = await agent.gatherContext(
    supabase,
    conversationId,
    (conversation as any).client_id ?? null,
    (conversation as any).phone_number ?? ''
  )
  const result = await agent.generateResponse(incoming, context, supabase)

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error || 'Generation failed' }, { status: 502 })
  }

  // Store the suggestion on the conversation (operator reviews + sends).
  await supabase
    .from('whatsapp_conversations')
    .update({
      ai_draft_reply: result.reply || null,
      ai_draft_confidence: result.confidence,
      ai_draft_escalate: result.escalate,
      ai_draft_generated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  return NextResponse.json({
    success: true,
    draft: {
      reply: result.reply || '',
      confidence: result.confidence,
      escalate: result.escalate,
      shouldRespond: result.shouldRespond,
      toolsUsed: result.toolsUsed || [],
      reasoning: result.reasoning,
    },
  })
}
