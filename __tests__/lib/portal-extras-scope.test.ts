import { describe, it, expect } from 'vitest'
import {
  mayAnswerExtra,
  portalExtraView,
  PORTAL_VISIBLE_STATUSES,
} from '@/lib/portal/extras-scope'

const extra = (over: Record<string, unknown> = {}) => ({
  id: 'x-1',
  kind: 'addon',
  title: 'ルクソール気球ツアー',
  description: 'ご夫婦で',
  quantity: 2,
  unit_price: 170,
  currency: 'EUR',
  status: 'offered' as const,
  passenger_id: null as string | null,
  ...over,
})

describe('mayAnswerExtra', () => {
  it('lets the family link answer anything on the booking', () => {
    expect(mayAnswerExtra({ passenger_id: null }, { passenger_id: null })).toBe(true)
    expect(mayAnswerExtra({ passenger_id: null }, { passenger_id: 'p-2' })).toBe(true)
  })

  it('lets a private link answer only its own traveller', () => {
    expect(mayAnswerExtra({ passenger_id: 'p-1' }, { passenger_id: 'p-1' })).toBe(true)
  })

  it('refuses one traveller accepting a charge for another', () => {
    expect(mayAnswerExtra({ passenger_id: 'p-1' }, { passenger_id: 'p-2' })).toBe(false)
  })

  it('refuses a private link answering for the whole party', () => {
    // A booking-scope extra is the lead's to accept, not one traveller's.
    expect(mayAnswerExtra({ passenger_id: 'p-1' }, { passenger_id: null })).toBe(false)
  })
})

describe('PORTAL_VISIBLE_STATUSES', () => {
  it('hides business that is already closed', () => {
    expect(PORTAL_VISIBLE_STATUSES).not.toContain('declined')
    expect(PORTAL_VISIBLE_STATUSES).not.toContain('withdrawn')
  })

  it('shows everything still in play', () => {
    for (const status of ['requested', 'offered', 'accepted', 'confirmed']) {
      expect(PORTAL_VISIBLE_STATUSES).toContain(status)
    }
  })
})

describe('portalExtraView', () => {
  it('sends the LINE amount, not the unit price', () => {
    // 170 each for two people is 340 — showing 170 beside "× 2" invites the
    // traveller to work out the wrong number themselves.
    expect(portalExtraView(extra()).amount).toBe(340)
  })

  it('sends no amount at all for something not yet priced', () => {
    // Zero would read as free.
    expect(portalExtraView(extra({ unit_price: null, currency: null })).amount).toBeNull()
  })

  it('never leaks what we paid, who supplies it, or the internal price', () => {
    const view = portalExtraView(
      extra({
        supplier_cost: 120,
        supplier_id: 'sup-1',
        invoice_id: 'inv-1',
        confirmed_by: 'user-1',
      }) as never
    )
    expect(Object.keys(view).sort()).toEqual(
      ['amount', 'currency', 'description', 'id', 'kind', 'quantity', 'status', 'title']
    )
  })

  it('normalises an unknown kind rather than passing it through', () => {
    expect(portalExtraView(extra({ kind: 'something-else' })).kind).toBe('addon')
    expect(portalExtraView(extra({ kind: 'upgrade' })).kind).toBe('upgrade')
  })

  it('treats a nonsense quantity as one', () => {
    expect(portalExtraView(extra({ quantity: 0 })).quantity).toBe(1)
  })
})
