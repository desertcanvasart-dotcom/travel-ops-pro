// ============================================
// The Rates menu counts the rows each sheet lists
// ============================================
// lib/rates/sheet-tables.ts names, per sheet, the table its count reads. It
// must be the table the sheet's own API reads — the hub read the wrong
// sources three times (rates-hub-sources.test) — and cover every sheet the
// menus list. The count route is managers and above, like the sheets.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { SHEET_TABLES } from '@/lib/rates/sheet-tables'
import { RATE_GROUPS } from '@/lib/nav/config'

describe('rate sheet tables', () => {
  it('cover exactly the sheets in RATE_GROUPS', () => {
    const sheets = RATE_GROUPS.flatMap(g => g.items.map(i => i.href)).sort()
    expect(Object.keys(SHEET_TABLES).sort()).toEqual(sheets)
  })

  it('each is the table the sheet\'s own API lists from, filtered to the company', () => {
    for (const [href, sheet] of Object.entries(SHEET_TABLES)) {
      if (!sheet) continue
      const route = `app/api/rates/${sheet.api}/route.ts`
      expect(existsSync(route), route).toBe(true)
      const get = readFileSync(route, 'utf8').split('export async function GET')[1] ?? ''
      expect(get, href).toContain(`from('${sheet.table}')`)
      expect(get, href).toContain(".eq('org_id', orgId)")
    }
  })

  it('the count route is managers and above, per company, and a failed count is null not 0', () => {
    const route = readFileSync('app/api/rates/summary/route.ts', 'utf8')
    expect(route).toContain("requireRole(['admin', 'manager'])")
    expect(route).toContain(".eq('org_id', orgId)")
    expect(route).toContain('error ? null : count ?? 0')
  })

  it('no second menu column beside the sheets; the overview keeps its counts (operator 2026-11-07)', () => {
    // The column cost every sheet its width; the sheets fold in the sidebar.
    expect(existsSync('app/rates/layout.tsx')).toBe(false)
    const page = readFileSync('app/rates/page.tsx', 'utf8')
    expect(page).toContain('const sheetCounts = useRateCounts()')
    expect(page).toContain('<RatesOverview counts={sheetCounts} />')
  })
})
