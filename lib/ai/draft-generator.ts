// ============================================
// AI DRAFT GENERATOR
// ============================================
// Calls Claude to generate context-aware draft replies
// for the communication copilot. Returns structured JSON
// with draft_body, confidence, operator_notes, and flags.
// ============================================

import { SupabaseClient } from '@supabase/supabase-js'
import { createMessageWithRetry } from '@/lib/ai/anthropic-client'
import { MODEL_DRAFT } from '@/lib/ai/models'
import { buildCommunicationContext } from '@/lib/ai/communication-context-builder'
import { retrieveKnowledge, formatRetrievalContext } from '@/lib/copilot-retrieval'
import { localeFromPreferred, type RecipientLocale } from '@/lib/i18n/recipient-locale'
import {
  CopilotContext,
  CopilotChannel,
  CopilotTone,
  ClaudeDraftOutput,
  CopilotRetrievedRef,
  AIFlags,
  StoredDraftFlags,
} from '@/types/copilot'

/**
 * The flags stored on a draft: what the model reported, plus two facts only
 * the caller knows — the tone it was written in, and whether it was drafted
 * ahead of the operator opening the thread. Analytics reported on both long
 * before anything wrote them (permanently "unknown" / 0%).
 */
export function draftFlags(
  modelFlags: Partial<AIFlags> | null | undefined,
  meta: { tone: CopilotTone; pregenerated: boolean }
): StoredDraftFlags {
  return { ...(modelFlags ?? {}), tone: meta.tone, pregenerated: meta.pregenerated }
}

interface GenerateDraftParams {
  inboxMessageId: string
  threadId: string
  channel: CopilotChannel
  messageBody: string
  messageSubject?: string | null
  senderName?: string | null
  tone?: CopilotTone
  additionalInstructions?: string
  // Org to scope RAG retrieval to. Optional — when omitted, generateDraft
  // resolves it from the thread (communication_threads.org_id). When neither
  // is available, retrieval is skipped and the draft is generated un-grounded.
  orgId?: string | null
}

interface GenerateDraftResult {
  output: ClaudeDraftOutput
  context: CopilotContext
  generationTimeMs: number
  // How many knowledge-base entries were retrieved and injected (0 = un-grounded).
  knowledgeUsed: number
  // Which ones — persisted on the draft so the analytics can report them.
  retrieved: CopilotRetrievedRef[]
}

/**
 * Generate a draft reply using Claude.
 * Builds context from the database, constructs a prompt,
 * and parses Claude's structured JSON response.
 */
export async function generateDraft(
  params: GenerateDraftParams,
  supabase: SupabaseClient
): Promise<GenerateDraftResult> {
  const startTime = Date.now()

  // Build context from database
  const context = await buildCommunicationContext(params.threadId, supabase)

  // Tier 4: write the reply in the CLIENT's registered language
  // (clients.preferred_language, surfaced as context.client.language) rather
  // than only mirroring the inbound message. Null when no preference is set →
  // fall back to mirroring the customer's language.
  const pref = context.client?.language
  const clientLocale: RecipientLocale | null = pref && pref.trim() ? localeFromPreferred(pref) : null

  // Build prompts
  let systemPrompt = buildSystemPrompt(params.channel, params.tone || 'professional', clientLocale)
  const userPrompt = buildUserPrompt(params, context)

  // RAG grounding — retrieve org knowledge + similar past replies relevant to the
  // inbound message and inject them into the system prompt. Strictly fault-
  // tolerant: a retrieval failure (no OPENAI_API_KEY, migration not yet applied,
  // no org on the thread) must NEVER block draft generation — we fall back to the
  // un-grounded draft and just record knowledgeUsed = 0.
  let knowledgeUsed = 0
  let retrieved: CopilotRetrievedRef[] = []
  try {
    const orgId = params.orgId ?? (await resolveThreadOrgId(params.threadId, supabase))
    const query = (params.messageBody || '').trim()
    if (orgId && query) {
      const items = await retrieveKnowledge(supabase, orgId, query, { limit: 6 })
      const block = formatRetrievalContext(items)
      if (block) {
        knowledgeUsed = items.length
        retrieved = items.map((i) => ({
          id: i.id,
          title: i.title,
          source_type: i.source_type,
          similarity: Math.round(i.similarity * 1000) / 1000,
        }))
        systemPrompt +=
          `\n\n# RETRIEVED KNOWLEDGE BASE (RAG)\n` +
          `Ground your reply in the material below. Treat "Relevant business knowledge" as ` +
          `authoritative facts (prefer it over assumptions); treat "Similar past conversations" ` +
          `as tone/style exemplars only. Never invent details that aren't in this block or the ` +
          `conversation context.\n\n${block}`
      }
    }
  } catch (err) {
    console.warn('[draft-generator] RAG retrieval skipped:', (err as any)?.message || err)
  }

  // Call Claude
  const message = await createMessageWithRetry({
    model: MODEL_DRAFT,
    max_tokens: 4096,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    system: systemPrompt,
  })

  const generationTimeMs = Date.now() - startTime

  // Extract text response
  const responseText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('')

  // Parse structured JSON from response
  const output = parseClaudeOutput(responseText)

  return {
    output,
    // The stored context records what retrieval returned, so "why did the
    // draft say that?" stays answerable after the fact.
    context: { ...context, retrieved },
    generationTimeMs,
    knowledgeUsed,
    retrieved,
  }
}

