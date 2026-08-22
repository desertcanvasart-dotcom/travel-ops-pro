import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, type MockTables } from '../_mock-supabase'

// ============================================
// Route-level tests for POST /api/ai/generate-itinerary — the largest
// previously-untested code path (~1,050 route lines + service-creation).
// Hermetic: Supabase is the in-memory mock (now with insert/update support),
// the two AI generators are stubbed with deterministic output, and auth is a
// controllable mock. Everything else — validation, idempotency, cruise
// detection, day rules, inclusions building, itinerary INSERT with org
// stamping, land day/service creation — is the REAL code under test.
// ============================================

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})

vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-test-1'),
  noOrgResponse: vi.fn(),
}))

// Deterministic stand-ins for the two Anthropic-backed generators. Their ARGS
// are asserted on (meal-plan mapping etc.); their output shape mirrors the
// real generators' contract.
const FAKE_ITINERARY = () => ({
  trip_name: 'Cairo Test Trip',
  total_days: 2,
  days: [
    { day_number: 1, title: 'Arrival in Cairo', city: 'Cairo', description: 'Arrive and check in.', attractions: [] },
    { day_number: 2, title: 'Giza Pyramids', city: 'Cairo', description: 'Full day at Giza.', attractions: ['Pyramids of Giza'] },
  ],
})

vi.mock('@/lib/ai/prompt-builder', () => ({
  generateFromStructuredInput: vi.fn(async () => FAKE_ITINERARY()),
  generateCreativeItinerary: vi.fn(async () => FAKE_ITINERARY()),
}))

vi.mock('@/lib/ai/language-versions', () => ({
  createLanguageVersions: vi.fn(async () => ({ created: [] })),
}))

vi.mock('@/lib/agent-memory', () => ({
  getMemoriesForPrompt: vi.fn(async () => ({ prompt_block: '', count: 0 })),
  logAgentRun: vi.fn(async () => {}),
}))

import { POST } from '@/app/api/ai/generate-itinerary/route'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { generateCreativeItinerary } from '@/lib/ai/prompt-builder'

const mockedOrgId = vi.mocked(getCurrentOrgId)
const mockedCreative = vi.mocked(generateCreativeItinerary)

function makeRequest(body: Record<string, any>) {
  return { json: async () => body } as any
}

const VALID_BODY = {
  client_name: 'Route Test Client',
  tour_requested: 'Cairo Highlights',
  start_date: '2026-09-01',
  duration_days: 2,
  num_adults: 2,
  cities: ['Cairo'],
}

function seed(extra: MockTables = {}) {
  setMockTables({
    itineraries: [],
    itinerary_days: [],
    itinerary_services: [],
    user_preferences: [],
    communication_threads: [],
    content_library: [],
    attraction_aliases: [],
    entrance_fees: [],
    writing_rules: [],
    ...extra,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedOrgId.mockResolvedValue('org-test-1')
  seed()
})

describe('generate-itinerary route — guards', () => {
  it('403s when there is no organization context', async () => {
    mockedOrgId.mockResolvedValue(null as any)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('400s on an invalid start date', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, start_date: 'not-a-date' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/valid start date/i)
  })

  it('400s when explicit passenger counts total zero', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, num_adults: 0, num_children: 0 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/at least 1 passenger/i)
  })
})

