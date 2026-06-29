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

// A supabase stub whose itinerary read returns an empty list (search tool path).
const supabaseStub: any = {
  from: () => ({
    select: () => ({
      eq: () => ({ order: () => ({ limit: () => ({ data: [], error: null }) }) }),
    }),
  }),
}

beforeEach(() => createMock.mockReset())

describe('AGENT_TOOLS', () => {
  it('exposes only the read-only tool set (no send/create tools)', () => {
    const names = AGENT_TOOLS.map((t) => t.name).sort()
    expect(names).toEqual(['escalate_to_human', 'lookup_itinerary', 'search_customer_trips'])
    expect(names).not.toContain('send_quote_to_customer')
    expect(names).not.toContain('create_trip_inquiry')
    expect(names).not.toContain('check_availability')
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
})
