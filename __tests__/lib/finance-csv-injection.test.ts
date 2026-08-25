import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('CSV export neutralises formula injection', () => {
  it('lib/finance-export prefixes formula-triggering cells', () => {
    const code = src('lib/finance-export.ts')
    expect(code).toContain('csvSafeCell')
    // The trigger set: = + - @ tab CR
    expect(code).toMatch(/\/\^\[=\+\\-@\\t\\r\]\//)
  })

  it('the financial-reports page inline export also neutralises them', () => {
    const code = src('app/financial-reports/page.tsx')
    expect(code).toMatch(/\/\^\[=\+\\-@\\t\\r\]\//)
    // and quote-wraps (was raw .join(',') before)
    expect(code).toMatch(/replace\(\/"\/g, '""'\)/)
  })
})

describe('b2b quote PDF blocks SSRF and escapes fields', () => {
  const code = src('app/api/b2b/quotes/[id]/pdf/route.ts')
  it('intercepts requests and aborts off-document fetches', () => {
    expect(code).toContain('setRequestInterception(true)')
    expect(code).toMatch(/req\.abort\(\)/)
  })
  it('escapes user-controlled fields (client, partner, notes, service)', () => {
    expect(code).toContain("import { escapeHtml as esc }")
    expect(code).toMatch(/esc\(quote\.client_name/)
    expect(code).toMatch(/esc\(quote\.notes\)/)
    expect(code).toMatch(/esc\(service\.service_name/)
  })
})
