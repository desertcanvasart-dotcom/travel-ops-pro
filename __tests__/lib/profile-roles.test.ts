// The members list shows the role that gates (organization_members), not the
// user_profiles mirror. On production the two disagreed and the Users page
// role dropdown already said "Manager" for a member every gate treated as a
// viewer — so picking "Manager" fired no change and could not fix it.
import { describe, it, expect } from 'vitest'
import { withMembershipRoles } from '@/lib/auth/profile-roles'

describe('withMembershipRoles', () => {
  it('replaces the mirror with the membership role', () => {
    const [p] = withMembershipRoles(
      [{ id: 'u1', role: 'manager', email: 'x@y' }],
      [{ user_id: 'u1', role: 'viewer' }]
    )
    expect(p.role).toBe('viewer')
    expect(p.membership_role).toBe('viewer')
    expect(p.email).toBe('x@y')
  })

  it('shows an owner as owner, not as the admin the mirror stores', () => {
    const [p] = withMembershipRoles([{ id: 'u1', role: 'admin' }], [{ user_id: 'u1', role: 'owner' }])
    expect(p.role).toBe('owner')
  })

  it('keeps the mirror, and says so, for a profile with no membership here', () => {
    const [p] = withMembershipRoles([{ id: 'u9', role: 'agent' }], [])
    expect(p.role).toBe('agent')
    expect(p.membership_role).toBeNull()
  })

  it('takes the first (earliest) membership when a user has several — the row the middleware resolves', () => {
    const [p] = withMembershipRoles(
      [{ id: 'u1', role: 'agent' }],
      [{ user_id: 'u1', role: 'manager' }, { user_id: 'u1', role: 'viewer' }]
    )
    expect(p.role).toBe('manager')
  })
})
