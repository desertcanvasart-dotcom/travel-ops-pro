// lib/auth/two-factor: who must enter a code, who must set one up, and where
// the screens may send you afterwards.
import { describe, it, expect } from 'vitest'
import { twoFactorGate, verifiedFactors, safeNextPath } from '@/lib/auth/two-factor'

describe('twoFactorGate', () => {
  const base = { currentLevel: 'aal1', hasVerifiedFactor: false, role: 'manager', companyRequires: false }
  it('a device means a code, whatever the role or the switch', () => {
    for (const role of ['owner', 'admin', 'manager', 'agent', 'viewer']) {
      expect(twoFactorGate({ ...base, hasVerifiedFactor: true, role })).toBe('verify')
      expect(twoFactorGate({ ...base, hasVerifiedFactor: true, role, currentLevel: 'aal2' })).toBe('ok')
    }
  })
  it('no device: set-up only for owners, admins and managers, only when the company requires it', () => {
    expect(twoFactorGate(base)).toBe('ok')
    for (const role of ['owner', 'admin', 'manager']) expect(twoFactorGate({ ...base, role, companyRequires: true })).toBe('setup')
    for (const role of ['agent', 'viewer', null]) expect(twoFactorGate({ ...base, role, companyRequires: true })).toBe('ok')
  })
})

describe('verifiedFactors', () => {
  it('counts verified devices only — a half-finished set-up is not a device', () => {
    expect(verifiedFactors({ factors: [{ status: 'verified' }, { status: 'unverified' }] })).toHaveLength(1)
    expect(verifiedFactors({})).toEqual([])
    expect(verifiedFactors(null)).toEqual([])
  })
})

describe('safeNextPath', () => {
  it('a path on this site goes through; anything else goes to the dashboard', () => {
    expect(safeNextPath('/bookings?tab=open')).toBe('/bookings?tab=open')
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, '/two-factor', '/two-factor/setup']) {
      expect(safeNextPath(bad)).toBe('/dashboard')
    }
  })
})
