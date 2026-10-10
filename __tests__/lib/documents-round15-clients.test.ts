import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shareTotalWithExtras } from '@/lib/itinerary-share'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('share page total includes confirmed extras', () => {
  it('adds a live booking’s extras_total in the itinerary’s currency', () => {
    expect(shareTotalWithExtras(500000, 'JPY', [{ status: 'confirmed', currency: 'JPY', extras_total: 80000 }])).toBe(580000)
    expect(shareTotalWithExtras(1000.1, 'EUR', [{ status: 'pending', currency: 'eur', extras_total: '0.2' }])).toBe(1000.3)
  })

  it('never sums another currency, a cancelled booking, or a missing column', () => {
    expect(shareTotalWithExtras(500000, 'JPY', [{ status: 'confirmed', currency: 'EUR', extras_total: 300 }])).toBe(500000)
    expect(shareTotalWithExtras(500000, 'JPY', [{ status: 'cancelled', currency: 'JPY', extras_total: 80000 }])).toBe(500000)
    expect(shareTotalWithExtras(500000, 'JPY', [{ status: 'confirmed', currency: 'JPY' }])).toBe(500000)
    expect(shareTotalWithExtras(500000, 'JPY', [])).toBe(500000)
    expect(shareTotalWithExtras(null, 'JPY', [{ status: 'confirmed', currency: 'JPY', extras_total: 1 }])).toBeNull()
  })

  it('the page reads the booking in the share’s org and applies it to the shown total', () => {
    const s = src('app/share/[token]/page.tsx')
    expect(s).toMatch(/from\('bookings'\)\.select\('\*'\)\.eq\('itinerary_id', share\.itinerary_id\)\.eq\('org_id', share\.org_id\)/)
    expect(s).toContain('clientItinerary.totalPrice = shareTotalWithExtras(')
    expect(s).toMatch(/from\('itineraries'\)\.select\('\*'\)\.eq\('id', share\.itinerary_id\)\.eq\('org_id', share\.org_id\)/)
    expect(s).toContain("timeZone: 'UTC'")
  })

  it('the share chat reads and counts only the share org’s rows', () => {
    const s = src('app/api/share/[token]/messages/route.ts')
    expect(s.match(/\.eq\('org_id', share\.org_id\)/g)?.length).toBe(3)
  })
})

describe('client trip history stays in the organisation', () => {
  const s = src('app/api/clients/[id]/itineraries/route.ts')
  it('resolves the org and scopes the client and both itinerary queries', () => {
    expect(s).toContain('getCurrentOrgId()')
    expect(s.match(/\.eq\('org_id', orgId\)/g)?.length).toBe(3)
    expect(s).toContain("{ status: 404 }")
  })
  it('matches the email literally, not as a LIKE pattern', () => {
    expect(s).toContain(".ilike('client_email', escapeLike(email))")
    const escapeLike = (v: string) => v.replace(/[\\%_]/g, ch => `\\${ch}`)
    expect(escapeLike('j_hn%@x.com')).toBe('j\\_hn\\%@x.com')
  })
  it('the order intake escapes the email too; the public form refuses %', () => {
    expect(src('lib/intake/process-order.ts')).toContain(".ilike('email', order.email.replace(/[\\\\%_]/g")
    const form = src('app/api/public/order-form/route.ts')
    expect(form).toContain('const EMAIL_RE = /^[A-Za-z0-9._+\\-]+@')
  })
})

describe('client delete does not destroy money records', () => {
  const s = src('app/api/clients/[id]/route.ts')
  it('checks invoices before the force cascade', () => {
    const del = s.slice(s.indexOf('export async function DELETE'))
    expect(del.indexOf(".from('invoices')")).toBeGreaterThan(-1)
    expect(del.indexOf(".from('invoices')")).toBeLessThan(del.indexOf('for (const itin of itineraries)'))
  })
  it('refuses when the trips have bookings, and never deletes bookings itself', () => {
    expect(s).toContain("blocking: 'bookings'")
    expect(s).not.toMatch(/from\('bookings'\)\.delete\(\)/)
  })
  it('a referring client must be in the org', () => {
    expect(s.match(/referrerInOrg\(updateData\.referred_by_client_id, orgId\)/g)?.length).toBe(2)
  })
})

describe('template data dates', () => {
  it('today is the business day and dates format in UTC', () => {
    const s = src('app/api/clients/[id]/template-data/route.ts')
    expect(s).toContain('data.today = formatDate(businessToday())')
    expect(s.match(/timeZone: 'UTC'/g)?.length).toBe(3)
  })
})

describe('partner availability API', () => {
  it('rejects impossible dates with a 400 and defaults to the business day', () => {
    const s = src('app/api/public/v1/availability/route.ts')
    expect(s).toContain("searchParams.get('from') || businessToday()")
    expect(s).toContain('function isRealDate')
    expect(s.indexOf('if (!isRealDate(from))')).toBeLessThan(s.indexOf('addDays(from, 90)'))
  })
})

describe('inbox portal chat shows the newest messages', () => {
  it('takes the newest 500 and reverses them into reading order', () => {
    const s = src('app/api/portal-chat/messages/route.ts')
    expect(s).toContain(".order('created_at', { ascending: false })")
    expect(s).toContain('(data ?? []).slice().reverse().map(')
  })
})
