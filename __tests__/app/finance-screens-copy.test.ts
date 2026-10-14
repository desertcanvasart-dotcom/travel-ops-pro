// The wording and gates on the Expenses, Commissions, Profit & Loss screens and
// the trip page's P&L card. Behaviour that can be exercised is tested in
// __tests__/api/finance-expenses-commissions-pnl.test.ts and the lib tests;
// these read the source / message files for what cannot reasonably be rendered.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const en = JSON.parse(read('messages/en.json'))
const ja = JSON.parse(read('messages/ja.json'))

/** Every leaf key path of an object. */
const leaves = (o: unknown, prefix = ''): string[] =>
  o && typeof o === 'object'
    ? Object.entries(o).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
    : [prefix]

describe('the trip page P&L card note', () => {
  it('no longer says tips and water are pass-through with no margin, in either language', () => {
    for (const msgs of [en, ja]) {
      const note: string = msgs.itineraryPL.noteText
      expect(note).not.toMatch(/pass-through|パススルー/i)
      expect(note).not.toContain('{marginPercent}')
    }
  })

  it('labels the margin as profit over price, and has the "not recorded" text', () => {
    expect(en.itineraryPL.marginOnPrice).toMatch(/client price/i)
    expect(en.itineraryPL.markupOnCost).toBeUndefined()
    expect(en.itineraryPL.notRecorded).toBeTruthy()
    expect(ja.itineraryPL.marginOnPrice).toBeTruthy()
    expect(ja.itineraryPL.notRecorded).toBeTruthy()
  })

  it('invents no cost and no markup', () => {
    const card = read('app/components/ItineraryPL.tsx')
    expect(card).not.toMatch(/1 \+ marginPercent/)
    expect(card).not.toMatch(/marginPercent\s*=\s*25/)
    expect(card).not.toContain('supplier_cost) * (1')
    expect(read('app/itineraries/[id]/page.tsx')).not.toContain('marginPercent={25}')
  })

  it('the orphaned duplicate component and its strings are gone', () => {
    expect(existsSync(join(ROOT, 'components/ItineraryPL.tsx'))).toBe(false)
    expect(en.profitLoss.itineraryCard).toBeUndefined()
    expect(ja.profitLoss.itineraryCard).toBeUndefined()
  })
})

describe('new strings exist in both languages', () => {
  it('profitLoss, commissions and itineraryPL have the same keys in en and ja', () => {
    for (const ns of ['profitLoss', 'commissions', 'itineraryPL']) {
      expect(leaves(ja[ns]).sort(), ns).toEqual(leaves(en[ns]).sort())
    }
  })
})

