// Editing any supplier-less hotel or airport rate returned "Internal server
// error": the form sends supplier_id '' and the PUT route handed it straight
// to a uuid column. Found when the operator tried to price the porter row.
import { describe, it, expect } from 'vitest'
import { sanitizeRateUpdate } from '@/lib/rates/update-payload'

/** Exactly what the hotel-services form posted for the porter row. */
const PORTER_FORM = {
  service_code: 'HOTEL-PORTER-ALL',
  service_type: 'porter',
  hotel_category: 'all',
  destination: '',
  rate_eur: 8,
  description: '',
  notes: '',
  supplier_id: '',
  is_active: true,
}

describe('sanitizeRateUpdate', () => {
  it('turns an unpicked supplier into null instead of an empty uuid', () => {
    const r = sanitizeRateUpdate(PORTER_FORM)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.supplier_id).toBeNull()
    expect(r.payload.destination).toBeNull()
    // Text columns keep their empty strings — '' is a valid description.
    expect(r.payload.description).toBe('')
    expect(r.payload.rate_eur).toBe(8)
  })

  it('keeps a real supplier id', () => {
    const r = sanitizeRateUpdate({ ...PORTER_FORM, supplier_id: '2d0b3c8e-0000-4000-8000-000000000000' })
    expect(r.ok && r.payload.supplier_id).toBe('2d0b3c8e-0000-4000-8000-000000000000')
  })

  it('lets an unpriced row stay unpriced', () => {
    const r = sanitizeRateUpdate({ ...PORTER_FORM, rate_eur: null })
    expect(r.ok && r.payload.rate_eur).toBeNull()
  })

  it('refuses to let the client rewrite identity or audit columns', () => {
    const r = sanitizeRateUpdate({ ...PORTER_FORM, id: 'other-row', created_at: '1999-01-01', org_id: 'x' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload).not.toHaveProperty('id')
    expect(r.payload).not.toHaveProperty('created_at')
    expect(r.payload).not.toHaveProperty('org_id')
  })

  it('rejects a negative rate with a 400, matching the POST routes', () => {
    const r = sanitizeRateUpdate({ ...PORTER_FORM, rate_eur: -5 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(400)
    expect(r.violations?.length).toBeGreaterThan(0)
  })

  it('rejects a non-object body', () => {
    expect(sanitizeRateUpdate(null).ok).toBe(false)
    expect(sanitizeRateUpdate([1]).ok).toBe(false)
    expect(sanitizeRateUpdate('x').ok).toBe(false)
  })

  it('rejects an update that would touch nothing', () => {
    const r = sanitizeRateUpdate({ id: 'only-protected-keys' })
    expect(r.ok).toBe(false)
  })
})
