// P5b — supplier-invoice documents are private, served by signed URL
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('upload route', () => {
  const code = src('app/api/supplier-invoices/[id]/upload/route.ts')

  it('creates the bucket PRIVATE, not public', () => {
    expect(code).toMatch(/public:\s*false/)
    expect(code).not.toMatch(/public:\s*true/)
  })

  it('no longer stores or returns a public URL', () => {
    expect(code).not.toContain('getPublicUrl')
    expect(code).not.toMatch(/document_url:\s*urlData/)
    // stores the app's own signed-URL route instead
    expect(code).toMatch(/document_url: `\/api\/supplier-invoices\/\$\{id\}\/document`/)
  })

  it('derives the extension from the validated MIME, not the filename', () => {
    expect(code).toContain('EXT_FOR_TYPE')
    expect(code).not.toContain('safeExtension(file.name')
  })

  it('sniffs the actual bytes against the declared type', () => {
    expect(code).toContain('sniffType(buffer)')
    expect(code).toMatch(/sniffed !== file\.type/)
  })
})

describe('download route', () => {
  const path = 'app/api/supplier-invoices/[id]/document/route.ts'
  it('exists', () => {
    expect(existsSync(join(ROOT, path))).toBe(true)
  })
  it('is org-scoped and serves a short-lived signed URL', () => {
    const code = src(path)
    expect(code).toContain('getCurrentOrgId')
    expect(code).toMatch(/\.eq\('org_id', orgId\)/)
    expect(code).toContain('createSignedUrl')
    expect(code).toMatch(/SIGNED_URL_TTL_SECONDS = 300/)
  })
})

describe('frontend links through the download route', () => {
  it('the detail page does not link to a raw document_url', () => {
    const code = src('app/supplier-invoices/[id]/page.tsx')
    expect(code).toMatch(/href=\{`\/api\/supplier-invoices\/\$\{id\}\/document`\}/)
    expect(code).not.toMatch(/href=\{invoice\.document_url/)
  })
})
