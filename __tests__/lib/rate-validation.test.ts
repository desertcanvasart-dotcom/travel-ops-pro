import { describe, it, expect } from 'vitest'
import { validateRatePayload } from '@/lib/rate-validation'

describe('validateRatePayload', () => {
  it('accepts a normal rate row', () => {
    const r = validateRatePayload({
      city: 'Cairo',
      base_rate_eur: 85,
      base_rate_non_eur: 95,
      single_supp_eur: 45,
      is_active: true,
    })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('rejects a negative money field', () => {
    const r = validateRatePayload({ base_rate_eur: -10 })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/base_rate_eur cannot be negative/i)
  })

  it('rejects an absurdly large rate', () => {
    const r = validateRatePayload({ pp_double_eur: 5_000_000 })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/exceeds the maximum/i)
  })

  it('accepts negative values in non-money fields', () => {
    // capacity / counts are not money — left untouched
    expect(validateRatePayload({ capacity_min: 1, sort_order: -3 }).ok).toBe(true)
  })

  it('does not treat date fields as money even if they contain "valid"', () => {
    expect(validateRatePayload({ rate_valid_from: '2020-01-01', base_rate_eur: 50 }).ok).toBe(true)
  })

  it('ignores empty / null money fields', () => {
    expect(validateRatePayload({ base_rate_eur: '', single_supp_eur: null }).ok).toBe(true)
  })

  it('rejects a non-object body', () => {
    expect(validateRatePayload(null).ok).toBe(false)
    expect(validateRatePayload([] as any).ok).toBe(false)
  })

  it('catches multiple violations at once', () => {
    const r = validateRatePayload({ base_rate_eur: -1, dinner_rate_eur: -2 })
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBe(2)
  })
})
