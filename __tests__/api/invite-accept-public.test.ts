// The invitee has NO session: they click an emailed link and accept right
// after signUp. Both endpoints that flow touches must be exempt from the
// middleware session gate, or the invite dies on "Invalid Invitation /
// Unauthorized" (what production did until this fix).
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('invitation accept is reachable without a session', () => {
  const middleware = src('middleware.ts')

  it('the public page /invite/accept is a public route', () => {
    expect(middleware).toContain("'/invite/accept'")
  })

  it('both token-authenticated invitation APIs bypass the session gate', () => {
    expect(middleware).toContain("'/api/invitations/verify'")
    expect(middleware).toContain("'/api/invitations/accept'")
  })

  it('the accept handler lives on its own route, not on /api/invitations', () => {
    // /api/invitations keeps list/create/delete behind the session gate; only
    // the token-checked accept is exempt, so exempting it cannot expose them.
    expect(existsSync(join(ROOT, 'app/api/invitations/accept/route.ts'))).toBe(true)
    expect(src('app/api/invitations/route.ts')).not.toContain('export async function PUT')
    expect(src('app/api/invitations/accept/route.ts')).toContain('export async function PUT')
  })

  it('the accept page calls the exempt route', () => {
    expect(src('app/invite/accept/page.tsx')).toContain("fetch('/api/invitations/accept'")
  })

  it('accept still validates the token itself (expiry, reuse, existence)', () => {
    const code = src('app/api/invitations/accept/route.ts')
    expect(code).toContain("Invalid invitation token")
    expect(code).toContain('already been used')
    expect(code).toContain('has expired')
  })
})
