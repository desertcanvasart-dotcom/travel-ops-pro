import { describe, it, expect } from 'vitest'
import { INVITABLE_ROLES, ORG_ROLES, roleAllows } from '@/lib/auth/roles'

// The one role system. These tests pin the two rules everything else leans on:
// the owner clears every gate without being named in it, and anything outside
// the vocabulary fails closed.

describe('roleAllows', () => {
  it('lets a listed role through', () => {
    expect(roleAllows('admin', ['admin', 'manager'])).toBe(true)
    expect(roleAllows('manager', ['admin', 'manager'])).toBe(true)
  })

  it('keeps an unlisted role out', () => {
    expect(roleAllows('agent', ['admin', 'manager'])).toBe(false)
    expect(roleAllows('viewer', ['admin'])).toBe(false)
  })

  it('lets the owner clear every gate, including ones that never name them', () => {
    // The alternative is adding 'owner' to every allowed-list in the codebase,
    // and the one list somebody forgets locks the owner out of a feature on
    // their own organisation.
    expect(roleAllows('owner', ['admin'])).toBe(true)
    expect(roleAllows('owner', ['manager'])).toBe(true)
    expect(roleAllows('owner', [])).toBe(true)
  })

  it('fails closed on no role at all', () => {
    expect(roleAllows(null, ['admin'])).toBe(false)
    expect(roleAllows(undefined, ['admin'])).toBe(false)
    expect(roleAllows('', ['admin'])).toBe(false)
  })

  it('fails closed on a role outside the vocabulary', () => {
    // 'member' is the legacy default the old invite flow wrote. After the
    // backfill it should not exist; if one appears it must not pass anything —
    // including a gate that literally lists it.
    expect(roleAllows('member', ['member'])).toBe(false)
    expect(roleAllows('superuser', ['admin'])).toBe(false)
  })
})

describe('the vocabulary', () => {
  it('is exactly the five roles', () => {
    expect([...ORG_ROLES]).toEqual(['owner', 'admin', 'manager', 'agent', 'viewer'])
  })

  it('never lets an invitation mint an owner', () => {
    expect(INVITABLE_ROLES).not.toContain('owner')
    // …but every non-owner role is invitable.
    expect([...INVITABLE_ROLES]).toEqual(['admin', 'manager', 'agent', 'viewer'])
  })
})
