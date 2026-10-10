// Round 15 — background jobs and team/org administration.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pickActiveMembership } from '@/lib/auth/active-org'
import { shiftDateISO } from '@/lib/today'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a signed-in invitee can accept', () => {
  it('the admin-only /api/invitations mutation gate does not apply to self-authenticating routes', () => {
    const m = src('middleware.ts')
    // /api/invitations/accept is in apiSelfAuthPrefixes AND under the
    // admin-only '/api/invitations' prefix; the role gate must skip it.
    expect(m).toContain("'/api/invitations/accept'")
    expect(m).toContain("{ prefix: '/api/invitations', roles: ['admin'] }")
    expect(m).toContain('if (matched && !isSelfAuthApi) {')
  })
})

describe('the activity log files each action under the workspace it was done in', () => {
  it('middleware passes the active-org cookie; the log uses the shared rule, not limit(1)', () => {
    expect(src('middleware.ts')).toContain('active_org_id: request.cookies.get(ACTIVE_ORG_COOKIE)?.value ?? null')
    const log = src('lib/activity-log.ts')
    expect(log).toContain('pickActiveMembership(')
    expect(log).toContain('input.active_org_id ?? null')
    expect(log).not.toMatch(/\.limit\(1\)\s*\n\s*\.maybeSingle\(\)/)
  })

  it('the rule picks the cookie\'s workspace when it is a real membership', () => {
    const rows = [
      { org_id: 'b', created_at: '2026-02-01' },
      { org_id: 'a', created_at: '2026-01-01' },
    ]
    expect(pickActiveMembership(rows, 'b')?.org_id).toBe('b')
    expect(pickActiveMembership(rows, 'zzz')?.org_id).toBe('a')
    expect(pickActiveMembership(rows, null)?.org_id).toBe('a')
  })
})

describe('task reminders', () => {
  const s = src('app/api/cron/task-reminders/route.ts')

  it('use the business day, not the host clock', () => {
    expect(s).toContain('const todayStr = businessToday()')
    expect(s).toContain('const tomorrowStr = shiftDateISO(todayStr, 1)')
    expect(s).not.toContain("toISOString().split('T')[0]")
    expect(s).not.toContain('setHours(0, 0, 0, 0)')
    expect(shiftDateISO('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('skip archived tasks and deactivated team members', () => {
    expect(s.match(/\.or\('archived\.eq\.false,archived\.is\.null'\)/g)).toHaveLength(2)
    expect(s.match(/assigned_member:team_members\(id, name, email, user_id, is_active\)/g)).toHaveLength(2)
    expect(s.match(/task\.assigned_member\.is_active === false\) continue/g)).toHaveLength(2)
  })

  it('formats a date-only due date in UTC, and POST is not recorded twice', () => {
    expect(s).toContain("timeZone: 'UTC'")
    expect(s).toContain('return getHandler(request)')
    expect(s).not.toContain('return GET(request)')
  })
})

describe('invoice reminders cannot be starved by one org\'s failing sends', () => {
  const s = src('app/api/cron/send-reminders/route.ts')
  it('the batch is ordered oldest-due first', () => {
    expect(s).toMatch(/\.order\('next_reminder_date', \{ ascending: true \}\)[\s\S]*\.limit\(50\)/)
  })
  it('a failed send is pushed to tomorrow so it does not hold its slot', () => {
    const failBranch = s.slice(s.indexOf('} else {', s.indexOf('if (result.success)')))
    expect(failBranch).toMatch(/\.update\(\{ next_reminder_date: addDaysISO\(today, 1\) \}\)/)
  })
})

describe('survey invites use the business day', () => {
  it('businessToday, not the host-local todayLocal', () => {
    const s = src('app/api/cron/survey-invites/route.ts')
    expect(s).toContain('const today = businessToday()')
    expect(s).not.toContain('= todayLocal()')
    expect(s).not.toContain("import { todayLocal }")
  })
})

describe('data-invariants alert email escapes stored text', () => {
  it('every interpolated field goes through escapeHtml', () => {
    const s = src('app/api/cron/data-invariants/route.ts')
    expect(s).toContain("import { escapeHtml } from '@/lib/html-escape'")
    expect(s).toContain('${escapeHtml(v.detail)}')
    expect(s).not.toContain('): ${v.detail}</li>')
  })
})

describe('invitations', () => {
  it('the inviter is the signed-in user, never the request body', () => {
    const s = src('app/api/invitations/route.ts')
    expect(s).toContain('const invited_by = await getCurrentUserId()')
    expect(s).not.toMatch(/const \{[^}]*invited_by[^}]*\} = body/)
  })

  it('verify sends the inviter name the accept page renders', () => {
    expect(src('app/invite/accept/page.tsx')).toContain('invitation?.invited_by_name')
    expect(src('app/api/invitations/verify/route.ts')).toContain('invited_by_name: invitation.inviter?.full_name')
  })
})

describe('deactivation cannot reach into another workspace', () => {
  it('PUT is_active:false on someone with another membership is refused (409)', () => {
    const s = src('app/api/profiles/[id]/route.ts')
    const put = s.slice(s.indexOf('export async function PUT'), s.indexOf('export async function DELETE'))
    expect(put).toContain('if (body.is_active === false) {')
    expect(put).toMatch(/\.eq\('user_id', id\)\s*\n\s*\.neq\('org_id', caller\.orgId\)/)
    expect(put).toContain('{ status: 409 }')
  })
})

describe('roster-addressed notifications honour the linked login\'s email choice', () => {
  it('preferences are read for team_member.user_id when no user_id is given', () => {
    const s = src('lib/notifications.ts')
    expect(s).toContain("team_member:team_members(id, name, email, user_id)")
    expect(s).toContain('getNotificationPreferences(supabaseAdmin, prefsUserId)')
  })
})
