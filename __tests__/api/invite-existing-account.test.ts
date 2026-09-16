// Inviting someone the project already knows.
//
// The operator hit this on a sandbox where they were the only member: every
// invitation came back "User with this email already exists". The check asked
// user_profiles, which has NO org_id — it is one global row per account in the
// whole Supabase project — so the question it really asked was "has this
// address ever signed up here at all". Any address the project had ever seen
// was refused, from every workspace, with no way to add them.
//
// The check immediately after it was already scoped correctly, and its comment
// stated the rule: the same person may legitimately be invited by several
// agencies. The accept route had been built for it too — decideAcceptAction
// returns 'link' for an existing confirmed account, joining it to the org
// without touching its password. Only the invite refused, so that path could
// never be reached from the UI.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decideAcceptAction } from '@/lib/invitation-accept'

const route = readFileSync(join(process.cwd(), 'app', 'api', 'invitations', 'route.ts'), 'utf8')

describe('the invitation duplicate check', () => {
  it('is scoped to membership of THIS workspace', () => {
    // The distinguishing mark: organization_members, filtered by org_id.
    expect(route).toContain("from('organization_members')")
    const at = route.indexOf("from('organization_members')")
    const block = route.slice(at, at + 400)
    expect(block, 'the membership lookup must be scoped by org_id').toContain(".eq('org_id', orgId)")
  })

  it('no longer refuses purely because the address exists somewhere', () => {
    // The old wording is the symptom the operator reported. If it comes back,
    // so has the bug.
    expect(route).not.toContain('User with this email already exists')
  })

  it('says what is actually wrong when it does refuse', () => {
    expect(route).toContain('already a member of this workspace')
  })

  it('keeps refusing a second pending invite for the same workspace', () => {
    // Unchanged, and still org-scoped: the fix must not have loosened this.
    expect(route).toContain('Pending invitation already exists for this email')
    const at = route.indexOf("from('user_invitations')")
    expect(route.slice(at, at + 400)).toContain(".eq('org_id', orgId)")
  })
})

describe('what happens when that person accepts', () => {
  it('an existing CONFIRMED account is linked, not recreated or reset', () => {
    // An invitation must never become a password-reset oracle: the account is
    // joined to the org and its password left alone.
    const decision = decideAcceptAction({
      id: 'user-1', email: 'x@y.z', email_confirmed_at: '2026-01-01T00:00:00Z',
    } as Parameters<typeof decideAcceptAction>[0])
    expect(decision).toEqual({ action: 'link', userId: 'user-1' })
  })

  it('an account stranded unconfirmed is repaired rather than blocked', () => {
    const decision = decideAcceptAction({
      id: 'user-2', email: 'x@y.z', email_confirmed_at: null,
    } as Parameters<typeof decideAcceptAction>[0])
    expect(decision).toEqual({ action: 'repair', userId: 'user-2' })
  })

  it('a genuinely new address is created', () => {
    expect(decideAcceptAction(null)).toEqual({ action: 'create' })
  })
})
