import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXPENSE_CATEGORIES, TRIP_EXPENSE_CATEGORIES, supplierTypesForCategory } from '@/lib/expense-categories'
import { SUPPLIER_TYPE_VALUES } from '@/lib/supplier-types'

// The expense forms offer the suppliers a category is paid to (a meal → the
// restaurants), and every category needs a label in both languages.

describe('expense categories', () => {
  it('lists the right suppliers for the main trip costs', () => {
    expect(supplierTypesForCategory('meal')).toEqual(['restaurant'])
    expect(supplierTypesForCategory('hotel')).toEqual(['hotel'])
    expect(supplierTypesForCategory('guide')).toEqual(['guide'])
    expect(supplierTypesForCategory('transportation')).toContain('transport')
    expect(supplierTypesForCategory('tipping')).toEqual([])
  })

  it('only names built-in supplier types', () => {
    for (const c of EXPENSE_CATEGORIES) for (const t of c.supplierTypes) expect(SUPPLIER_TYPE_VALUES).toContain(t)
  })

  it('leaves office overheads off the itinerary form', () => {
    expect(TRIP_EXPENSE_CATEGORIES.map(c => c.value)).not.toContain('office')
  })

  it('has every category label in English and Japanese', () => {
    for (const locale of ['en', 'ja']) {
      const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf8'))
      for (const c of EXPENSE_CATEGORIES) expect(m.expenseModal.categories[c.value], `${locale}:${c.value}`).toBeTruthy()
    }
  })
})
