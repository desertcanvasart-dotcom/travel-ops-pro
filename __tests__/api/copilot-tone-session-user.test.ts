// A9: the copilot tone a draft is written in is the SIGNED-IN user's. The
// draft and regenerate routes read the tone of a user_id from the request
// body (and /api/copilot/settings took one from the query/body), so a draft
// could use — and the settings route read or set — a colleague's tone.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ userId: 'me' as string | null }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserId: async () => ctx.userId,
}))

import { copilotToneFor } from '@/lib/copilot/tone'
import * as settings from '@/app/api/copilot/settings/route'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

beforeEach(() => {
  ctx.userId = 'me'
  setMockTables({
    copilot_settings: [
      { user_id: 'me', tone: 'friendly' },
      { user_id: 'colleague', tone: 'formal' },
    ],
  })
})

describe('copilotToneFor', () => {
  it("returns the given user's tone, or professional when unset or signed out", async () => {
    const sb = createMockClient() as never
    expect(await copilotToneFor(sb, 'me')).toBe('friendly')
    expect(await copilotToneFor(sb, 'nobody')).toBe('professional')
    expect(await copilotToneFor(sb, null)).toBe('professional')
  })
})

describe('draft routes take the tone of the session user', () => {
  for (const file of ['app/api/copilot/drafts/route.ts', 'app/api/copilot/drafts/[id]/regenerate/route.ts']) {
    it(file, () => {
      const code = src(file)
      expect(code).toContain('copilotToneFor(supabase, await getCurrentUserId())')
      expect(code).not.toMatch(/body\.user_id/)
    })
  }
})

describe('/api/copilot/settings', () => {
  it("GET returns the signed-in user's settings and ignores ?user_id", async () => {
    const res = await settings.GET(new NextRequest('http://x/api/copilot/settings?user_id=colleague'))
    const body = await res.json()
    expect(body.settings.tone).toBe('friendly')
  })

  it('GET without a session is 401', async () => {
    ctx.userId = null
    const res = await settings.GET(new NextRequest('http://x/api/copilot/settings'))
    expect(res.status).toBe(401)
  })
})
