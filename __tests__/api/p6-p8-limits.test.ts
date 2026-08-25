// ============================================
// P6 (resource limits) + P8 (AI reply hardening)
// ============================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('P6 — bounded queries and bodies', () => {
  it('b2b quote listing clamps ?limit', () => {
    expect(src('app/api/b2b/quotes/route.ts')).toMatch(/Math\.min\(Math\.max\(rawLimit, 1\), 200\)/)
  })
  it('capacity/check rejects a reversed range and caps the span', () => {
    const c = src('app/api/capacity/check/route.ts')
    expect(c).toMatch(/effectiveEndDate < start_date/)
    expect(c).toMatch(/spanDays > 366/)
  })
  it('revision history is bounded (b2b + b2c)', () => {
    expect(src('app/api/b2b/quotes/[id]/revisions/route.ts')).toMatch(/\.limit\(200\)/)
    expect(src('app/api/b2c/quotes/[id]/revisions/route.ts')).toMatch(/\.limit\(200\)/)
  })
  it('bulk-update caps the id fan-out', () => {
    expect(src('app/api/b2b/quotes/bulk-update/route.ts')).toMatch(/quote_ids\.length > 500/)
  })
  it('accounts-receivable is bounded', () => {
    expect(src('app/api/accounts-receivable/route.ts')).toMatch(/\.limit\(1000\)/)
  })
  it('avatar rejects oversized uploads before parsing the body', () => {
    const a = src('app/api/avatar/upload/route.ts')
    // content-length check must come before formData()
    const clIdx = a.indexOf("request.headers.get('content-length')")
    const fdIdx = a.indexOf('await request.formData()')
    expect(clIdx).toBeGreaterThan(-1)
    expect(clIdx).toBeLessThan(fdIdx)
  })
  it('the integration webhook caps the request body', () => {
    const w = src('app/api/webhooks/integrations/[token]/route.ts')
    expect(w).toMatch(/content-length/)
    expect(w).toMatch(/1_048_576/)
    expect(w).toMatch(/413/)
  })
})

describe('P8 — AI reply hardening', () => {
  const lib = src('lib/ai/reply-suggestions.ts')
  it('validates the inbox message belongs to the thread', () => {
    expect(lib).toMatch(/thread_id !== threadId/)
  })
  it('tells the model the customer message is untrusted data', () => {
    expect(lib).toMatch(/UNTRUSTED DATA/)
  })
  it('does not return raw error messages to the caller', () => {
    expect(lib).not.toMatch(/error:\s*err\?\.message/)
    expect(lib).not.toMatch(/error:\s*`Failed to store drafts: \$\{insErr\.message\}`/)
  })
})