/**
 * Resolve the org that owns a copilot thread, for scoping RAG retrieval.
 * Returns null on any error or when org_id isn't set on the thread (the column
 * is nullable) — callers treat null as "skip retrieval".
 */
async function resolveThreadOrgId(threadId: string, supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('communication_threads')
      .select('org_id')
      .eq('id', threadId)
      .single()
    return (data as { org_id?: string | null } | null)?.org_id ?? null
  } catch {
    return null
  }
}

// ============================================
// PROMPT BUILDERS
// ============================================

// Exported for testability — lets a render check exercise the exact prompt
// (incl. the language rule) without a live DB context.
export function buildSystemPrompt(
  channel: CopilotChannel,
  tone: CopilotTone,
  clientLocale: RecipientLocale | null = null,
): string {
  const toneInstructions: Record<CopilotTone, string> = {
    professional: 'Use a professional, warm tone. Be courteous and efficient. Balance friendliness with competence.',
    friendly: 'Use a warm, conversational tone. Be personable and approachable. Use casual language while remaining respectful.',
    formal: 'Use a formal, polished tone. Be respectful and dignified. Use proper salutations and formal language.',
  }

  // The client's registered language wins when set; otherwise mirror the
  // customer's own message language.
  const languageRule =
    clientLocale === 'ja'
      ? "- LANGUAGE: Write your ENTIRE reply in natural, polite Japanese (日本語). Japanese is the client's registered language — reply in Japanese even if the customer's latest message happened to be in another language."
      : clientLocale === 'en'
        ? "- LANGUAGE: Write your reply in English (the client's registered language)."
        : '- LANGUAGE: Reply in the same language the customer wrote their most recent message in. If that is unclear, default to English.'

  return `You are a communication assistant for a travel operations company specializing in Egypt tours (Travel2Egypt / Autoura).

ROLE:
- You draft reply messages for the human operator to review before sending. You do NOT send messages directly.
- The operator will review your draft, potentially edit it, then approve and send it.

TONE:
${toneInstructions[tone]}

RULES:
${languageRule}
- ${channel === 'whatsapp' ? 'Keep WhatsApp replies concise — under 300 words. Use appropriate formatting (*bold*, line breaks).' : 'Email replies can be longer and more detailed. Use proper email formatting.'}
- Never fabricate information. If the context data doesn't contain the answer, say you will check and get back to them.
- Never make promises about refunds, discounts, or policy exceptions without flagging for escalation.
- If the message suggests a cancellation, complaint, or dispute, set escalate to true with a clear reason.
- Be specific when referencing booking details — use dates, tour names, and amounts from the context.

OUTPUT FORMAT:
You MUST respond with valid JSON matching this exact schema:
{
  "draft_body": "The draft reply message text",
  "confidence": "high" | "medium" | "low",
  "operator_notes": "Brief explanation of your drafting rationale for the operator",
  "flags": {
    "escalate": false,
    "escalation_reason": null,
    "message_type": "booking_inquiry" | "payment_question" | "complaint" | "cancellation_signal" | "schedule_change" | "general_inquiry" | "greeting" | "feedback" | "document_request" | "other",
    "urgency": "low" | "normal" | "high"
  }
}

Respond ONLY with the JSON object. No markdown fences, no explanation outside the JSON.`
}

