// ============================================================
// WHATSAPP AI AGENT (draft-gated)
// ============================================================
// Ported/adapted from the sibling app (autoura-saas). The sibling agent
// AUTO-SENDS replies; this app runs it DRAFT-GATED — it composes a SUGGESTED
// reply using read-only tools over the org's data, and the caller stores that
// as a draft for an operator to review and send. The agent never sends.
//
// Adaptations vs the sibling:
//   • Org-scoped (the caller passes an RLS-scoped supabase client; tools query
//     this org's rows only).
//   • Read-only tools only — search_customer_trips, lookup_itinerary,
//     escalate_to_human. The sibling's send_quote_to_customer /
//     request_quote_for_trip / create_trip_inquiry (mutating/sending) are
//     intentionally omitted (draft-gated). check_availability is included now
//     that operator_capacity / tour_departures exist.
//   • Uses this app's Anthropic client + MODEL_DRAFT.
// ============================================================

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAnthropicClient } from '@/lib/ai/anthropic-client'
import { MODEL_DRAFT } from '@/lib/ai/models'
import { determineCapacityResult, type CapacityDayDetail } from '@/lib/capacity-availability'

// ============================================================
// TYPES
// ============================================================

export interface ConversationContext {
  clientId: string | null
  clientName: string | null
  phoneNumber: string
  conversationId: string
  recentMessages: Array<{ direction: 'inbound' | 'outbound'; content: string; timestamp: string }>
  clientInfo?: {
    fullName: string | null
    email: string | null
    nationality: string | null
    preferredLanguage: string | null
  }
  activeItineraries?: Array<{
    id: string
    tripName: string
    startDate: string
    endDate: string
    status: string
    totalDays: number
  }>
}

export interface AIAgentResponse {
  success: boolean
  reply?: string
  shouldRespond: boolean
  confidence: number
  escalate: boolean
  reasoning?: string
  error?: string
  toolsUsed?: string[]
}

interface ToolResult {
  success: boolean
  data?: any
  error?: string
  message?: string
}

// ============================================================
// TOOL DEFINITIONS (read-only)
// ============================================================

const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'search_customer_trips',
    description:
      "Look up the customer's existing itineraries/bookings (by the linked client). Use when the customer asks about their trip, booking, dates, or status.",
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: "Optional status filter: 'draft', 'confirmed', 'in_progress', or omit for all active.",
        },
      },
    },
  },
  {
    name: 'lookup_itinerary',
    description:
      'Get the day-by-day details and pricing of one specific itinerary by id (ids come from search_customer_trips). Use when the customer asks for specifics of a particular trip.',
    input_schema: {
      type: 'object',
      properties: {
        itinerary_id: { type: 'string', description: 'The itinerary id to fetch.' },
      },
      required: ['itinerary_id'],
    },
  },
  {
    name: 'check_availability',
    description:
      "Check whether the operator has capacity for travel dates (and optionally scheduled group departures). Use when the customer asks if specific dates work or about joining a group tour. Returns an availability verdict and a customer-friendly message — relay its meaning, don't promise beyond it.",
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'First travel date, YYYY-MM-DD.' },
        end_date: { type: 'string', description: 'Last travel date, YYYY-MM-DD. Omit for a single day.' },
        group_size: { type: 'number', description: 'Number of travellers (defaults to 1).' },
        check_departures: { type: 'boolean', description: 'If true, also look for scheduled group tour departures in the range.' },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Flag this conversation for a human operator. Use for complaints, cancellations, refunds, urgent/same-day matters, anything involving money you are unsure about, or when the customer explicitly asks for a person.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short reason for escalation.' },
      },
      required: ['reason'],
    },
  },
]

// ============================================================
// TOOL EXECUTOR (org-scoped via the RLS client the caller passes)
// ============================================================

class ToolExecutor {
  escalated = false
  escalationReason: string | null = null

