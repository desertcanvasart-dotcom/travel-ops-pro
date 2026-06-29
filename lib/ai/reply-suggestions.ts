// ============================================================
// AI REPLY SUGGESTIONS — multi-variant draft generator
// ============================================================
// Ported in spirit from the sibling app (autoura-saas) lib/copilot-suggest.ts,
// but adapted to THIS app: it reuses our existing context builder
// (buildCommunicationContext), our RAG retrieval (copilot-retrieval, org-scoped),
// and our Anthropic client — and it does NOT tenant-scope the copilot tables
// (ours are single-org / unscoped, unlike the sibling's tenant_id model).
//
// Difference vs lib/ai/draft-generator.ts (single draft): this asks Claude for
// `count` distinct reply OPTIONS in one call and writes one communication_drafts
// row per option, so the operator can pick. Draft-gated — nothing is sent.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { createMessageWithRetry } from '@/lib/ai/anthropic-client'
import { MODEL_DRAFT } from '@/lib/ai/models'
import { buildCommunicationContext } from '@/lib/ai/communication-context-builder'
import { retrieveKnowledge, formatRetrievalContext } from '@/lib/copilot-retrieval'
import { localeFromPreferred, type RecipientLocale } from '@/lib/i18n/recipient-locale'
import type { CopilotChannel, CopilotTone } from '@/types/copilot'

export interface GenerateReplyOptionsArgs {
  supabase: SupabaseClient
  threadId: string
  inboxMessageId: string
  channel: CopilotChannel
  count?: number
  tone?: CopilotTone
  instruction?: string | null
  parentDraftId?: string | null
  reviewerUserId?: string | null
  /** If true, return early when pending drafts already exist for this inbox row. */
  skipIfPendingExists?: boolean
}

export interface ReplyOptionDraft {
  id: string
  draft_body: string
  operator_notes: string | null
  ai_confidence: 'high' | 'medium' | 'low'
}

export interface GenerateReplyOptionsResult {
  success: boolean
  thread_id?: string
  inbox_message_id?: string
  drafts?: ReplyOptionDraft[]
  knowledgeUsed?: number
  error?: string
}

const clampCount = (n: unknown) => Math.min(Math.max(Math.trunc(Number(n) || 2), 1), 4)

