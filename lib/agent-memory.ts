// ============================================================
// lib/agent-memory.ts
//
// Agent Memory Service — reads memories (for prompt injection) and writes
// new memories (from the feedback-loop cron). Ported from the sibling app
// (autoura-saas) and adapted to this app's ORG multi-tenancy (org_id).
//
// Used by:
//   - app/api/ai/generate-itinerary/route.ts (read + inject + logAgentRun)
//   - app/api/cron/process-agent-memory/route.ts (write)
// ============================================================

// ============================================================
// TYPES
// ============================================================

export type MemoryType =
  | 'client_preference'
  | 'pricing_pattern'
  | 'inquiry_pattern'
  | 'supplier_note'

export type SubjectType = 'client' | 'supplier' | 'tour_type' | 'destination'

export interface AgentMemory {
  id: string
  memory_type: MemoryType
  subject_name: string | null
  content: string
  confidence: number
  observation_count: number
}

export interface WriteMemoryInput {
  org_id: string
  memory_type: MemoryType
  content: string
  subject_id?: string | null
  subject_type?: SubjectType | null
  subject_name?: string | null
  confidence?: number
  expires_in_days?: number | null // null = pinned
}

export interface MemoryInjectionResult {
  memories: AgentMemory[]
  prompt_block: string // Ready to append to system prompt
  count: number
}

// ============================================================
// READ: GET MEMORIES FOR PROMPT INJECTION
// Called at the start of every generate-itinerary invocation.
// ============================================================

export async function getMemoriesForPrompt(params: {
  supabase: any
  org_id: string
  client_id?: string | null
  min_confidence?: number
}): Promise<MemoryInjectionResult> {
  const { supabase, org_id, client_id, min_confidence = 0.3 } = params

  const empty: MemoryInjectionResult = {
    memories: [],
    prompt_block: '',
    count: 0,
  }

  try {
    const { data: memories, error } = await supabase.rpc(
      'get_org_agent_memories',
      {
        p_org_id: org_id,
        p_subject_id: client_id || null,
        p_subject_type: client_id ? 'client' : null,
        p_min_confidence: min_confidence,
        p_limit: 20,
      }
    )

    if (error || !memories || memories.length === 0) {
      return empty
    }

    const prompt_block = buildMemoryPromptBlock(memories as AgentMemory[])

    return {
      memories: memories as AgentMemory[],
      prompt_block,
      count: memories.length,
    }
  } catch (err) {
    console.error('⚠️ agent-memory: failed to fetch memories:', err)
    return empty
  }
}

// ============================================================
// PROMPT BLOCK BUILDER
// Formats memories into a clean section for the system prompt.
// ============================================================

function buildMemoryPromptBlock(memories: AgentMemory[]): string {
  if (memories.length === 0) return ''

  const grouped: Record<MemoryType, AgentMemory[]> = {
    client_preference: [],
    pricing_pattern: [],
    inquiry_pattern: [],
    supplier_note: [],
  }

  memories.forEach((m) => {
    if (grouped[m.memory_type]) grouped[m.memory_type].push(m)
  })

  const sections: string[] = []

  if (grouped.client_preference.length > 0) {
    sections.push(
      '=== CLIENT PREFERENCES (learned from past bookings) ===\n' +
        grouped.client_preference.map((m) => `• ${m.content}`).join('\n')
    )
  }

  if (grouped.pricing_pattern.length > 0) {
    sections.push(
      "=== PRICING PATTERNS (this operator's typical approach) ===\n" +
        grouped.pricing_pattern.map((m) => `• ${m.content}`).join('\n')
    )
  }

  if (grouped.inquiry_pattern.length > 0) {
    sections.push(
      "=== INQUIRY PATTERNS (what this operator's clients typically want) ===\n" +
        grouped.inquiry_pattern.map((m) => `• ${m.content}`).join('\n')
    )
  }

  if (grouped.supplier_note.length > 0) {
    sections.push(
      "=== SUPPLIER PREFERENCES (this operator's preferred suppliers) ===\n" +
        grouped.supplier_note.map((m) => `• ${m.content}`).join('\n')
    )
  }

  if (sections.length === 0) return ''

  return (
    '\n\n' +
    '═══════════════════════════════════════════════════════════════\n' +
    '🧠 PERSONALISATION CONTEXT (use this to improve recommendations)\n' +
    '═══════════════════════════════════════════════════════════════\n' +
    sections.join('\n\n') +
    '\n' +
    'Apply these patterns when making decisions about itinerary structure,\n' +
    'supplier selection, and pricing. Do not contradict explicit client requests.\n' +
    '═══════════════════════════════════════════════════════════════'
  )
}