  constructor(
    private supabase: SupabaseClient,
    private clientId: string | null
  ) {}

  async execute(toolName: string, toolInput: any): Promise<ToolResult> {
    switch (toolName) {
      case 'search_customer_trips':
        return this.searchCustomerTrips(toolInput)
      case 'lookup_itinerary':
        return this.lookupItinerary(toolInput)
      case 'check_availability':
        return this.checkAvailability(toolInput)
      case 'escalate_to_human':
        return this.escalateToHuman(toolInput)
      default:
        return { success: false, error: `Unknown tool: ${toolName}` }
    }
  }

  private async searchCustomerTrips(input: { status?: string }): Promise<ToolResult> {
    if (!this.clientId) {
      return { success: true, data: [], message: 'No linked client for this conversation yet.' }
    }
    try {
      let q = this.supabase
        .from('itineraries')
        .select('id, trip_name, start_date, end_date, status, total_days, currency, total_cost')
        .eq('client_id', this.clientId)
        .order('start_date', { ascending: false })
        .limit(5)
      if (input?.status) q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) return { success: false, error: error.message }
      return { success: true, data: data || [] }
    } catch (err: any) {
      return { success: false, error: err?.message || 'search failed' }
    }
  }

  private async lookupItinerary(input: { itinerary_id: string }): Promise<ToolResult> {
    if (!input?.itinerary_id) return { success: false, error: 'itinerary_id is required' }
    try {
      const { data, error } = await this.supabase
        .from('itineraries')
        .select('id, trip_name, start_date, end_date, status, total_days, currency, total_cost, itinerary_days(day_number, city, title)')
        .eq('id', input.itinerary_id)
        .single()
      if (error) return { success: false, error: error.message }
      return { success: true, data }
    } catch (err: any) {
      return { success: false, error: err?.message || 'lookup failed' }
    }
  }

  private async checkAvailability(input: {
    start_date: string
    end_date?: string
    group_size?: number
    check_departures?: boolean
  }): Promise<ToolResult> {
    const start = (input?.start_date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return { success: false, error: 'start_date must be YYYY-MM-DD' }
    }
    const end = input?.end_date && /^\d{4}-\d{2}-\d{2}$/.test(input.end_date) ? input.end_date : start
    const groupSize = Math.max(1, Number(input?.group_size) || 1)

    try {
      // Capacity rows for the range (RLS scopes operator_capacity to the org).
      const { data: rows } = await this.supabase
        .from('operator_capacity')
        .select('date, status, max_groups, booked_groups, reason')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })

      const byDate = new Map<string, any>()
      for (const r of rows || []) byDate.set(r.date, r)

      // Expand the range; a date with no row defaults to available (3 groups).
      const details: CapacityDayDetail[] = []
      const cur = new Date(start)
      const endD = new Date(end)
      while (cur <= endD) {
        const d = cur.toISOString().split('T')[0]
        const row = byDate.get(d)
        details.push(
          row
            ? { date: d, status: row.status, available_slots: row.max_groups - row.booked_groups, reason: row.reason }
            : { date: d, status: 'available', available_slots: 3 - groupSize }
        )
        cur.setDate(cur.getDate() + 1)
      }

      const availability = determineCapacityResult(details, groupSize)

      // Optionally surface bookable scheduled departures in the range.
      let departures: any[] = []
      if (input?.check_departures) {
        const { data: deps } = await this.supabase
          .from('tour_departures')
          .select('id, tour_name, tour_code, start_date, end_date, max_pax, booked_pax, min_pax, status, is_guaranteed, price_per_person, currency')
          .gte('start_date', start)
          .lte('start_date', end)
          .in('status', ['open', 'limited', 'guaranteed'])
          .order('start_date', { ascending: true })
          .limit(5)
        departures = (deps || []).filter((dp: any) => dp.max_pax - dp.booked_pax >= groupSize)
      }

      return { success: true, data: { availability, departures }, message: availability.message }
    } catch (err: any) {
      return { success: false, error: err?.message || 'availability check failed' }
    }
  }

  private async escalateToHuman(input: { reason: string }): Promise<ToolResult> {
    this.escalated = true
    this.escalationReason = input?.reason || 'unspecified'
    return { success: true, message: 'Flagged for a human operator.', data: { reason: this.escalationReason } }
  }
}

