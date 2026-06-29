import { describe, it, expect } from 'vitest'
import { getMemoriesForPrompt, type AgentMemory } from '@/lib/agent-memory'

// getMemoriesForPrompt reads via the get_org_agent_memories RPC and formats the
// result into the personalisation block injected into generate-itinerary. Tested
// with a stub supabase client — no DB.

function stubSupabase(result: { data: any; error: any }) {
  return {
    rpc: async (_fn: string, _args: any) => result,
  }
}

const memories: AgentMemory[] = [
  { id: '1', memory_type: 'client_preference', subject_name: 'Acme', content: 'Prefers private tours', confidence: 0.8, observation_count: 3 },
  { id: '2', memory_type: 'pricing_pattern', subject_name: null, content: '32% margin on Siwa tours', confidence: 0.6, observation_count: 2 },
  { id: '3', memory_type: 'supplier_note', subject_name: null, content: 'Sofitel Legend preferred in Aswan', confidence: 0.7, observation_count: 1 },
]

describe('getMemoriesForPrompt', () => {
  it('returns an empty block when there are no memories', async () => {
    const res = await getMemoriesForPrompt({ supabase: stubSupabase({ data: [], error: null }), org_id: 'o1' })
    expect(res.count).toBe(0)
    expect(res.prompt_block).toBe('')
  })

  it('returns an empty block (never throws) when the RPC errors', async () => {
    const res = await getMemoriesForPrompt({ supabase: stubSupabase({ data: null, error: { message: 'boom' } }), org_id: 'o1' })
    expect(res.count).toBe(0)
    expect(res.prompt_block).toBe('')
  })

  it('builds a grouped personalisation block from memories', async () => {
    const res = await getMemoriesForPrompt({ supabase: stubSupabase({ data: memories, error: null }), org_id: 'o1', client_id: 'c1' })
    expect(res.count).toBe(3)
    expect(res.prompt_block).toContain('PERSONALISATION CONTEXT')
    expect(res.prompt_block).toContain('CLIENT PREFERENCES')
    expect(res.prompt_block).toContain('Prefers private tours')
    expect(res.prompt_block).toContain('PRICING PATTERNS')
    expect(res.prompt_block).toContain('32% margin on Siwa tours')
    expect(res.prompt_block).toContain('SUPPLIER PREFERENCES')
    expect(res.prompt_block).toContain('Sofitel Legend preferred in Aswan')
    // No inquiry_pattern memory → that section is omitted
    expect(res.prompt_block).not.toContain('INQUIRY PATTERNS')
  })

  it('passes client_id through as a client subject filter', async () => {
    let capturedArgs: any = null
    const supabase = { rpc: async (_fn: string, args: any) => { capturedArgs = args; return { data: [], error: null } } }
    await getMemoriesForPrompt({ supabase, org_id: 'org-9', client_id: 'client-7' })
    expect(capturedArgs).toMatchObject({ p_org_id: 'org-9', p_subject_id: 'client-7', p_subject_type: 'client' })
  })
})
