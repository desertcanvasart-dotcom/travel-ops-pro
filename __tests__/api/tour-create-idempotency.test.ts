import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, type MockTables } from '../_mock-supabase'

// The tour-create form double-fires ~1s apart in the wild (confirmed in prod:
// two "Memphis, Sakkara & Dahshur Day Trip" templates 989ms apart, codes
// CAI-DAY-828 / CAI-DAY-778). A template's code is generated per request with
// no unique constraint, so the list showed the tour twice. The server is the
// backstop: a create matching one just made returns the existing row, and the
// variations batch skips (template_id, tier) pairs that already exist.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})

const { POST: createTemplate } = await import('@/app/api/tours/templates/route')
const { POST: createVariations } = await import('@/app/api/tours/variations/route')

const req = (body: unknown) =>
  ({ json: async () => body } as unknown as Request & { json: () => Promise<unknown> })

const NOW = new Date().toISOString()

beforeEach(() => setMockTables({} as MockTables))

describe('tour template create idempotency', () => {
  it('returns the existing template when an identical one was just created', async () => {
    setMockTables({
      tour_templates: [
        { id: 'tmpl-1', template_name: 'Memphis Day Trip', tour_type: 'day_tour', created_at: NOW },
      ],
    } as unknown as MockTables)
    const res = await createTemplate(req({ template_name: 'Memphis Day Trip', tour_type: 'day_tour', duration_days: 1 }) as never)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.deduplicated).toBe(true)
    expect(json.data.id).toBe('tmpl-1')
  })

  it('inserts normally when there is no recent twin', async () => {
    setMockTables({ tour_templates: [] } as unknown as MockTables)
    const res = await createTemplate(req({ template_name: 'Brand New Tour', tour_type: 'day_tour', duration_days: 1 }) as never)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.deduplicated).toBeUndefined()
    expect(json.data.template_name).toBe('Brand New Tour')
  })

  it('does not dedupe against a template created outside the window', async () => {
    const old = new Date(Date.now() - 60_000).toISOString()
    setMockTables({
      tour_templates: [{ id: 'old-1', template_name: 'Repeatable', tour_type: 'day_tour', created_at: old }],
    } as unknown as MockTables)
    const res = await createTemplate(req({ template_name: 'Repeatable', tour_type: 'day_tour', duration_days: 1 }) as never)
    const json = await res.json()
    expect(json.deduplicated).toBeUndefined() // a legit same-name tour made later still creates
  })
})

describe('tour variations create idempotency', () => {
  it('skips a (template_id, tier) pair that already exists', async () => {
    setMockTables({
      tour_variations: [{ id: 'var-1', template_id: 'tmpl-1', tier: 'standard', variation_name: 'X - Standard' }],
    } as unknown as MockTables)
    const res = await createVariations(req([{ template_id: 'tmpl-1', tier: 'standard', variation_name: 'X - Standard' }]) as never)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.deduplicated).toBe(true)
  })

  it('inserts a genuinely new tier for the same template', async () => {
    setMockTables({
      tour_variations: [{ id: 'var-1', template_id: 'tmpl-1', tier: 'standard' }],
    } as unknown as MockTables)
    const res = await createVariations(req([{ template_id: 'tmpl-1', tier: 'luxury', variation_name: 'X - Luxury' }]) as never)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.deduplicated).toBeUndefined()
  })
})