describe('the trip page shows money controls to managers only', () => {
  const page = read('app/itineraries/[id]/page.tsx')
  it('gates Add expense, the expense dialog, the panel, the P&L card and the actual-P&L fetch', () => {
    expect(page).toContain("const canSeeFinance = canAccess(['admin', 'manager'])")
    expect(page).toMatch(/\.\.\.\(canSeeFinance\s*\n\s*\? \[\{ label: tStage\('addExpense'\)/)
    expect(page).toContain('{canSeeFinance && (\n        <AddExpenseFromItinerary')
    expect(page).toContain('{canSeeFinance && days.length > 0 && <ItineraryPL')
    expect(page).toContain('{canSeeFinance && (\n                  <ItineraryExpenses')
    expect(page).toContain('if (!params.id || !canSeeFinance) return\n    let live = true\n    fetch(`/api/profit-loss')
  })

  it('invoiced and balance due are measured on what was billed (VAT included), not the net revenue', () => {
    expect(page).not.toContain('actualPnl.total_revenue')
    expect(page).toContain('actualPnl.total_invoiced')
  })
})

describe('Profit & Loss screens', () => {
  const list = read('app/profit-loss/page.tsx')
  const detail = read('app/profit-loss/[id]/page.tsx')

  it('has a Tax tab that reads the recorded-VAT endpoint, and never computes VAT', () => {
    expect(list).toContain("import TaxTab from './TaxTab'")
    expect(list).toContain("tab === 'tax' && <TaxTab />")
    const tab = read('app/profit-loss/TaxTab.tsx')
    expect(tab).toContain('/api/profit-loss/tax')
    expect(tab).not.toMatch(/\*\s*0?\.14|14\s*\/\s*100|vat_rate/)
    for (const lib of ['lib/vat-report.ts', 'app/api/profit-loss/tax/route.ts']) {
      expect(read(lib), lib).not.toMatch(/vatFor|DEFAULT_VAT_RATE|\*\s*0?\.14/)
    }
  })

  it('surfaces the FX holes as a visible warning, on the list and on the trip', () => {
    expect(list).toContain('summary.complete === false')
    expect(list).toContain("t('fx.warningTitle')")
    expect(list).toContain('trip.fx_complete === false')
    expect(detail).toContain('pnlData.fx_complete === false')
  })

  it('prints each expense and invoice row in its own currency', () => {
    expect(detail).toContain('rowMoney(expense.amount, expense.currency, pnlData.currency)')
    expect(detail).toContain('rowMoney(invoice.total_amount, invoice.currency, pnlData.currency)')
    expect(detail).not.toContain('Number(expense.amount).toLocaleString')
  })

  it('shows a failed load as an error, not as an empty report', () => {
    expect(list).toContain('setLoadError(')
    expect(detail).toContain('setLoadError(')
  })

  it('labels the margin everywhere as profit over revenue', () => {
    expect(en.profitLoss.summary.marginBasis).toMatch(/profit.*revenue/i)
    expect(en.profitLoss.detail.marginBasis).toMatch(/profit.*revenue/i)
    expect(list).toContain("t('summary.marginBasis')")
    expect(detail).toContain("t('marginBasis')")
  })

  it('offers quoted in the status filter, and says revenue is net of VAT', () => {
    expect(list).toContain('<option value="quoted">')
    expect(list).toContain("t('summary.netOfVat')")
  })
})

describe('Expenses and Commissions screens', () => {
  const expensesPage = read('app/expenses/page.tsx')
  it('the total tile leaves out rejected and cancelled; cancelled has a badge and a filter', () => {
    expect(expensesPage).toContain('EXPENSE_NOT_A_COST_STATUSES')
    expect(expensesPage).toContain("cancelled: { label: 'Cancelled'")
    expect(expensesPage).toContain('<option value="cancelled">')
    expect(read('app/expenses/[id]/page.tsx')).toContain("cancelled: { label: 'Cancelled'")
  })

  it('new expenses and commissions start in the company currency, not a hardcoded EUR', () => {
    expect(expensesPage).toContain('currency: orgCurrency')
    expect(read('app/commissions/page.tsx')).toContain('currency: orgCurrency')
    expect(read('app/api/expenses/route.ts')).toContain('getOrgDefaultCurrency')
    expect(read('app/api/expenses/route.ts')).not.toContain("body.currency || 'EUR'")
    expect(read('app/api/commissions/route.ts')).toContain('getOrgDefaultCurrency')
  })

  it('the commission edit form sends only what the server persists, and shows the rest read-only', () => {
    const page = read('app/commissions/page.tsx')
    expect(page).toContain('{ status: formData.status, paid_date: formData.paid_date || null, notes: formData.notes }')
    expect(page).toContain("t('editLockedNote')")
    expect(page).toContain('{!editingId && (<>')
  })

  it('a failed mark-as-paid, delete or status change is not silent', () => {
    const commissions = read('app/commissions/page.tsx')
    expect(commissions).toContain("t('failedToDelete')")
    expect(commissions.match(/dialog\.alert\(t\('error'\)/g)!.length).toBeGreaterThanOrEqual(5)
    expect(expensesPage).toContain('body.error || t(\'failedToDeleteExpense\')')
  })

  it('formats commission money at the currency\'s precision (whole yen)', () => {
    expect(read('app/commissions/page.tsx')).not.toContain("minimumFractionDigits: 2, maximumFractionDigits: 2 })}`")
  })
})

describe('every finance handler checks the role itself', () => {
  const HANDLERS = [
    'app/api/expenses/route.ts', 'app/api/expenses/[id]/route.ts',
    'app/api/commissions/route.ts', 'app/api/commissions/[id]/route.ts',
    'app/api/profit-loss/route.ts', 'app/api/profit-loss/tax/route.ts',
  ]
  it.each(HANDLERS)('%s', file => {
    const code = read(file)
    const handlers = (code.match(/export async function (GET|POST|PUT|DELETE)/g) ?? []).length
    const checks = (code.match(/requireRole\(\['admin', 'manager'\]\)/g) ?? []).length
    expect(checks).toBe(handlers)
  })
})
