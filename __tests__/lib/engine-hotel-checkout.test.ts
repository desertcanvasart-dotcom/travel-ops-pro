import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Check-out assistance has its own service type on the Hotel Assistants
// page since 2026-09-03. The engine asks for it first, and still accepts a
// porter row (how older offices filed the same service) or a full-service row.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
const row = (service_type: string, rate_eur: number) => ({ id: `hs-${service_type}`, service_type, hotel_category: 'all', rate_eur, is_active: true })
const checkoutLine = (r: any) => (r.services ?? []).find((s: any) => s.id === 'day2-hotel-checkout')

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('hotel check-out assistance', () => {
  it('a checkout_assist row prices the check-out day under its own name', async () => {
    const t = fullRateTables() as any
    t.hotel_staff_rates = [row('checkin_assist', 10), row('checkout_assist', 12), row('porter', 8)]
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(checkoutLine(r)).toMatchObject({ serviceName: 'Hotel Check-out Assistance', unitCost: 12 })
  })

  it('without one, a porter row still covers check-out', async () => {
    const t = fullRateTables() as any
    t.hotel_staff_rates = [row('checkin_assist', 10), row('porter', 8)]
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(checkoutLine(r)).toMatchObject({ serviceName: 'Hotel Check-out & Porter', unitCost: 8 })
  })

  it('with neither, the hole names the assistance rate to add', async () => {
    const t = fullRateTables() as any
    t.hotel_staff_rates = [row('checkin_assist', 10)]
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(checkoutLine(r)).toBeUndefined()
    expect((r.holes ?? []).some((h: any) => h.kind === 'hotel_service' && /check-out assistance/.test(h.message))).toBe(true)
  })
})
