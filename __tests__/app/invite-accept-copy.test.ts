// The invite success screen used to promise one thing and do another: it said
// "Your account has been created successfully / Redirecting to dashboard" in
// every case, including the two where nothing was created and the user was
// being sent to /login instead.
//
// The worst of those is `mode: 'link'` — the address already had a CONFIRMED
// account. An invitation must never reset a live account's password, so the
// server deliberately leaves it alone; the password the invitee just typed was
// never set. Telling them "account created" and dropping them at a login form
// invites them to type that password and watch it fail.
//
// These tests pin the copy AND its translations, because next-intl renders the
// raw key when one is missing — a missing Japanese string is silent, and the
// customer-facing side of this product is Japanese.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PAGE = 'app/invite/accept/page.tsx'
const src = readFileSync(join(ROOT, PAGE), 'utf8')

const messages = (locale: string) =>
  JSON.parse(readFileSync(join(ROOT, 'messages', `${locale}.json`), 'utf8')) as Record<
    string,
    Record<string, string>
  >

/** Every t('…') the page asks for. The namespace is useTranslations('invite'). */
function keysUsed(): string[] {
  return [...src.matchAll(/\bt\('([^']+)'\)/g)].map(m => m[1])
}

describe('invite accept page translations', () => {
  it('asks for a non-trivial number of keys (the regex still matches)', () => {
    expect(keysUsed().length).toBeGreaterThan(5)
  })

  for (const locale of ['en', 'ja']) {
    it(`every key the page uses exists in ${locale}.json`, () => {
      const invite = messages(locale).invite
      expect(invite).toBeDefined()
      const missing = [...new Set(keysUsed())].filter(k => typeof invite[k] !== 'string')
      expect(missing).toEqual([])
    })
  }

  it('the two locales define the same invite keys', () => {
    expect(Object.keys(messages('ja').invite).sort()).toEqual(
      Object.keys(messages('en').invite).sort(),
    )
  })
})

describe('the success screen matches where it actually sends you', () => {
  it('tracks which of the three endings happened', () => {
    expect(src).toMatch(/setOutcome\('existing'\)/)
    expect(src).toMatch(/setOutcome\('signIn'\)/)
    expect(src).toMatch(/setOutcome\('dashboard'\)/)
  })

  it("the 'link' mode — an existing confirmed account — does not claim one was created", () => {
    // The branch that returns early to /login must set the 'existing' outcome,
    // so the screen says "sign in with that account's existing password".
    const linkBranch = src.slice(src.indexOf("result.mode === 'link'"))
    const returnIdx = linkBranch.indexOf('return')
    expect(returnIdx).toBeGreaterThan(-1)
    expect(linkBranch.slice(0, returnIdx)).toContain("setOutcome('existing')")
  })

  it('only the dashboard ending promises the dashboard', () => {
    expect(src).toMatch(/outcome === 'dashboard'\s*\?\s*t\('redirectingToDashboard'\)/)
    expect(src).toContain("t('redirectingToSignIn')")
  })

  it('the copy for an existing account tells them WHICH password to use', () => {
    const en = messages('en').invite.accountExistsNowLinked
    expect(en).toMatch(/existing password/i)
    // The whole point: not the one they just typed.
    expect(en).toMatch(/not the one you just entered/i)
  })
})
