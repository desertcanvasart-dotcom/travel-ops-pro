import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serviceClientPrice, clientTotalOfDays } from '@/lib/itinerary-client-price'
import { visibleToOrg, withOrgCopies, templateAccess } from '@/lib/templates/template-scope'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('serviceClientPrice', () => {
  it('is the client price, never the supplier cost', () => {
    expect(serviceClientPrice({ total_cost: 100, client_price: 140 })).toBe(140)
  })
  it('prices an unpriced line at the default 25% margin', () => {
    expect(serviceClientPrice({ total_cost: 100, client_price: null })).toBe(125)
  })
  it('totals a trip from its lines', () => {
    expect(clientTotalOfDays([{ services: [{ total_cost: 100 }, { total_cost: 50, client_price: 80 }] }, { services: null }])).toBe(205)
  })
})

describe('client quote PDF', () => {
  // The breakdown summed total_cost (the supplier's) under the client's total.
  const pdf = src('lib/pdf-generator.ts')
  it('breaks down client prices', () => {
    expect(pdf).not.toContain('existing.total += service.total_cost')
    expect(pdf).toContain('serviceClientPrice(service)')
  })
  it('totals from the lines, not the cached header', () => {
    expect(pdf).toContain('clientTotalOfDays(days)')
  })
})

describe('message template scope', () => {
  const own = { id: 'a', org_id: 'org1', source_template_id: 'd1' }
  const shared = { id: 'd1', org_id: null }
  const otherShared = { id: 'd2', org_id: null }
  it("lists the org's templates and the shared defaults it has not replaced", () => {
    expect(visibleToOrg('org1')).toBe('org_id.eq.org1,org_id.is.null')
    expect(withOrgCopies([own, shared, otherShared], 'org1').map(t => t.id)).toEqual(['a', 'd2'])
  })
  it("never lets one org edit another's template", () => {
    expect(templateAccess({ org_id: 'org1' }, 'org1')).toBe('own')
    expect(templateAccess({ org_id: null }, 'org1')).toBe('shared')
    expect(templateAccess({ org_id: 'org2' }, 'org1')).toBe('none')
    expect(templateAccess(null, 'org1')).toBe('none')
  })
  it('every template route is org-scoped', () => {
    for (const f of ['app/api/templates/route.ts', 'app/api/templates/[id]/route.ts', 'app/api/templates/[id]/use/route.ts', 'app/api/templates/send/route.ts', 'app/api/templates/analytics/route.ts', 'app/api/email/templates/route.ts']) {
      expect(src(f), f).toContain('getCurrentOrgId')
    }
  })
  it('the send log writes only columns template_send_log has', () => {
    const send = src('app/api/templates/send/route.ts')
    expect(send).not.toContain('logEntry.recipient_type')
    expect(send).not.toContain('logEntry.recipient_id')
  })
})

describe('mark-sent', () => {
  it('only moves a quote-stage trip to sent', () => {
    expect(src('app/api/itineraries/[id]/mark-sent/route.ts')).toContain('status.is.null,status.in.(')
  })
})
