import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paymentCurrencyFor } from '@/lib/payment-currency'
import { recordsInOrg } from '@/lib/org-refs'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('paymentCurrencyFor', () => {
  it('a payment is in its trip or invoice currency; a different one is refused', () => {
    expect(paymentCurrencyFor(undefined, 'JPY')).toEqual({ ok: true, currency: 'JPY' })
    expect(paymentCurrencyFor('EUR', 'JPY').ok).toBe(false)
    expect(paymentCurrencyFor('gbp', null)).toEqual({ ok: true, currency: 'GBP' })
  })
  it('every payment write uses it', () => {
    expect(src('app/api/payments/route.ts')).toContain('paymentCurrencyFor(body.currency, trip.currency)')
    expect(src('app/api/payments/[id]/route.ts')).toContain('paymentCurrencyFor(safeBody.currency, trip.currency)')
    const inv = src('app/api/invoices/[id]/payments/route.ts')
    expect(inv).toContain('paymentCurrencyFor(body.currency, invoice.currency)')
    expect(inv).not.toContain("currency: body.currency || invoice.currency")
  })
  it('the payment forms take and lock the record currency', () => {
    expect(src('app/payments/new/page.tsx')).toContain('currency: selectedItinerary.currency || prev.currency')
    expect(src('app/payments/record/page.tsx')).toContain('disabled={!!selectedItinerary?.currency}')
  })
})

describe('recordsInOrg', () => {
  const db = (owned: Record<string, string[]>) => ({
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { f[c] = v; return q },
        maybeSingle: async () => ({ data: f.org_id === 'o1' && (owned[table] ?? []).includes(String(f.id)) ? { id: f.id } : null }),
      }
      return q
    },
  })
  it("refuses another org's trip or client; absent ids pass", async () => {
    const d = db({ itineraries: ['i1'], clients: ['c1'] })
    expect(await recordsInOrg(d, 'o1', { itinerary_id: 'i1', client_id: 'c1' })).toBe(true)
    expect(await recordsInOrg(d, 'o1', {})).toBe(true)
    expect(await recordsInOrg(d, 'o1', { itinerary_id: 'i2' })).toBe(false)
    expect(await recordsInOrg(d, 'o1', { client_id: 'c2' })).toBe(false)
    expect(await recordsInOrg(d, 'o1', { client_id: 7 })).toBe(false)
  })
  it('invoice create and edit check them; the receipt WhatsApp sends only to our trip', () => {
    expect(src('app/api/invoices/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId, { itinerary_id: body.itinerary_id, client_id: body.client_id })')
    expect(src('app/api/invoices/[id]/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId,')
    expect(src('app/api/whatsapp/send-receipt/route.ts')).toContain('payment.itineraries?.org_id === orgId ? payment.itineraries : null')
  })
})

describe('B2B quote from itinerary: kept lines in the rate currency', () => {
  it("converts a line with no stamp (or an edited one) at the trip's rate", () => {
    const q = src('app/api/b2b/quote-from-itinerary/route.ts')
    expect(q).toContain('const eurLineTotal = await lineInRateCurrency(svc)')
    expect(q).toContain('getExchangeRate(tripCurrency, rateCurrency, tripRates)')
    expect(q).not.toContain(': Number(svc.total_cost) || 0\n')
  })
})

describe('templates', () => {
  it("the ATS migration retires a default ATS replaced under another name", () => {
    expect(src('migrations/20261119_message_templates_defaults_to_ats.sql')).toContain('c.source_template_id = d.id')
  })
  it('Settings → Email edits and deletes through the template routes', () => {
    const page = src('app/settings/email/page.tsx')
    expect(page).toContain('fetch(`/api/templates/${id}`, { method: \'DELETE\' })')
    expect(page).toContain('fetch(`/api/templates/${template.id}`, {')
  })
})
