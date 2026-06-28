import { describe, it, expect, vi, beforeEach } from 'vitest'

// Scripted Anthropic client: each messages.create() call returns the next queued
// response. Lets us drive the tool-use loop deterministically (no network).
const createMock = vi.fn()
vi.mock('@/lib/ai/anthropic-client', () => ({
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}))

import { WhatsAppAIAgent, AGENT_TOOLS } from '@/lib/ai/whatsapp-ai-agent'
import type { ConversationContext } from '@/lib/ai/whatsapp-ai-agent'

const ctx: ConversationContext = {
  clientId: 'client-1',
  clientName: 'Acme',
  phoneNumber: '+201234567890',
  conversationId: 'conv-1',
  recentMessages: [{ direction: 'inbound', content: 'Hi', timestamp: '2026-06-28T10:00:00Z' }],
}

// A thenable query-builder stub: every chained method returns the builder, and
// awaiting it (or calling single/maybeSingle) resolves to { data, error }.
// `dataByTable` lets a test return rows for a specific table.
function makeSupabaseStub(dataByTable: Record<string, any[]> = {}): any {
  const build = (data: any[]) => {
    const b: any = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit']) b[m] = () => b
    b.single = () => Promise.resolve({ data: data[0] ?? null, error: null })
    b.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error: null })
    b.then = (resolve: any) => resolve({ data, error: null })
    return b
  }
  return { from: (table: string) => build(dataByTable[table] ?? []) }
}

const supabaseStub: any = makeSupabaseStub()

beforeEach(() => createMock.mockReset())

describe('AGENT_TOOLS', () => {
  it('exposes only the read-only tool set (no send/create tools)', () => {
    const names = AGENT_TOOLS.map((t) => t.name).sort()
    expect(names).toEqual(['check_availability', 'escalate_to_human', 'lookup_itinerary', 'search_customer_trips'])
    expect(names).not.toContain('send_quote_to_customer')
    expect(names).not.toContain('create_trip_inquiry')
  })
})

describe('WhatsAppAIAgent.generateResponse', () => {
  it('runs the tool loop, sets escalate when escalate_to_human is called, and returns the reply', async () => {
    createMock
      // Round 1: the model calls escalate_to_human
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu1', name: 'escalate_to_human', input: { reason: 'refund request' } }],
      })
      // Round 2: the model produces the final draft text
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: "I'll have a colleague follow up on your refund shortly." }],
      })

    const agent = new WhatsAppAIAgent()
    const res = await agent.generateResponse('I want a refund', ctx, supabaseStub)

    expect(res.success).toBe(true)
    expect(res.reply).toContain('refund')
    expect(res.escalate).toBe(true)
    expect(res.toolsUsed).toContain('escalate_to_human')
    expect(createMock).toHaveBeenCalledTimes(2)
  })

  it('returns a reply with no escalation for a simple end_turn', async () => {
    createMock.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hello! How can I help with your Egypt trip? 🐫' }],
    })

    const agent = new WhatsAppAIAgent()
    const res = await agent.generateResponse('Hi', ctx, supabaseStub)

    expect(res.success).toBe(true)
    expect(res.escalate).toBe(false)
    expect(res.shouldRespond).toBe(true)
    expect(res.toolsUsed).toEqual([])
  })

  it('never throws on an API error — returns a failed result', async () => {
    createMock.mockRejectedValueOnce(new Error('boom'))
    const agent = new WhatsAppAIAgent()
    const res = await agent.generateResponse('Hi', ctx, supabaseStub)
    expect(res.success).toBe(false)
    expect(res.shouldRespond).toBe(false)
  })

  it('runs check_availability against operator_capacity and completes', async () => {
    createMock
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu1', name: 'check_availability', input: { start_date: '2026-07-01', group_size: 2 } }],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Those dates work — shall I hold them?' }],
      })

    // operator_capacity returns a blackout for the requested date.
    const supa = makeSupabaseStub({
      operator_capacity: [{ date: '2026-07-01', status: 'blackout', max_groups: 3, booked_groups: 0, reason: 'holiday' }],
    })

    const agent = new WhatsAppAIAgent()
    const res = await agent.generateResponse('Are the 1st of July dates open?', ctx, supa)

    expect(res.success).toBe(true)
    expect(res.toolsUsed).toContain('check_availability')
    expect(res.reply).toContain('hold them')
  })
})
