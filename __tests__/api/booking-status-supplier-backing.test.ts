// ============================================
// "Suppliers Confirmed" is asked for, not assumed
// ============================================
// Operator, 2026-09-19, on DEMO-EXT-2026-001: the header said "Suppliers
// Confirmed" while the Suppliers tab was empty. bookings.status was written
// straight from the dropdown with no reference to booking_supplier_status, and
// the one automatic promotion (all linked suppliers confirmed) returns early
// when a booking has no supplier rows — so an empty tab never triggered it and
// never blocked it either.
//
// The chosen rule is confirm-and-proceed: the first attempt is refused with
// 409 and the real counts, and an acknowledged retry goes through AND is
// recorded on the booking. These tests pin both halves — the rule itself, and
// the fact that the route still asks.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSupplierBacked, supplierBacking } from '@/lib/bookings/supplier-backing'

describe('supplier backing rule', () => {
  it('an empty Suppliers tab never backs the status', () => {
    expect(isSupplierBacked(0, 0)).toBe(false)
    expect(supplierBacking([]).backed).toBe(false)
    expect(supplierBacking(null).backed).toBe(false)
  })

  it('every linked supplier must be confirmed', () => {
    const rows = [{ status: 'confirmed' }, { status: 'requested' }, { status: 'confirmed' }]
    const backing = supplierBacking(rows)
    expect(backing).toEqual({ total: 3, confirmed: 2, backed: false })
    expect(supplierBacking([{ status: 'confirmed' }, { status: 'confirmed' }]).backed).toBe(true)
  })

  it('waitlist, rejected and cancelled do not count as confirmed', () => {
    for (const status of ['pending', 'requested', 'waitlist', 'rejected', 'cancelled', null]) {
      expect(supplierBacking([{ status }]).backed).toBe(false)
    }
  })
})

describe('PUT /api/bookings/[id]', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/bookings/[id]/route.ts'), 'utf8')
  const put = src.slice(src.indexOf('export async function PUT'))

  it('refuses an unbacked supplier_confirmed until it is acknowledged', () => {
    expect(put).toContain("supplierBacking(")
    expect(put).toContain("code: 'supplier_status_unbacked'")
    expect(put).toContain('status_override_ack')
    // The refusal must come BEFORE the write, or the guard is decoration.
    const refuseAt = put.indexOf("'supplier_status_unbacked'")
    const writeAt = put.indexOf('.update(updates)')
    expect(refuseAt).toBeGreaterThan(-1)
    expect(writeAt).toBeGreaterThan(refuseAt)
  })

  it('records who clicked through, and clears the note on any other status', () => {
    expect(put).toContain('updates.status_override = {')
    expect(put).toContain('by_email')
    expect(put).toContain('updates.status_override = null')
  })
})
