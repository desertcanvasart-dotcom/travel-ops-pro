// ============================================
// AUDIT-FINDINGS.md leftovers — the gaps a re-check found still open
// ============================================

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pickPaymentFields, checkPaymentAmount } from '@/lib/payments/fields'

const positiveAmount = (raw: unknown) => { const c = checkPaymentAmount(raw); return c.ok ? c.amount : null }

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('H25/H26 — payment writes keep only the payment fields', () => {
  it('drops id, org_id, timestamps and unknown keys', () => {
    const picked = pickPaymentFields({
      id: 'x', org_id: 'other-org', created_at: '2020-01-01', updated_at: '2020-01-01',
      itineraries: { id: 'y' }, amount: 10, notes: 'n', payment_status: 'completed',
    })
    expect(picked).toEqual({ amount: 10, notes: 'n', payment_status: 'completed' })
  })

  it('a non-object body yields nothing', () => {
    expect(pickPaymentFields(null)).toEqual({})
    expect(pickPaymentFields([1, 2])).toEqual({})
    expect(pickPaymentFields('amount')).toEqual({})
  })

  it.each([[10, 10], ['12.5', 12.5]])('amount %s is %s', (input, out) => {
    expect(positiveAmount(input)).toBe(out)
  })
  it.each([0, -5, '', null, undefined, 'abc', NaN, Infinity, true])('amount %s is refused', (input) => {
    expect(positiveAmount(input)).toBeNull()
  })

  it('both routes use the allow-list and PUT checks the amount', () => {
    expect(src('app/api/payments/route.ts')).toContain('pickPaymentFields(')
    expect(src('app/api/payments/route.ts')).toContain('checkPaymentAmount(fields.amount)')
    const put = src('app/api/payments/[id]/route.ts')
    expect(put).toContain('const safeBody = pickPaymentFields(body)')
    expect(put).toMatch(/checkPaymentAmount\(safeBody\.amount\)/)
    expect(put).not.toMatch(/\.\.\.safeBody|\.\.\.body/)
  })
})

describe('H20 — commission edit is an allow-list', () => {
  const code = src('app/api/commissions/[id]/route.ts')
  it('copies only named fields, never amounts, links or org', () => {
    expect(code).toContain('buildCommissionUpdate(body, existing)')
    const lib = src('lib/commission-fields.ts')
    const list = lib.slice(lib.indexOf('COMMISSION_EDITABLE_FIELDS = ['), lib.indexOf('] as const', lib.indexOf('COMMISSION_EDITABLE_FIELDS = [')))
    for (const f of ['commission_amount', 'commission_rate', 'base_amount', 'cost_amount', 'org_id', 'client_id', 'itinerary_id', 'supplier_id']) {
      expect(list).not.toContain(`'${f}'`)
    }
    expect(code).not.toMatch(/\.\.\.updateData\s*\}\s*=\s*body/)
  })
})

describe('H22 — invoice paid/partial follow the payments', () => {
  const code = src('app/api/invoices/[id]/route.ts')
  it('an edit may not set paid or partial', () => {
    expect(code).toContain('!isSettableInvoiceStatus(updateData.status)')
    expect(src('lib/invoices/validate.ts')).toContain("SETTABLE_INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'cancelled']")
  })
})

