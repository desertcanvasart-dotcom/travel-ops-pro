import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { partnerSingleSupplement } from '@/lib/b2b/partner-prices'
import { senderPlaceholders } from '@/lib/template-sender'

describe('partnerSingleSupplement', () => {
  it('adds the quote margin to a supplement stored at cost', () => {
    expect(partnerSingleSupplement({ single_supplement: 200, margin_percent: 25, currency: 'EUR' })).toBe(250)
  })
  it('rounds to the currency (no yen decimals)', () => {
    expect(partnerSingleSupplement({ single_supplement: 1001, margin_percent: 15, currency: 'JPY' })).toBe(1151)
  })
  it('keeps the figure when no margin is recorded, and 0 when there is none', () => {
    expect(partnerSingleSupplement({ single_supplement: 180, margin_percent: null })).toBe(180)
    expect(partnerSingleSupplement({ single_supplement: 0, margin_percent: 20 })).toBe(0)
  })
})

describe('B2B partner quote PDF', () => {
  // The partner's copy printed each service's cost, "Subtotal (Cost)",
  // "Margin (25%)" and the tour leader's net cost.
  const src = readFileSync(join(process.cwd(), 'app/api/b2b/quotes/[id]/pdf/route.ts'), 'utf8')
  const html = src.slice(src.indexOf('async function generateQuoteHTML'))
  it('prints no cost, margin or tour-leader cost', () => {
    for (const leak of ['total_cost', 'margin_amount', 'margin_percent', 'unit_cost', 'line_total', 'tour_leader_cost', 'subtotalCost', 'labels.marginPercent']) {
      expect(html).not.toContain(leak)
    }
  })
  it('lists every service (no 20-line cap)', () => {
    expect(html).not.toContain('slice(0, 20)')
  })
})

describe('senderPlaceholders', () => {
  it("is the organisation's own identity and the sending agent", () => {
    expect(senderPlaceholders({ name: 'Karnak Voyages', email: 'hi@karnak.example', phone: '+44 20 1234' }, ' Mona Adel '))
      .toEqual({ company_name: 'Karnak Voyages', company_email: 'hi@karnak.example', company_phone: '+44 20 1234', agent_name: 'Mona Adel' })
  })
  it('stays blank rather than borrowing another operator', () => {
    expect(senderPlaceholders({ name: '', email: '', phone: '' }, null))
      .toEqual({ company_name: '', company_email: '', company_phone: '', agent_name: '' })
  })
})
