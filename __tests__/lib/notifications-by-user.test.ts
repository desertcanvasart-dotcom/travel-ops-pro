// Notifications were keyed to the legacy team_members roster (0 rows ever
// delivered in prod) and the bell listed every row to every viewer. These pin
// the new address (user_id), the per-viewer scope filter, and the manager
// recipient rule (organization_members, actor excluded).
import { describe, it, expect, vi } from 'vitest'

// lib/notifications builds a service-role client at import time; not needed here.
vi.mock('@/lib/notifications', () => ({ createNotifications: vi.fn(async () => ({ created: 0, failed: 0 })) }))
import { notificationScopeFilter } from '@/lib/notifications-scope'
import { orgManagerUserIds } from '@/lib/notify-managers'

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', U3 = '33333333-3333-3333-3333-333333333333'
const TM = '77777777-7777-7777-7777-777777777777'

describe('notificationScopeFilter', () => {
  it('selects rows addressed to the login, plus linked roster entries', () => {
    expect(notificationScopeFilter(U1, [])).toBe(`user_id.eq.${U1}`)
    expect(notificationScopeFilter(U1, [TM])).toBe(`user_id.eq.${U1},team_member_id.in.(${TM})`)
  })
  it('never interpolates anything that is not a uuid', () => {
    expect(notificationScopeFilter(U1, ['x,is_read.eq.false'])).toBe(`user_id.eq.${U1}`)
    expect(() => notificationScopeFilter('me,or.1', [])).toThrow()
  })
})

describe('orgManagerUserIds', () => {
  const db = (rows: Array<{ user_id: string | null; role: string }>) => ({
    from: () => ({ select: () => ({ eq: () => ({ in: async (_c: string, roles: string[]) => ({ data: rows.filter(r => roles.includes(r.role)), error: null }) }) }) }),
  })
  it('returns owner/admin/manager logins once each, minus the actor', async () => {
    const rows = [
      { user_id: U1, role: 'owner' }, { user_id: U2, role: 'admin' }, { user_id: U2, role: 'manager' },
      { user_id: U3, role: 'agent' }, { user_id: null, role: 'owner' },
    ]
    expect((await orgManagerUserIds(db(rows) as never, 'org')).sort()).toEqual([U1, U2])
    expect(await orgManagerUserIds(db(rows) as never, 'org', U1)).toEqual([U2])
  })
})
