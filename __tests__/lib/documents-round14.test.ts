import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { priceB2cQuote } from '@/lib/b2c/quote-price'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('round 13 regressions', () => {
  it('API requests are never redirected to the canonical host (Twilio signs the URL it posts to)', () => {
    const mw = src('middleware.ts')
    expect(mw).toContain("request.nextUrl.pathname.startsWith('/api/') ? null : canonicalRedirectOrigin(")
    expect(src('lib/twilio-signature.ts')).toContain(".replace('://', '://www.')")
  })
  it('only platform admins assign WhatsApp numbers; profile saves leave it out unless changed', () => {
    const r = src('app/api/organization/branding/route.ts')
    expect(r).toContain('if (!isPlatformAdmin(me?.email))')
    expect(src('app/components/CompanyProfileCard.tsx')).toContain('whatsapp_number === loadedWhatsapp.current ? rest : form')
  })
  it('the WhatsApp inbox says why a send or a new chat failed', () => {
    const p = src('app/whatsapp-inbox/page.tsx')
    expect(p).toContain("alert(data.error || 'The message could not be sent')")
    expect(p).toContain("alert(data.error || 'The conversation could not be started')")
  })
})

describe('B2C quotes', () => {
  it('revision compare and revert are the org’s; a booked quote is not reverted', () => {
    expect(src('app/api/b2c/quotes/[id]/revisions/compare/route.ts')).toContain("parentQuoteInOrg(supabaseAdmin, 'b2c', id, orgId)")
    const rv = src('app/api/b2c/quotes/[id]/revisions/revert/route.ts')
    expect(rv).toContain("parentQuoteInOrg(supabaseAdmin, 'b2c', id, orgId)")
    expect(rv).toContain('A booked quote cannot be reverted')
  })
  it('create and edit check the trip and client', () => {
    expect(src('app/api/b2c/quotes/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId, { client_id })')
    expect(src('app/api/b2c/quotes/[id]/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId, { itinerary_id: updates.itinerary_id, client_id: updates.client_id })')
  })
  it('one price computation: premium kept on re-price, amounts in the currency’s units', () => {
    const yen = priceB2cQuote({ totalCost: 98765, marginPercent: 25, travelers: 3, seasonUpliftPercent: 15, currency: 'JPY' })
    expect(yen.margin_amount).toBe(24691)
    expect(yen.season_uplift_amount).toBe(Math.round((98765 + 24691) * 0.15))
    expect(yen.selling_price).toBe(98765 + 24691 + yen.season_uplift_amount)
    expect(Number.isInteger(yen.price_per_person)).toBe(true)
    const eur = priceB2cQuote({ totalCost: 1000, marginPercent: 20, travelers: 2, seasonUpliftPercent: 0, currency: 'EUR' })
    expect(eur).toEqual({ margin_amount: 200, season_uplift_amount: 0, selling_price: 1200, price_per_person: 600 })
    expect(src('app/api/b2c/quotes/[id]/route.ts')).toContain('seasonUpliftPercent: Number(updates.season_uplift_percent ?? existing?.season_uplift_percent ?? 0)')
  })
})