// ============================================================
// AGENT
// ============================================================

export class WhatsAppAIAgent {
  private anthropic: Anthropic
  private businessName: string
  private modelId: string
  private maxToolIterations = 3

  constructor(opts?: { businessName?: string; model?: string }) {
    this.anthropic = getAnthropicClient()
    this.businessName = opts?.businessName || process.env.BUSINESS_NAME || 'Travel2Egypt'
    this.modelId = opts?.model || MODEL_DRAFT
  }

  // Build a ConversationContext from this app's WhatsApp + CRM tables.
  async gatherContext(
    supabase: SupabaseClient,
    conversationId: string,
    clientId: string | null,
    phoneNumber: string
  ): Promise<ConversationContext> {
    const context: ConversationContext = {
      clientId,
      clientName: null,
      phoneNumber,
      conversationId,
      recentMessages: [],
    }

    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('direction, message_body, sent_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(10)

    if (messages) {
      context.recentMessages = messages
        .reverse()
        .map((m: any) => ({
          direction: m.direction as 'inbound' | 'outbound',
          content: m.message_body || '',
          timestamp: m.sent_at,
        }))
    }

    if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('full_name, first_name, last_name, email, nationality, preferred_language')
        .eq('id', clientId)
        .single()

      if (client) {
        const name =
          (client as any).full_name ||
          [(client as any).first_name, (client as any).last_name].filter(Boolean).join(' ').trim() ||
          null
        context.clientName = name
        context.clientInfo = {
          fullName: name,
          email: (client as any).email ?? null,
          nationality: (client as any).nationality ?? null,
          preferredLanguage: (client as any).preferred_language ?? null,
        }
      }

      const { data: itineraries } = await supabase
        .from('itineraries')
        .select('id, trip_name, start_date, end_date, status, total_days')
        .eq('client_id', clientId)
        .in('status', ['draft', 'confirmed', 'in_progress'])
        .order('start_date', { ascending: true })
        .limit(3)

      if (itineraries) {
        context.activeItineraries = itineraries.map((i: any) => ({
          id: i.id,
          tripName: i.trip_name,
          startDate: i.start_date,
          endDate: i.end_date,
          status: i.status,
          totalDays: i.total_days,
        }))
      }
    }

    return context
  }

  private buildSystemPrompt(context: ConversationContext): string {
    const currentTime = new Date().toLocaleString('en-US', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'full',
      timeStyle: 'short',
    })

    let systemPrompt = `You are ${this.businessName}'s WhatsApp assistant for travel inquiries to Egypt.

CURRENT TIME: ${currentTime} (Cairo time)

YOUR ROLE:
- DRAFT a reply to the customer's latest WhatsApp message. Your reply is a SUGGESTION an operator will review and send — you do NOT send anything yourself.
- Help with questions about Egypt tours and about the customer's existing bookings.
- Be warm, helpful, professional. Keep it concise (WhatsApp — max 2-3 short paragraphs). Use emojis sparingly.
- Reply in the same language the customer uses.

TOOLS (read-only):
- search_customer_trips — find the customer's existing itineraries/bookings.
- lookup_itinerary — get the details of one specific itinerary.
- check_availability — check if travel dates work (and optionally group departures). Use before answering "are these dates available?".
- escalate_to_human — flag for a human. Use for complaints, cancellations, refunds, urgent/same-day matters, anything money-related you're unsure about, or an explicit request for a person.

GUIDELINES:
- Never invent prices, availability, or booking details. If you don't have it, say you'll check and get back to them (and escalate if appropriate).
- Don't promise discounts, refunds, or policy exceptions — escalate those.
- Use the tools to ground your reply in real data before answering about a specific trip.
`

