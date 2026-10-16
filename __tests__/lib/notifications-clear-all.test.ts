// The bell's "Clear all" deleted only the ten notifications it had loaded,
// without asking, and zeroed the badge however many were left (audit N6).
// It now asks, and the server deletes every one of the viewer's
// notifications in the active company. Also pinned: the email preferences
// every role can now save (N4) and the type labels the page shows (N7).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deleteOwnNotifications } from '@/lib/notifications-scope'
import { normalizePreferences } from '@/lib/notification-preferences'

const U1 = '11111111-1111-1111-1111-111111111111'
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

/** A notifications table of `total` rows for U1 in org-a; deletes remove them. */
function fakeDb(total: number) {
  let remaining = Array.from({ length: total }, (_, i) => `n${i}`)
  const seen: Array<Record<string, unknown>> = []
  const db = {
    from(table: string) {
      if (table === 'team_members') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }) }
      }
      const filters: Record<string, unknown> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { filters[c] = v; return chain },
        or: (f: string) => { filters.or = f; return chain },
        limit: (n: number) => {
          seen.push({ ...filters })
          return Promise.resolve({ data: remaining.slice(0, n).map(id => ({ id })), error: null })
        },
        delete: () => ({
          in: async (_c: string, ids: string[]) => {
            remaining = remaining.filter(id => !ids.includes(id))
            return { error: null }
          },
        }),
      }
      return chain
    },
  }
  return { db, seen, left: () => remaining.length }
}

describe('deleteOwnNotifications', () => {
  it("deletes all of the viewer's notifications, past the first page of 1000", async () => {
    const { db, seen, left } = fakeDb(2300)
    expect(await deleteOwnNotifications(db, U1, 'org-a')).toBe(2300)
    expect(left()).toBe(0)
    // Every page is scoped to the viewer and the active company.
    for (const f of seen) expect(f).toMatchObject({ org_id: 'org-a', or: `user_id.eq.${U1}` })
  })
  it('does nothing when there is nothing to clear', async () => {
    const { db } = fakeDb(0)
    expect(await deleteOwnNotifications(db, U1, 'org-a')).toBe(0)
  })
})

describe('the bell', () => {
  const bell = src('components/NotificationBell.tsx')
  it('asks before clearing, then clears through the API and re-reads the count', () => {
    expect(bell).toMatch(/confirmDialog\(t\('clearAllConfirm'\)\)/)
    expect(bell).toContain("fetch('/api/notifications', { method: 'DELETE' })")
    expect(bell).not.toMatch(/notifications\.map\(n =>\s*fetch/)
  })
  it("badges the server's unread count, not just the ten loaded", () => {
    expect(bell).toContain('data.unreadCount')
  })
  it('the notifications route has a DELETE that clears through deleteOwnNotifications', () => {
    expect(src('app/api/notifications/route.ts')).toMatch(/export async function DELETE[\s\S]*deleteOwnNotifications\(supabase, userId, orgId\)/)
  })
})

describe('notification email preferences', () => {
  it('keeps only what something reads (no in-app switch, no task_completed)', () => {
    const p = normalizePreferences({ in_app_enabled: false, task_completed: true } as never)
    expect(Object.keys(p).sort()).toEqual(['email_enabled', 'task_assigned', 'task_due_soon', 'task_overdue'])
  })
  it('the Notifications page, which every role opens, carries the email preferences', () => {
    expect(src('app/notifications/page.tsx')).toContain('<NotificationEmailPreferences />')
    expect(src('components/NotificationEmailPreferences.tsx')).toContain("fetch('/api/settings/notifications', {")
  })
})

describe('the Notifications page', () => {
  const page = src('app/notifications/page.tsx')
  const en = JSON.parse(src('messages/en.json')).notifications.types
  const ja = JSON.parse(src('messages/ja.json')).notifications.types
  it.each(['rate_changed', 'order_received', 'booking_change_request', 'trip_assigned'])(
    'labels %s in English and Japanese', type => {
      expect(en[type]).toBeTruthy()
      expect(ja[type]).toBeTruthy()
    })
  it('checks for a label instead of relying on t() to throw', () => {
    expect(page).toContain('t.has(typeKey)')
  })
  it('formats older dates in the UI language, not always Japanese', () => {
    expect(page).not.toMatch(/toLocaleDateString\('ja-JP'/)
    expect(page).toContain("locale === 'ja' ? 'ja-JP' : 'en-GB'")
  })
})
