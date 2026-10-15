// ============================================
// AUDIT-FINDINGS.md leftovers — the gaps a re-check found still open
// ============================================

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pickPaymentFields, positiveAmount } from '@/lib/payment-fields'

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
    expect(src('app/api/payments/route.ts')).toContain('blankToNull(pickPaymentFields(await request.json()))')
    const put = src('app/api/payments/[id]/route.ts')
    expect(put).toContain('blankToNull(pickPaymentFields(await request.json()))')
    expect(put).toMatch(/positiveAmount\(safeBody\.amount\)/)
    expect(put).not.toMatch(/\.\.\.safeBody|\.\.\.body/)
  })
})

describe('H20 — commission edit is an allow-list', () => {
  const code = src('app/api/commissions/[id]/route.ts')
  it('copies only named fields, never amounts, links or org', () => {
    expect(code).toContain('const EDITABLE = [')
    const list = code.slice(code.indexOf('const EDITABLE = ['), code.indexOf('] as const'))
    for (const f of ['commission_amount', 'commission_rate', 'base_amount', 'cost_amount', 'org_id', 'client_id', 'itinerary_id', 'supplier_id']) {
      expect(list).not.toContain(`'${f}'`)
    }
    expect(code).not.toMatch(/\.\.\.updateData\s*\}\s*=\s*body/)
  })
})

describe('H22 — invoice paid/partial follow the payments', () => {
  const code = src('app/api/invoices/[id]/route.ts')
  it('an edit may not set paid or partial', () => {
    expect(code).toContain("const CALLER_SETTABLE_STATUSES = ['draft', 'sent', 'viewed', 'overdue', 'cancelled']")
    expect(code).toContain('!CALLER_SETTABLE_STATUSES.includes(updateData.status)')
  })
  it('re-derives from the payments, including back to sent when none remain', () => {
    expect(code).toContain("if (paid > 0) derived = paid >= total ? 'paid' : 'partial'")
    expect(code).toContain("else if (['paid', 'partial'].includes(status)) derived = 'sent'")
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
  it('the save route uses it', () => {
    expect(src('app/api/pricing-grid/save/route.ts')).toContain('settleSeasonUplift({ sellingPrice: actualClientTotal, season, claimed: totals?.seasonUplift })')
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