describe('generate-itinerary route — idempotency', () => {
  const EXISTING = {
    id: 'itin-existing-1',
    itinerary_code: 'ITN-S-2026-001',
    trip_name: 'Existing Trip',
    tier: 'standard',
    package_type: 'land-package',
    currency: 'EUR',
    total_days: 3,
    total_cost: 100,
    supplier_cost: 80,
    status: 'draft',
  }

  it('returns the existing itinerary for a repeated idempotency_key without inserting', async () => {
    seed({ itineraries: [{ ...EXISTING, idempotency_key: 'idem-123' }] })
    const res = await POST(makeRequest({ ...VALID_BODY, idempotency_key: 'idem-123' }))
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.deduplicated).toBe(true)
    expect(json.data.id).toBe('itin-existing-1')
    expect(json.data.redirect_to).toBe('/itineraries/itin-existing-1/edit')
    // No second itinerary was created.
    const { data } = await (await import('../_mock-supabase')).createMockClient().from('itineraries').select()
    expect(data).toHaveLength(1)
  })

  it('returns the existing itinerary for a thread resolved from whatsapp_conversation_id', async () => {
    seed({
      communication_threads: [{ id: 'thread-1', whatsapp_conversation_id: 'wa-conv-9' }],
      itineraries: [{ ...EXISTING, thread_id: 'thread-1' }],
    })
    const res = await POST(makeRequest({ ...VALID_BODY, whatsapp_conversation_id: 'wa-conv-9' }))
    const json = await res.json()
    expect(json.data.deduplicated).toBe(true)
    expect(json.data.id).toBe('itin-existing-1')
  })
})

describe('generate-itinerary route — land path end to end (mock DB, stubbed AI)', () => {
  it('creates an org-stamped draft itinerary with days and services', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    const json = await res.json()
    expect(json.success, JSON.stringify(json)).toBe(true)
    expect(json.data.id).toBeTruthy()

    const db = (await import('../_mock-supabase')).createMockClient()
    const { data: itins } = await db.from('itineraries').select()
    expect(itins).toHaveLength(1)
    const itin = itins![0]
    // The two invariants that recent incidents made non-negotiable:
    expect(itin.org_id, 'every itinerary INSERT must stamp org_id').toBe('org-test-1')
    expect(itin.status).toBe('draft')
    expect(itin.total_days).toBe(2)
    expect(itin.end_date).toBe('2026-09-02')
    // Unpriced-by-default harness: no caller opt-in => totals stay 0.
    expect(itin.total_cost).toBe(0)

    const { data: days } = await db.from('itinerary_days').select()
    expect(days).toHaveLength(2)
    expect(days!.map((d: any) => d.day_number).sort()).toEqual([1, 2])
    expect(days![0].itinerary_id).toBe(itin.id)
  })

  it('keeps the billing currency whatever the passport — a Euro passport no longer forces EUR', async () => {
    // Until 2026-08-22 a Euro-passport nationality silently rewrote the trip's
    // currency to EUR. For an operator that bills in yen that mislabelled the
    // quote; passport only selects the EU / non-EU price tier now.
    const res = await POST(
      makeRequest({ ...VALID_BODY, nationality: 'German', currency: 'USD' })
    )
    expect((await res.json()).success).toBe(true)
    const db = (await import('../_mock-supabase')).createMockClient()
    const { data: itins } = await db.from('itineraries').select()
    expect(itins![0].currency).toBe('USD')
  })

  it('maps meal_plan HB to lunch=true dinner=false when not explicitly set', async () => {
    await POST(makeRequest({ ...VALID_BODY, meal_plan: 'HB' }))
    expect(mockedCreative).toHaveBeenCalledTimes(1)
    const args = mockedCreative.mock.calls[0][0] as any
    expect(args.includeLunch).toBe(true)
    expect(args.includeDinner).toBe(false)
  })

  it('honors explicit include_lunch=false over the meal plan', async () => {
    await POST(makeRequest({ ...VALID_BODY, meal_plan: 'FB', include_lunch: false }))
    const args = mockedCreative.mock.calls[0][0] as any
    expect(args.includeLunch).toBe(false)
    expect(args.includeDinner).toBe(true)
  })

  it('stores the thread pointer on the created itinerary', async () => {
    seed({ communication_threads: [{ id: 'thread-7', whatsapp_conversation_id: 'wa-77' }] })
    const res = await POST(makeRequest({ ...VALID_BODY, whatsapp_conversation_id: 'wa-77' }))
    expect((await res.json()).success).toBe(true)
    const db = (await import('../_mock-supabase')).createMockClient()
    const { data: itins } = await db.from('itineraries').select()
    expect(itins![0].thread_id).toBe('thread-7')
  })
})
