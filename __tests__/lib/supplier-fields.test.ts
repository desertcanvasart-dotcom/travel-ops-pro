// The supplier form used to grow a different set of extras per role — vehicle
// types for transport, routes for a railway, a ship name for a cruise, a daily
// rate for an assistant that no API would even save. On 2026-08-22 the form
// was cut back to contact + location and the extras moved to the rates area.
// These pin that shape: one form for every role, and one whitelist shared by
// the form, the create route and the update route.
import { describe, it, expect } from 'vitest'
import {
  SUPPLIER_FORM_FIELDS,
  SUPPLIER_RATES_FIELDS,
  SUPPLIER_WRITABLE_FIELDS,
  SUPPLIER_RETIRED_FORM_FIELDS,
} from '@/lib/suppliers/fields'
import { VALID_SUPPLIER_FIELDS, buildSupplierInsert } from '@/lib/suppliers/create-payload'

describe('supplier form fields', () => {
  it('is contact + location only — no role-specific extras', () => {
    const keys = SUPPLIER_FORM_FIELDS.map(f => f.key)
    expect(keys).toEqual([
      'name', 'types', 'status',
      'contact_name', 'contact_email', 'contact_phone', 'whatsapp', 'website',
      'city', 'address',
      'notes',
    ])
  })

  it('shows nothing the form retired', () => {
    const keys = new Set(SUPPLIER_FORM_FIELDS.map(f => f.key))
    for (const retired of SUPPLIER_RETIRED_FORM_FIELDS) expect(keys.has(retired)).toBe(false)
  })

  it('every form field is writable — nothing can be shown but silently dropped', () => {
    // The assistants' "Daily Rate (EUR)" was exactly that before: on the form,
    // in neither whitelist.
    const writable = new Set<string>(SUPPLIER_WRITABLE_FIELDS)
    for (const f of SUPPLIER_FORM_FIELDS) expect(writable.has(f.key)).toBe(true)
  })

  it('keeps the rates-area facts writable even though the form does not show them', () => {
    const writable = new Set<string>(SUPPLIER_WRITABLE_FIELDS)
    const shown = new Set(SUPPLIER_FORM_FIELDS.map(f => f.key))
    for (const k of SUPPLIER_RATES_FIELDS) {
      expect(writable.has(k)).toBe(true)
      expect(shown.has(k)).toBe(false)
    }
  })

  it('create and update share the one whitelist', () => {
    expect(VALID_SUPPLIER_FIELDS).toBe(SUPPLIER_WRITABLE_FIELDS)
  })

  it('ignores retired fields a stale client still sends, and keeps the data it does accept', () => {
    const r = buildSupplierInsert({
      name: 'Nile Dream', type: 'cruise', types: ['cruise'],
      routes: ['Luxor to Aswan'], ship_name: 'MS Nile Dream', cabin_count: 60, star_rating: '5',
      vehicle_types: ['Sedan'], daily_rate: 100, is_property: true, parent_supplier_id: 'x', phone2: '1',
      contact_phone: '+20 100', city: 'Luxor', default_commission_rate: 10, commission_type: 'receivable',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const retired of SUPPLIER_RETIRED_FORM_FIELDS) expect(r.row).not.toHaveProperty(retired)
    expect(r.row).toMatchObject({ name: 'Nile Dream', contact_phone: '+20 100', city: 'Luxor', default_commission_rate: 10, commission_type: 'receivable' })
  })
})
