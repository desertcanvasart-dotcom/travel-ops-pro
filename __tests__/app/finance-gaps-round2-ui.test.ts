// Screen wiring for the second round of finance fixes. The behaviour is pinned
// in __tests__/lib and __tests__/api/finance-gaps-round2.test.ts; these check
// the screens call and show it (they are client components, read as source).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const en = JSON.parse(read('messages/en.json'))
const ja = JSON.parse(read('messages/ja.json'))

describe('trip P&L card: extra expenses', () => {
  const card = read('app/components/ItineraryPL.tsx')

  it('no longer converts with static fallback rates', () => {
    expect(card).not.toContain('getFallbackRates')
    expect(card).not.toContain('convertCurrency')
    expect(card).not.toContain('@/lib/currency-service')
  })

  it("takes the converted total from the server's P&L conversion", () => {
    expect(card).toContain('/extras-fx')
  })

  it('shows a visible "rate missing" note when a rate is unavailable, or the conversion failed', () => {
    expect(card).toContain("t('rateMissing'")
    expect(card).toContain("t('extrasUnavailable')")
    for (const lang of [en, ja]) {
      expect(lang.itineraryPL.rateMissing).toBeTruthy()
      expect(lang.itineraryPL.extrasUnavailable).toBeTruthy()
    }
    expect(en.itineraryPL.rateMissing).toMatch(/^Rate missing/)
  })
})

describe('Commissions page', () => {
  const page = read('app/commissions/page.tsx')

  it("has a 'Recalculate from price' button that calls the recalculate route", () => {
    expect(page).toContain('/api/commissions/recalculate')
    expect(en.commissions.recalculateFromPrice).toBe('Recalculate from price')
    expect(ja.commissions.recalculateFromPrice).toBeTruthy()
  })

  it("flags a settled commission whose price changed ('price changed since paid') instead of changing it", () => {
    expect(page).toContain('priceFlags')
    expect(en.commissions.priceChangedSincePaid).toBe('Price changed since paid')
  })

  it('shows the commission reference the duplicate message names', () => {
    expect(page).toContain('commissionRef(commission.id)')
  })
})

describe('Expenses screens: Approved by', () => {
  it('the list and the detail show the approver and the date', () => {
    expect(read('app/expenses/page.tsx')).toContain("t('approvedBy')")
    expect(read('app/expenses/page.tsx')).toContain('approved_by_name')
    expect(read('app/expenses/[id]/page.tsx')).toContain("t('approvedBy')")
    expect(read('app/expenses/[id]/page.tsx')).toContain('approved_at')
    for (const ns of ['expenses', 'expenseDetail']) {
      expect(en[ns].approvedBy).toBe('Approved by')
      expect(ja[ns].approvedBy).toBeTruthy()
    }
  })

  it("the detail shows the server's reason when an approval is refused", () => {
    const detail = read('app/expenses/[id]/page.tsx')
    expect(detail).toMatch(/body\.error \|\| t\('failedToUpdateStatus'\)/)
  })

  it('the routes take the creator and approver from the session, not the body', () => {
    const post = read('app/api/expenses/route.ts')
    const put = read('app/api/expenses/[id]/route.ts')
    expect(post).toContain('getCurrentUserId()')
    expect(post).toContain('created_by: userId')
    expect(post).not.toMatch(/body\.(created_by|approved_by)/)
    expect(put).toContain('getCurrentUserId()')
    expect(put).not.toMatch(/'(created_by|approved_by|approved_at)',/)
  })
})
