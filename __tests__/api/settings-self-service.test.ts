// Settings audit (2026-10-14), findings 4, 5, 10 and 11 — the self-service
// parts of Settings:
//   4  Settings › Email saved a Signature and an Auto-Reply nothing read;
//   5  the Profile tab sent Email and Role, which the route silently dropped
//      behind "Saved", and stored Timezone / Company name nothing read;
//   10 /settings/profile announced "Password changed" without calling anything;
//   11 email signatures had no company: a person in both companies signed one
//      company's mail with the other's signature.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { changePassword, validatePasswordChange } from '@/lib/settings/password'

const h = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  calls: [] as { table: string; op: string; filters: Record<string, unknown>; vals?: unknown }[],
  orgId: 'org-a',
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }), headers: async () => new Headers() }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        update: (v: Record<string, unknown>) => { h.updates.push(v); return b },
        eq: () => b, select: () => b,
        single: async () => ({ data: { id: 'me' }, error: null }),
      }
      return b
    },
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const c = { table, op: 'select', filters: {} as Record<string, unknown>, vals: undefined as unknown }
      h.calls.push(c)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b, order: () => b,
        insert: (v: unknown) => { c.op = 'insert'; c.vals = v; return b },
        update: (v: unknown) => { c.op = 'update'; c.vals = v; return b },
        delete: () => { c.op = 'delete'; return b },
        eq: (k: string, v: unknown) => { c.filters[k] = v; return b },
        single: async () => ({ data: {}, error: null }),
        then: (r: (v: unknown) => void) => r({ data: [], error: null }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserId: async () => 'me',
  getCurrentOrgId: async () => h.orgId,
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
vi.mock('@/lib/supabase-secure', () => ({ getAuthenticatedUser: async () => ({ user: { id: 'me' } }) }))
vi.mock('@/lib/gmail-mailbox', () => ({ resolveMailbox: async () => ({ email: 'me@x.example', shared: false }) }))

import * as profile from '@/app/api/profile/route'
import * as emailSettings from '@/app/api/settings/email/route'
import * as signatures from '@/app/api/email/signatures/route'

const json = (method: string, body: unknown) => new NextRequest('http://x', { method, body: JSON.stringify(body) })

beforeEach(() => {
  h.updates.length = 0
  h.calls.length = 0
  h.orgId = 'org-a'
})

describe('profile: only name and phone, and nothing silently dropped', () => {
  it('name and phone are saved', async () => {
    expect((await profile.PUT(json('PUT', { full_name: 'Aya', phone: '+81 90' }))).status).toBe(200)
    expect(h.updates).toEqual([{ full_name: 'Aya', phone: '+81 90' }])
  })
  it('email, role, timezone or company name are a 400, not a "Saved"', async () => {
    for (const body of [{ email: 'x@y.z' }, { full_name: 'Aya', role: 'admin' }, { timezone: 'Asia/Tokyo' }, { company_name: 'X' }]) {
      expect((await profile.PUT(json('PUT', body))).status).toBe(400)
    }
    expect(h.updates).toEqual([])
  })
  it('the Profile page sends only those two and shows Email and Role read-only', () => {
    // The old Settings Profile tab was a copy of this page; /settings?tab=profile
    // now redirects here.
    const page = readFileSync('app/settings/profile/page.tsx', 'utf8')
    expect(page).toContain('JSON.stringify({ full_name: profile.full_name, phone: profile.phone ?? null })')
    expect(page).not.toMatch(/TIMEZONES|profile\?\.timezone|profile\?\.company_name/)
    expect(page).not.toMatch(/setProfile\(prev => prev \? \{ \.\.\.prev, (email|role):/)
  })
})

describe('Settings › Email: no dead signature or auto-reply', () => {
  it('the route only reports the mailbox, and has no PUT', async () => {
    const res = await emailSettings.GET()
    expect(await res.json()).toEqual({ gmail_connected: true, gmail_email: 'me@x.example', gmail_shared: false })
    expect((emailSettings as Record<string, unknown>).PUT).toBeUndefined()
  })
  it('the old Email tab is gone: its address lands on the page with the real signatures', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('../../lib/nav/redirects.js').SETTINGS_TABS.email).toBe('/settings/email')
    expect(readFileSync('app/settings/email/page.tsx', 'utf8')).toMatch(/tab === 'signatures'/)
    expect(readFileSync('app/settings/email/page.tsx', 'utf8')).not.toMatch(/auto_reply|saveEmailSettings/)
  })
})

describe('signatures belong to the company acting in', () => {
  it('GET lists this company\'s only; POST stamps it; defaults are unset within it', async () => {
    await signatures.GET(new NextRequest('http://x'))
    expect(h.calls[0].filters).toEqual({ user_id: 'me', org_id: 'org-a' })
    h.calls.length = 0
    h.orgId = 'org-b'
    await signatures.POST(json('POST', { name: 'n', content: 'c', isDefault: true }))
    expect(h.calls.find(c => c.op === 'update')?.filters).toEqual({ user_id: 'me', org_id: 'org-b' })
    expect(h.calls.find(c => c.op === 'insert')?.vals).toMatchObject({ user_id: 'me', org_id: 'org-b' })
  })
  it('PUT and DELETE reach only this company\'s row', async () => {
    await signatures.PUT(json('PUT', { id: 's1', name: 'n', content: 'c' }))
    await signatures.DELETE(json('DELETE', { id: 's1' }))
    for (const c of h.calls.filter(c => c.op !== 'select')) expect(c.filters).toMatchObject({ user_id: 'me', org_id: 'org-a' })
  })
})

describe('changing a password really changes it', () => {
  const auth = (currentOk: boolean, updateOk = true) => {
    const calls: string[] = []
    return {
      calls,
      signInWithPassword: async ({ password }: { email: string; password: string }) => {
        calls.push(`signIn:${password}`)
        return { error: currentOk ? null : new Error('Invalid login credentials') }
      },
      updateUser: async ({ password }: { password: string }) => {
        calls.push(`update:${password}`)
        return { error: updateOk ? null : new Error('weak') }
      },
    }
  }

  it('checks the current password, then calls auth.updateUser with the new one', async () => {
    const a = auth(true)
    expect(await changePassword(a, 'me@x.example', { current: 'old-pass-1', next: 'new-pass-22', confirm: 'new-pass-22' })).toEqual({ ok: true })
    expect(a.calls).toEqual(['signIn:old-pass-1', 'update:new-pass-22'])
  })
  it('a wrong current password changes nothing', async () => {
    const a = auth(false)
    expect(await changePassword(a, 'me@x.example', { current: 'nope', next: 'new-pass-22', confirm: 'new-pass-22' })).toEqual({ ok: false, error: 'passwordCurrentWrong' })
    expect(a.calls).toEqual(['signIn:nope'])
  })
  it('short, mismatched or unchanged passwords never reach Supabase', () => {
    expect(validatePasswordChange({ current: 'a', next: 'short', confirm: 'short' })).toBe('passwordTooShort')
    expect(validatePasswordChange({ current: 'a', next: 'long-enough', confirm: 'long-enougH' })).toBe('passwordMismatch')
    expect(validatePasswordChange({ current: 'long-enough', next: 'long-enough', confirm: 'long-enough' })).toBe('passwordSameAsCurrent')
  })
  it('the /settings/profile page uses it, and fakes nothing', () => {
    const page = readFileSync('app/settings/profile/page.tsx', 'utf8')
    expect(page).toContain('changePassword(createClient().auth')
    expect(page).toContain("fetch('/api/profile', {")
    expect(page).not.toMatch(/setTimeout|Total Bookings|Danger Zone|Jan 15, 2024/)
  })
})
