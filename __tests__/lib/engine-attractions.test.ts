import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// The A.T.S programmes describe each day's sights in Japanese sentences.
// Three ways such a day now reaches an entrance ticket:
//   - the wording is in attraction_aliases            → priced
//   - the day carries the fee row's id (picker)        → priced, wording ignored
//   - neither                                          → warned, as before

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0 }
const JA = 'スフィンクスと河岸神殿見学'

function tablesWith(day1: Record<string, unknown>, aliases: { alias: string; canonical_name: string }[] = []) {
  const t = fullRateTables() as any
  t.tour_templates[0].itinerary[0] = { ...t.tour_templates[0].itinerary[0], ...day1 }
  t.attraction_aliases = aliases.map((a, i) => ({ id: `al-${i}`, source_table: 'entrance_fees', is_active: true, ...a }))
  return t
}

const ticketLines = (r: any) => (r.services ?? []).filter((s: any) => s.serviceType === 'entrance')

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('engine entrance tickets', () => {
  it('English wording still prices the way it did', async () => {
    setMockTables(tablesWith({ attractions: ['Giza Plateau'] }))
    const r = await calculateAutoPricing({ ...BASE, numPax: 2 })
    expect(ticketLines(r).map((s: any) => [s.serviceName, s.unitCost])).toEqual([['Giza Plateau', 30]])
  })

  it('Japanese wording prices nothing until the alias table knows it', async () => {
    setMockTables(tablesWith({ attractions: [JA] }))
    const r = await calculateAutoPricing({ ...BASE, numPax: 2 })
    expect(ticketLines(r)).toEqual([])
    expect(r.warnings).toContain(`No entrance fee found for "${JA}"`)
  })

  it('…and prices through attraction_aliases once it does', async () => {
    setMockTables(tablesWith({ attractions: [JA] }, [{ alias: JA, canonical_name: 'Giza Plateau' }]))
    const r = await calculateAutoPricing({ ...BASE, numPax: 2 })
    expect(ticketLines(r).map((s: any) => [s.serviceName, s.unitCost])).toEqual([['Giza Plateau', 30]])
    expect(r.warnings.some((w: string) => w.includes('No entrance fee'))).toBe(false)
  })

  it('a picked fee id prices the ticket and leaves the wording to the documents', async () => {
    setMockTables(tablesWith({ attractions: ['何か別の文章'], attraction_ids: ['ent-giza'] }))
    const r = await calculateAutoPricing({ ...BASE, numPax: 2 })
    expect(ticketLines(r).map((s: any) => [s.serviceName, s.unitCost, s.dayNumber])).toEqual([['Giza Plateau', 30, 1]])
    expect(r.warnings.some((w: string) => w.includes('No entrance fee'))).toBe(false)
  })

  it('a picked id that is gone from the fee table is warned, not silently dropped', async () => {
    // (a plain title, or the engine would read "Pyramids" out of the fixture's day title)
    setMockTables(tablesWith({ title: 'Free day', attractions: [], attraction_ids: ['ent-deleted'] }))
    const r = await calculateAutoPricing({ ...BASE, numPax: 2 })
    expect(ticketLines(r)).toEqual([])
    expect(r.warnings.some((w: string) => w.includes('ent-deleted'))).toBe(true)
  })
})
