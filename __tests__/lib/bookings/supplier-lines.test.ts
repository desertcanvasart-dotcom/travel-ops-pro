import { describe, it, expect } from 'vitest'
import { supplierLinesFromServices, supplierTypeForService } from '@/lib/bookings/supplier-lines'
import { supplierBacking } from '@/lib/bookings/supplier-backing'

// A booking's supplier list leaves out what nobody confirms and lists each
// supplier once per day; a "not needed" row leaves the confirmed count.

describe('supplierLinesFromServices', () => {
  const day = (n: number) => ({ day_number: n, day_date: `2026-12-0${n}` })

  it('leaves out water, tips and supplies', () => {
    expect(supplierTypeForService('supplies')).toBeNull()
    expect(supplierTypeForService('tips')).toBeNull()
    const lines = supplierLinesFromServices([
      { service_type: 'supplies', service_name: 'Bottled Water', total_cost: 2, ...day(1) },
      { service_type: 'tips', service_name: 'Driver Tip', total_cost: 5, ...day(1) },
      { service_type: 'airport_service', service_name: 'Airport Meet & Greet', total_cost: 30, ...day(1) },
    ], null)
    expect(lines.map(l => l.supplier_name)).toEqual(['Airport Meet & Greet'])
    expect(lines[0].supplier_type).toBe('airport_service')
  })

  it('lists one supplier once per day, costs summed', () => {
    const lines = supplierLinesFromServices([
      { supplier_id: 's1', supplier_name: 'Sedan Cairo', service_type: 'transportation', total_cost: 40, ...day(2) },
      { supplier_id: 's1', supplier_name: 'Sedan Cairo', service_type: 'transportation', total_cost: 60, ...day(2) },
      { supplier_id: 's1', supplier_name: 'Sedan Cairo', service_type: 'transportation', total_cost: 50, ...day(3) },
    ], null)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ supplier_id: 's1', supplier_type: 'transport', service_date: '2026-12-02', quoted_cost: 100 })
  })

  it('dates a line from the trip start when the day has no date', () => {
    const [l] = supplierLinesFromServices([{ service_type: 'guide', service_name: 'Guide', day_number: 3 }], '2026-12-05')
    expect(l.service_date).toBe('2026-12-07')
  })
})

describe('supplierBacking', () => {
  it('a not-needed row leaves the count', () => {
    expect(supplierBacking([{ status: 'confirmed' }, { status: 'cancelled' }])).toEqual({ total: 1, confirmed: 1, backed: true })
  })
})