export async function generateReplyOptions(
  args: GenerateReplyOptionsArgs
): Promise<GenerateReplyOptionsResult> {
  const { supabase, threadId, inboxMessageId, channel } = args
  const count = clampCount(args.count)
  const startedAt = Date.now()

  try {
    // Idempotency: skip if pending originals already exist for this inbox row.
    if (args.skipIfPendingExists) {
      const { data: existing } = await supabase
        .from('communication_drafts')
        .select('id')
        .eq('inbox_message_id', inboxMessageId)
        .eq('status', 'pending')
        .limit(1)
      if (existing && existing.length > 0) {
        return { success: true, thread_id: threadId, inbox_message_id: inboxMessageId, drafts: [] }
      }
    }

    // The customer's message we're replying to.
    const { data: inbox, error: inboxErr } = await supabase
      .from('communication_inbox')
      .select('id, message_body, subject, sender_name')
      .eq('id', inboxMessageId)
      .single()
    if (inboxErr || !inbox) return { success: false, error: 'Inbox message not found' }

    // Shared context (client, history, itineraries, invoices) — reuse our builder.
    const context = await buildCommunicationContext(threadId, supabase)

    // Tone: explicit arg wins; else the reviewer's saved preference; else professional.
    let tone: CopilotTone = args.tone || 'professional'
    if (!args.tone && args.reviewerUserId) {
      const { data: settings } = await supabase
        .from('copilot_settings')
        .select('tone')
        .eq('user_id', args.reviewerUserId)
        .maybeSingle()
      if (settings?.tone) tone = settings.tone as CopilotTone
    }

    // Client's registered language wins; else mirror the customer's message.
    const pref = context.client?.language
    const clientLocale: RecipientLocale | null = pref && pref.trim() ? localeFromPreferred(pref) : null

    // RAG grounding (org-scoped). Fault-tolerant: failures just drop the block.
    let knowledgeUsed = 0
    let ragBlock = ''
    try {
      const orgId = await resolveThreadOrgId(threadId, supabase)
      const query = ((inbox as any).subject ? `${(inbox as any).subject}\n\n` : '') + ((inbox as any).message_body || '')
      if (orgId && query.trim()) {
        const items = await retrieveKnowledge(supabase, orgId, query, { limit: 6 })
        ragBlock = formatRetrievalContext(items)
        knowledgeUsed = items.length
      }
    } catch (err) {
      console.warn('[reply-suggestions] RAG retrieval skipped:', (err as any)?.message || err)
    }

    const systemPrompt = buildMultiDraftSystemPrompt(channel, tone, clientLocale, count, ragBlock)
    const userPrompt = buildUserPrompt(channel, inbox as any, context, args.instruction || null)

    const message = await createMessageWithRetry({
      model: MODEL_DRAFT,
      max_tokens: channel === 'email' ? 3072 : 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
    const options = parseDraftOptions(text, count)
    if (options.length === 0) return { success: false, error: 'AI returned no usable drafts' }

    const generationTimeMs = Date.now() - startedAt

    // Write one communication_drafts row per option (all originals — no parent).
    const rows = options.map((o) => ({
      thread_id: threadId,
      inbox_message_id: inboxMessageId,
      draft_body: o.draft_body,
      operator_notes: o.rationale || null,
      ai_model: MODEL_DRAFT,
      ai_confidence: o.confidence,
      ai_flags: o.flags ?? null,
      context_used: context,
      generation_time_ms: generationTimeMs,
      status: 'pending',
      parent_draft_id: args.parentDraftId ?? null,
    }))

    const { data: inserted, error: insErr } = await supabase
      .from('communication_drafts')
      .insert(rows)
      .select('id, draft_body, operator_notes, ai_confidence')
    if (insErr) return { success: false, error: `Failed to store drafts: ${insErr.message}` }

    // Best-effort status updates (mirror the single-draft route).
    await supabase.from('communication_inbox').update({ status: 'draft_ready' }).eq('id', inboxMessageId)
    await supabase.from('communication_threads').update({ last_draft_at: new Date().toISOString() }).eq('id', threadId)

    return {
      success: true,
      thread_id: threadId,
      inbox_message_id: inboxMessageId,
      knowledgeUsed,
      drafts: (inserted || []).map((d: any) => ({
        id: d.id,
        draft_body: d.draft_body,
        operator_notes: d.operator_notes,
        ai_confidence: d.ai_confidence,
      })),
    }
  } catch (err: any) {
    console.error('[reply-suggestions] generateReplyOptions failed:', err?.message || err)
    return { success: false, error: err?.message || 'Internal error' }
  }
}

async function resolveThreadOrgId(threadId: string, supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.from('communication_threads').select('org_id').eq('id', threadId).single()
    return (data as { org_id?: string | null } | null)?.org_id ?? null
  } catch {
    return null
  }
}

// ---- prompt + parsing -------------------------------------------------------

interface ParsedOption {
  draft_body: string
  rationale: string | null
  confidence: 'high' | 'medium' | 'low'
  flags: Record<string, unknown> | null
}

export function buildMultiDraftSystemPrompt(
  channel: CopilotChannel,
  tone: CopilotTone,
  clientLocale: RecipientLocale | null,
  count: number,
  ragBlock: string
): string {
  const toneLine: Record<CopilotTone, string> = {
    professional: 'professional, warm, courteous and efficient',
    friendly: 'warm, conversational and personable',
    formal: 'formal, polished and respectful',
  }
  const languageRule =
    clientLocale === 'ja'
      ? "Write every draft in natural, polite Japanese (日本語) — it's the client's registered language."
      : clientLocale === 'en'
        ? "Write the drafts in English (the client's registered language)."
        : "Write the drafts in the same language as the customer's most recent message; default to English if unclear."
  const channelRule =
    channel === 'whatsapp'
      ? 'WhatsApp: keep each draft concise (under ~300 words), light formatting (*bold*, line breaks).'
      : 'Email: drafts can be longer and more detailed; use proper email structure.'

  return `You are a communication assistant for a travel operations company specialising in Egypt tours (Travel2Egypt / Autoura).

ROLE: Produce ${count} DISTINCT reply options a human operator will choose from, edit, and send. You do NOT send anything yourself. Make the options meaningfully different (e.g. concise vs detailed, or different angles) — not trivial rewordings.

TONE: ${toneLine[tone]}.

RULES:
- ${languageRule}
- ${channelRule}
- Never fabricate facts. If the context doesn't contain an answer, say you'll check and follow up.
- Never promise refunds, discounts, or policy exceptions — set escalate=true with a reason instead.
- Ground replies in the provided context and knowledge base; prefer authoritative business knowledge over assumptions.
${ragBlock ? `\n# RETRIEVED KNOWLEDGE BASE (RAG)\n${ragBlock}\n` : ''}
OUTPUT FORMAT — respond with ONLY this JSON (no markdown fences, no prose):
{
  "drafts": [
    {
      "draft_body": "the reply text",
      "rationale": "one short line on why/when to use this option",
      "confidence": "high" | "medium" | "low",
      "flags": { "escalate": false, "escalation_reason": null, "message_type": "general_inquiry", "urgency": "normal" }
    }
  ]
}
Return exactly ${count} entries in "drafts".`
}

function buildUserPrompt(
  channel: CopilotChannel,
  inbox: { message_body?: string | null; subject?: string | null; sender_name?: string | null },
  context: any,
  instruction: string | null
): string {
  const parts: string[] = []
  parts.push(`== CUSTOMER MESSAGE (${channel}) ==
From: ${inbox.sender_name || 'Unknown'}${inbox.subject ? `\nSubject: ${inbox.subject}` : ''}

${inbox.message_body || ''}`)

  if (context?.client) {
    const c = context.client
    parts.push(`== CLIENT ==
Name: ${c.name ?? 'N/A'} | Email: ${c.email ?? 'N/A'} | Phone: ${c.phone ?? 'N/A'} | Nationality: ${c.nationality ?? 'N/A'} | Language: ${c.language ?? 'N/A'} | Bookings: ${c.total_bookings ?? 0}${c.notes ? `\nNotes: ${c.notes}` : ''}`)
  } else {
    parts.push('== CLIENT ==\nNo matching client — possibly a new inquiry.')
  }

  if (Array.isArray(context?.itineraries) && context.itineraries.length > 0) {
    parts.push('== ITINERARIES ==\n' + context.itineraries.map((it: any) =>
      `- ${it.tour_name || 'Untitled'} (${it.reference || 'no ref'}) | ${it.start_date || '?'}→${it.end_date || '?'} | ${it.status || '?'}`).join('\n'))
  }

  if (Array.isArray(context?.recent_messages) && context.recent_messages.length > 0) {
    parts.push(`== RECENT CONVERSATION (newest last) ==\n` + context.recent_messages.map((m: any) =>
      `[${m.direction}] ${m.body}`).join('\n'))
  }

  if (instruction) parts.push(`== OPERATOR INSTRUCTION (apply to all drafts) ==\n${instruction}`)

  parts.push(`Draft the reply options now. Respond ONLY with the JSON object.`)
  return parts.join('\n\n')
}

export function parseDraftOptions(responseText: string, count: number): ParsedOption[] {
  let jsonText = responseText.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  const match = jsonText.match(/\{[\s\S]*\}/)
  if (match) jsonText = match[0]
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }
  const arr = Array.isArray(parsed?.drafts) ? parsed.drafts : []
  const out: ParsedOption[] = []
  for (const d of arr) {
    const body = (d?.draft_body || '').toString().trim()
    if (!body) continue
    const conf = ['high', 'medium', 'low'].includes(d?.confidence) ? d.confidence : 'medium'
    out.push({
      draft_body: body,
      rationale: d?.rationale ? String(d.rationale) : null,
      confidence: conf,
      flags: d && typeof d.flags === 'object' ? d.flags : null,
    })
    if (out.length >= count) break
  }
  return out
}
