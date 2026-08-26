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

describe('a half-finished signup is rescued, not stranded', () => {
  const page = src('app/invite/accept/page.tsx')

  it('detects an already-registered account (both Supabase shapes)', () => {
    expect(page).toContain('alreadyRegistered')
    expect(page).toMatch(/already\\s\*registered/)
    // confirmation-enabled obfuscation: user returned with no identities
    expect(page).toContain('identities.length === 0')
  })

  it('still calls accept so membership is granted on the second attempt', () => {
    // the accept fetch must NOT sit behind the "new account only" path
    const acceptIdx = page.indexOf("fetch('/api/invitations/accept'")
    const guardIdx = page.indexOf('if (alreadyRegistered) {')
    expect(acceptIdx).toBeGreaterThan(-1)
    expect(acceptIdx).toBeLessThan(guardIdx)
  })

  it('signs the returning user in and explains a password mismatch', () => {
    expect(page).toContain('signInWithPassword')
    expect(page).toContain('accountExistsSignIn')
  })
})