    if (context.clientInfo) {
      systemPrompt += `\nCUSTOMER INFORMATION:
- Name: ${context.clientInfo.fullName || 'Unknown'}
- Email: ${context.clientInfo.email || 'Not provided'}
- Nationality: ${context.clientInfo.nationality || 'Unknown'}
- Preferred Language: ${context.clientInfo.preferredLanguage || 'English'}
`
    } else {
      systemPrompt += `\nCUSTOMER: New/Unknown customer (phone: ${context.phoneNumber})\n`
    }

    if (context.activeItineraries && context.activeItineraries.length > 0) {
      systemPrompt += `\nACTIVE BOOKINGS:\n`
      context.activeItineraries.forEach((it) => {
        const startDate = it.startDate ? new Date(it.startDate).toLocaleDateString('en-GB') : '?'
        const endDate = it.endDate ? new Date(it.endDate).toLocaleDateString('en-GB') : '?'
        systemPrompt += `- ${it.tripName} (${startDate} - ${endDate}, ${it.totalDays} days, Status: ${it.status})\n`
      })
    }

    return systemPrompt
  }

  /**
   * Generate a SUGGESTED reply for the latest inbound message. Runs a bounded
   * Claude tool-use loop over the read-only tools. Never sends.
   */
  async generateResponse(
    incomingMessage: string,
    context: ConversationContext,
    supabase: SupabaseClient
  ): Promise<AIAgentResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt(context)

      const messages: Anthropic.Messages.MessageParam[] = []
      for (const msg of context.recentMessages.slice(-6)) {
        messages.push({ role: msg.direction === 'inbound' ? 'user' : 'assistant', content: msg.content })
      }
      messages.push({ role: 'user', content: incomingMessage })

      const toolExecutor = new ToolExecutor(supabase, context.clientId)
      const toolsUsed: string[] = []
      let currentMessages = [...messages]
      let iterations = 0

      while (iterations < this.maxToolIterations) {
        iterations++

        const response = await this.anthropic.messages.create({
          model: this.modelId,
          max_tokens: 1024,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: currentMessages,
          tools: AGENT_TOOLS,
        })

        if (response.stop_reason === 'tool_use') {
          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
          )
          currentMessages.push({ role: 'assistant', content: response.content })

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
          for (const toolUse of toolUseBlocks) {
            toolsUsed.push(toolUse.name)
            const result = await toolExecutor.execute(toolUse.name, toolUse.input)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            })
          }
          currentMessages.push({ role: 'user', content: toolResults })
          continue
        }

        // Finished — extract the reply text.
        const reply = response.content
          .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim()

        let confidence = response.stop_reason === 'end_turn' ? 0.9 : 0.7
        if (toolsUsed.length > 0) confidence = Math.min(confidence + 0.05, 0.95)

        return {
          success: true,
          reply,
          shouldRespond: reply.length > 0,
          confidence,
          escalate: toolExecutor.escalated,
          reasoning: `Generated with ${toolsUsed.length} tool call(s)${toolExecutor.escalated ? ` — escalated: ${toolExecutor.escalationReason}` : ''}`,
          toolsUsed,
        }
      }

      // Hit the iteration cap without a final answer.
      return {
        success: true,
        reply: '',
        shouldRespond: false,
        confidence: 0.5,
        escalate: true,
        reasoning: 'Tool loop hit the iteration cap — escalating for a human.',
        toolsUsed,
      }
    } catch (error: any) {
      console.error('WhatsApp AI agent error:', error)
      return { success: false, shouldRespond: false, confidence: 0, escalate: false, error: error?.message }
    }
  }
}

// Exported for tests / external inspection.
export { AGENT_TOOLS }