// ============================================================
// WRITE: UPSERT A MEMORY
// If a similar memory already exists for this org, reinforce it
// (raise confidence + increment observation_count). Otherwise insert.
// ============================================================

export async function writeMemory(
  supabaseAdmin: any,
  input: WriteMemoryInput
): Promise<{ success: boolean; memory_id?: string; action?: 'created' | 'reinforced' }> {
  try {
    const {
      org_id,
      memory_type,
      content,
      subject_id = null,
      subject_type = null,
      subject_name = null,
      confidence = 0.5,
      expires_in_days = 365,
    } = input

    const expires_at =
      expires_in_days === null
        ? null
        : new Date(Date.now() + expires_in_days * 86400 * 1000).toISOString()

    // Check if a similar memory already exists (same org + type + subject).
    let existingQuery = supabaseAdmin
      .from('agent_memory')
      .select('id, confidence, observation_count, content')
      .eq('org_id', org_id)
      .eq('memory_type', memory_type)
      .ilike('content', `%${content.substring(0, 50)}%`) // fuzzy match on first 50 chars
      .limit(1)
    existingQuery = subject_id
      ? existingQuery.eq('subject_id', subject_id)
      : existingQuery.is('subject_id', null)
    const { data: existing } = await existingQuery.single()

    if (existing) {
      // Reinforce: raise confidence (capped at 0.95), increment observation count
      const new_confidence = Math.min(existing.confidence + 0.1, 0.95)
      const new_count = existing.observation_count + 1

      await supabaseAdmin
        .from('agent_memory')
        .update({
          confidence: new_confidence,
          observation_count: new_count,
          expires_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      return { success: true, memory_id: existing.id, action: 'reinforced' }
    }

    // Create new memory
    const { data: created, error } = await supabaseAdmin
      .from('agent_memory')
      .insert({
        org_id,
        memory_type,
        content,
        subject_id,
        subject_type,
        subject_name,
        confidence,
        observation_count: 1,
        expires_at,
      })
      .select('id')
      .single()

    if (error) {
      console.error('⚠️ agent-memory: failed to write memory:', error)
      return { success: false }
    }

    return { success: true, memory_id: created.id, action: 'created' }
  } catch (err) {
    console.error('⚠️ agent-memory: unexpected error in writeMemory:', err)
    return { success: false }
  }
}

// ============================================================
// FEEDBACK LOOP: ANALYSE A COMPLETED AGENT RUN
// Called by the cron after each successful itinerary run. Extracts
// learnable patterns heuristically and writes them to agent_memory.
// ============================================================

export async function processRunForMemory(params: {
  supabaseAdmin: any
  org_id: string
  itinerary_id: string
  client_id?: string | null
}): Promise<{ memories_written: number }> {
  const { supabaseAdmin, org_id, itinerary_id, client_id } = params
  let memories_written = 0

  try {
    // Fetch the completed itinerary with its services. Select '*' on the nested
    // relations so a column this app doesn't have never errors the whole read —
    // missing fields simply skip their pattern below.
    const { data: itinerary } = await supabaseAdmin
      .from('itineraries')
      .select('*, clients(*), itinerary_services(*), itinerary_days(*)')
      .eq('id', itinerary_id)
      .eq('org_id', org_id)
      .single()

    if (!itinerary) return { memories_written: 0 }

    const writes: WriteMemoryInput[] = []

    // PATTERN 1: Pricing pattern (margin) — a non-default margin is a signal.
    if (itinerary.margin_percent && itinerary.margin_percent !== 25) {
      const packageLabel = itinerary.package_type || 'tours'
      const tierLabel = itinerary.tier || 'standard'
      const cities = [
        ...new Set((itinerary.itinerary_days || []).map((d: any) => d.city || d.overnight_city)),
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(', ')

      writes.push({
        org_id,
        memory_type: 'pricing_pattern',
        content: `This operator typically applies ${itinerary.margin_percent}% margin on ${tierLabel} ${packageLabel} tours${cities ? ` covering ${cities}` : ''}.`,
        confidence: 0.4,
        expires_in_days: 365,
      })
    }

    // PATTERN 2: Language / nationality preference.
    if (itinerary.language && itinerary.language !== 'English') {
      writes.push({
        org_id,
        memory_type: 'inquiry_pattern',
        content: `A significant portion of this operator's inquiries require a ${itinerary.language}-speaking guide. Prefer ${itinerary.language} guides when language is unspecified.`,
        confidence: 0.35,
        expires_in_days: 365,
      })
    }

    // PATTERN 3: Client-specific preference (if client is known).
    const effective_client_id = client_id || itinerary.client_id
    if (effective_client_id && itinerary.clients) {
      const client = itinerary.clients as any
      const clientName =
        client.full_name ||
        [client.first_name, client.last_name].filter(Boolean).join(' ').trim() ||
        client.name ||
        'This client'

      if (itinerary.tier) {
        writes.push({
          org_id,
          memory_type: 'client_preference',
          content: `${clientName} has booked ${itinerary.tier}-tier tours. Apply ${itinerary.tier} tier by default for future requests from this client.`,
          subject_id: effective_client_id,
          subject_type: 'client',
          subject_name: clientName,
          confidence: 0.4,
          expires_in_days: 365,
        })
      }

      const total_pax = (itinerary.num_adults || 0) + (itinerary.num_children || 0)
      if (total_pax > 0) {
        writes.push({
          org_id,
          memory_type: 'client_preference',
          content: `${clientName} typically books for groups of ${total_pax} people.`,
          subject_id: effective_client_id,
          subject_type: 'client',
          subject_name: clientName,
          confidence: 0.35,
          expires_in_days: 365,
        })
      }
    }

    // PATTERN 4: Supplier note (preferred accommodation suppliers).
    const supplierCounts: Record<string, number> = {}
    ;(itinerary.itinerary_services || []).forEach((svc: any) => {
      if (svc.supplier_name && svc.service_type === 'accommodation') {
        supplierCounts[svc.supplier_name] = (supplierCounts[svc.supplier_name] || 0) + 1
      }
    })

    for (const [supplierName, count] of Object.entries(supplierCounts)) {
      if (count >= 1) {
        const cities = (itinerary.itinerary_days || [])
          .filter((d: any) => !d.is_cruise_day)
          .map((d: any) => d.city)
          .filter(Boolean)[0]

        writes.push({
          org_id,
          memory_type: 'supplier_note',
          content: `${supplierName} is a preferred hotel supplier${cities ? ` in ${cities}` : ''} for this operator.`,
          confidence: 0.4,
          expires_in_days: 365,
        })
      }
    }

    for (const memoryInput of writes) {
      const result = await writeMemory(supabaseAdmin, memoryInput)
      if (result.success) memories_written++
    }

    return { memories_written }
  } catch (err) {
    console.error('⚠️ agent-memory: processRunForMemory failed:', err)
    return { memories_written: 0 }
  }
}

// ============================================================
// LOG AGENT RUN (audit + feedback-loop source)
// Call this after every successful generate-itinerary invocation.
// ============================================================

export async function logAgentRun(params: {
  supabase: any
  org_id: string
  agent_type: 'itinerary' | 'pricing'
  triggered_by: string | null
  itinerary_id?: string | null
  input_summary?: string
  output_summary?: string
  tokens_used?: number
  duration_ms?: number
  memories_injected?: number
  status?: 'success' | 'failed' | 'quota_exceeded'
}): Promise<string | null> {
  try {
    const { data, error } = await params.supabase
      .from('agent_runs')
      .insert({
        org_id:            params.org_id,
        agent_type:        params.agent_type,
        triggered_by:      params.triggered_by,
        itinerary_id:      params.itinerary_id || null,
        input_summary:     params.input_summary || null,
        output_summary:    params.output_summary || null,
        tokens_used:       params.tokens_used || null,
        duration_ms:       params.duration_ms || null,
        memories_injected: params.memories_injected || 0,
        status:            params.status || 'success',
      })
      .select('id')
      .single()

    if (error) {
      console.error('⚠️ agent-memory: failed to log agent run:', error)
      return null
    }

    return data.id
  } catch (err) {
    console.error('⚠️ agent-memory: logAgentRun unexpected error:', err)
    return null
  }
}