describe('H32 — a cancelled supplier invoice cannot be disputed', () => {
  const code = src('app/api/supplier-invoices/[id]/dispute/route.ts')
  it('pre-check and conditional WHERE both exclude cancelled', () => {
    expect(code).toContain("existing.status === 'cancelled'")
    expect(code).toMatch(/\.neq\(['"]status['"], ['"]cancelled['"]\)/)
  })
})

describe('M12 — the pricing debug endpoint is gone', () => {
  it('app/api/b2b/test-pricing no longer ships', () => {
    expect(existsSync(join(ROOT, 'app/api/b2b/test-pricing/route.ts'))).toBe(false)
  })
})

describe('M8/M9/M27 — paid parse endpoints are rate limited', () => {
  it.each([
    'app/api/ai/parse-supplier-invoice/route.ts',
    'app/api/ai/parse-file/route.ts',
    'app/api/pricing-grid/parse/route.ts',
  ])('%s calls guardAiRate', (f) => {
    expect(src(f)).toContain("await guardAiRate('parse')")
  })
  it('pricing-grid parse caps the text and does not throw on a bad model reply', () => {
    const code = src('app/api/pricing-grid/parse/route.ts')
    expect(code).toContain('text.length > MAX_PARSE_TEXT')
    expect(code).not.toMatch(/JSON\.parse\((gen)?[jJ]sonMatch\[0\]\)/)
  })
})

describe('M14 — an edited expense re-syncs to accounting', () => {
  it('PUT calls syncExpense', () => {
    expect(src('app/api/expenses/[id]/route.ts')).toMatch(/syncExpense\(data\.id\)\.catch/)
  })
})

describe('middleware runs on every API path', () => {
  it('an /api path ending in .png is not excluded by the image rule', () => {
    expect(src('middleware.ts')).toContain("'/api/:path*'")
  })
})

describe('H1/H14 — the OAuth nonce is spent on success', () => {
  it.each(['app/api/auth/google/callback/route.ts', 'app/api/auth/accounting/callback/route.ts'])('%s clears it', (f) => {
    expect(src(f)).toMatch(/clearNonceCookie\(done\)/)
  })
})

describe('H30 — the season premium is priced on the server', async () => {
  const { settleSeasonUplift } = await import('@/lib/pricing/season-uplift')
  const high = { seasonId: 's', name: 'Golden Week', upliftPercent: 15 }
  it('no season on the departure: no premium, whatever the request says', () => {
    expect(settleSeasonUplift({ sellingPrice: 1000, season: null, claimed: 500 })).toBe(0)
  })
  it("the grid's figure stands when it agrees to rounding", () => {
    expect(settleSeasonUplift({ sellingPrice: 1000, season: high, claimed: 150.4 })).toBe(150.4)
  })
  it("an inflated figure is capped at the season's", () => {
    expect(settleSeasonUplift({ sellingPrice: 1000, season: high, claimed: 900 })).toBe(150)
  })
  it('a premium the grid did not show is not added', () => {
    expect(settleSeasonUplift({ sellingPrice: 1000, season: high, claimed: undefined })).toBe(0)
    expect(settleSeasonUplift({ sellingPrice: 1000, season: high, claimed: -5 })).toBe(0)
  })
  it('the save route prices the premium itself, from the departure', () => {
    const save = src('app/api/pricing-grid/save/route.ts')
    expect(save).toContain('const season = seasonForDate(await seasonWindowsOn(supabase, callerOrgId, startDate), startDate)')
    expect(save).toContain('sellingFromCost({ totalCost: supplierTotal, marginPercent: marginPct, season, currency: rateCurrency })')
  })
})

describe('H31 — a failed days write undoes the header', () => {
  const code = src('app/api/pricing-grid/save/route.ts')
  it('an update restores the previous header; a create removes the new trip', () => {
    expect(code).toContain(".update(before).eq('id', config.itineraryId).eq('org_id', callerOrgId)")
    expect(code).toContain(".from('itineraries').delete().eq('id', createdId)")
  })
  it('the undo is disarmed once the days are written and run from the catch', () => {
    const rpc = code.indexOf("supabase.rpc('save_pricing_grid_days'")
    expect(code.indexOf('undoHeader = null', rpc)).toBeGreaterThan(rpc)
    expect(code).toMatch(/catch \(error: any\) \{[\s\S]*?await undoHeader\(\)/)
  })
})

describe('H3 — no flat P&L total across currencies', () => {
  it('the flat totals and margins are null when currencies are mixed', () => {
    const code = src('app/api/profit-loss/route.ts')
    expect(code).toContain('const flat = (n: number): number | null => (mixedCurrency ? null : n)')
    for (const k of ['total_revenue', 'total_profit', 'total_net_profit', 'total_realized_profit', 'average_margin', 'average_net_margin']) {
      expect(code).toMatch(new RegExp(`${k}: flat\\(`))
    }
  })
})

describe('L4 — customer text stays data', () => {
  it('parse-whatsapp defuses the tag and keeps only contacts the customer wrote', () => {
    const code = src('app/api/ai/parse-whatsapp/route.ts')
    expect(code).toContain("wrapUntrusted('conversation', conversation)")
    expect(code).toContain("contactFromText(extracted.client_email, conversation, 'email') || regexEmail")
    expect(code).toContain("contactFromText(extracted.client_phone, conversation, 'phone') || regexPhone")
  })
  it('parse-file sends its instructions as system and wraps document text', () => {
    const code = src('app/api/ai/parse-file/route.ts')
    expect(code).toMatch(/system: prompt,/)
    expect(code).toContain("wrapUntrusted('document', text)")
  })
})

describe('smaller leftovers (second pass)', () => {
  it('M10: the Google callback no longer trusts x-forwarded-host', () => {
    const code = src('app/api/auth/google/callback/route.ts')
    expect(code).not.toMatch(/fwdHost/)
    expect(code).toContain('const baseUrl = BASE_URL || new URL(request.url).origin')
  })
  it('M16: services with no commission status are claimed too', () => {
    expect(src('app/api/itineraries/[id]/generate-commissions/route.ts'))
      .toContain(".or('commission_status.is.null,commission_status.eq.pending')")
  })
  it('M17: a final invoice needs a live deposit invoice as its parent', () => {
    const code = src('app/api/invoices/route.ts')
    expect(code).toContain("error: 'Deposit invoice not found' }, { status: 404 }")
    expect(code).toContain("parentInvoice.status === 'cancelled' || parentInvoice.invoice_type === 'final'")
  })
  it('M29: a failed expense cascade on pay is reported, not swallowed', () => {
    const code = src('app/api/supplier-invoices/[id]/pay/route.ts')
    expect(code).toContain('const { error: cascadeError } = await supabaseAdmin')
    expect(code).toMatch(/warnings\.length \? \{ warnings \}/)
  })
  it('L1: a negative or infinite conversion amount is refused', () => {
    expect(src('app/api/exchange-rates/route.ts')).toContain('!Number.isFinite(amount) || amount < 0')
  })
  it("expenses: the trip is checked against the caller's org on create and edit", () => {
    expect(src('app/api/expenses/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId, { supplier_id: body.supplier_id, itinerary_id: body.itinerary_id })')
    expect(src('app/api/expenses/[id]/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId, { supplier_id: updateData.supplier_id, itinerary_id: updateData.itinerary_id })')
  })
  it('pricing-grid: every write after the header is org-scoped', () => {
    expect(src('app/api/pricing-grid/save/route.ts')).toMatch(/update\(\{ season_uplift_amount: seasonUplift \}\)\s*\.eq\('id', itineraryId\)\s*\.eq\('org_id', callerOrgId\)/)
  })
})

describe('the last optional items', () => {
  it('H32: a dispute records who and when, and the page shows it', () => {
    const route = src('app/api/supplier-invoices/[id]/dispute/route.ts')
    expect(route).toContain('.update({ disputed_by: disputedBy, disputed_at: disputedAt })')
    expect(src('migrations/20261130_supplier_invoice_disputed_by.sql')).toMatch(/ADD COLUMN IF NOT EXISTS disputed_by uuid/)
    expect(src('app/supplier-invoices/[id]/page.tsx')).toContain('invoice.disputed_by_name')
  })
  it.each([
    ['app/api/rates/bulk/import/route.ts', "requireRole(['admin', 'manager'])"],
    ['app/api/rates/bulk/export/route.ts', "requireRole(['admin', 'manager'])"],
    ['app/api/rates/bulk/periods/export/route.ts', "requireRole(['admin', 'manager'])"],
    ['app/api/ai/build-quote/route.ts', "requireRole(['admin', 'manager', 'agent'])"],
  ])('C2/H12/H15: %s checks the role in-route', (f, call) => {
    expect(src(f)).toContain(call)
  })
})