function buildUserPrompt(params: GenerateDraftParams, context: CopilotContext): string {
  const sections: string[] = []

  // Customer message
  sections.push(`== CUSTOMER MESSAGE ==
Channel: ${params.channel}
From: ${params.senderName || 'Unknown'} (${params.channel === 'email' ? 'email' : 'WhatsApp'})${params.messageSubject ? `\nSubject: ${params.messageSubject}` : ''}

${params.messageBody}`)

  // Client info
  if (context.client) {
    const c = context.client
    sections.push(`== CLIENT INFO ==
Name: ${c.name}
Email: ${c.email || 'N/A'}
Phone: ${c.phone || 'N/A'}
Nationality: ${c.nationality || 'N/A'}
Language: ${c.language || 'N/A'}
Total bookings: ${c.total_bookings}${c.notes ? `\nNotes: ${c.notes}` : ''}`)
  } else {
    sections.push(`== CLIENT INFO ==
No matching client found in database. This may be a new inquiry.`)
  }

  // Itineraries
  if (context.itineraries.length > 0) {
    const itinLines = context.itineraries.map((it) =>
      `- ${it.tour_name || 'Untitled'} (${it.reference || 'no ref'}) | ${it.start_date || '?'} → ${it.end_date || '?'} | Status: ${it.status || '?'} | ${it.pax || '?'} pax | ${it.currency || ''} ${it.quoted_amount || '?'}`
    ).join('\n')
    sections.push(`== ITINERARIES ==\n${itinLines}`)
  }

  // Invoices
  if (context.invoices.length > 0) {
    const invLines = context.invoices.map((inv) =>
      `- ${inv.invoice_number || '?'} (${inv.invoice_type || 'standard'}) | Total: ${inv.currency || ''} ${inv.total_amount || 0} | Paid: ${inv.amount_paid || 0} | Due: ${inv.balance_due || 0} | Status: ${inv.status || '?'}${inv.due_date ? ` | Due date: ${inv.due_date}` : ''}`
    ).join('\n')
    sections.push(`== INVOICES ==\n${invLines}`)
  }

  // Payments
  if (context.payments.length > 0) {
    const payLines = context.payments.map((p) =>
      `- ${p.currency || ''} ${p.amount || 0} via ${p.payment_method || '?'} | Status: ${p.status || '?'} | Date: ${p.paid_at || '?'}`
    ).join('\n')
    sections.push(`== RECENT PAYMENTS ==\n${payLines}`)
  }

  // Conversation history
  if (context.recent_messages.length > 0) {
    const msgLines = context.recent_messages.map((m) => {
      const label = m.direction === 'inbound' ? 'CUSTOMER' : 'OPERATOR'
      const truncated = m.body.length > 200 ? m.body.substring(0, 200) + '...' : m.body
      return `[${label} ${m.sent_at}]: ${truncated}`
    }).join('\n')
    sections.push(`== CONVERSATION HISTORY (last ${context.recent_messages.length} messages) ==\n${msgLines}`)
  }

  // Additional instructions from operator (for regeneration)
  if (params.additionalInstructions) {
    sections.push(`== OPERATOR INSTRUCTIONS ==
The operator has requested the following adjustments to the draft:
${params.additionalInstructions}`)
  }

  sections.push(`== TASK ==
Draft a reply to the customer's message above. Use the context provided to give an accurate, helpful response.`)

  return sections.join('\n\n')
}

// ============================================
// RESPONSE PARSER
// ============================================

function parseClaudeOutput(responseText: string): ClaudeDraftOutput {
  // Try to extract JSON from the response
  let jsonStr = responseText.trim()

  // Remove markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    // Validate required fields
    if (!parsed.draft_body || typeof parsed.draft_body !== 'string') {
      throw new Error('Missing or invalid draft_body')
    }

    return {
      draft_body: parsed.draft_body,
      confidence: validateConfidence(parsed.confidence),
      operator_notes: parsed.operator_notes || '',
      flags: {
        escalate: !!parsed.flags?.escalate,
        escalation_reason: parsed.flags?.escalation_reason || null,
        message_type: parsed.flags?.message_type || 'other',
        urgency: parsed.flags?.urgency || 'normal',
      },
    }
  } catch (parseError) {
    // If JSON parsing fails, treat the entire response as the draft body
    console.error('Failed to parse Claude JSON output, using raw text:', parseError)
    return {
      draft_body: responseText.trim(),
      confidence: 'low',
      operator_notes: 'Warning: Claude did not return structured JSON. This draft may need extra review.',
      flags: {
        escalate: false,
        escalation_reason: null,
        message_type: 'other',
        urgency: 'normal',
      },
    }
  }
}

function validateConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}
