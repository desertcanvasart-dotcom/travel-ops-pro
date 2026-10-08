// sendEmailInternal sent every organization's mail (invoice reminders, booking
// confirmations, quotes, survey invites, trip chat) through the FIRST row of
// gmail_tokens, whichever organization's mailbox that was, and Bcc'd the
// platform's GMAIL_USER. Mail for an organization now goes out from that
// organization's own mailbox or not at all.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  // Two organizations, each with one member who connected Gmail; the
  // platform mailbox belongs to neither.
  const members: Record<string, { user_id: string }[]> = {
    'org-A': [{ user_id: 'a-owner' }, { user_id: 'a-agent' }],
    'org-B': [{ user_id: 'b-owner' }],
    'org-C': [{ user_id: 'c-owner' }], // nobody connected
  }
  const tokens = [
    { user_id: 'b-owner', email: 'office@org-b.example' }, // first row: what the old code always used
    { user_id: 'a-owner', email: 'office@org-a.example' },
    { user_id: 'a-agent', email: 'agent@org-a.example' },
    { user_id: 'platform', email: 'platform@autoura.example' },
  ]
  const sent: { userId: string; raw: string }[] = []

  function query(table: string) {
    const f: { eq?: [string, unknown]; in?: string[]; ilike?: string } = {}
    const rows = () => {
      if (table === 'organization_members') return members[f.eq![1] as string] ?? []
      let r = tokens
      if (f.in) r = r.filter(t => f.in!.includes(t.user_id))
      if (f.ilike) r = r.filter(t => t.email.toLowerCase() === f.ilike!.toLowerCase())
      return r
    }
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { f.eq = [c, v]; return b },
      in: (_c: string, v: string[]) => { f.in = v; return b },
      ilike: (_c: string, v: string) => { f.ilike = v; return b },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: rows()[0] ?? null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows() }),
    }
    return b
  }
  return { tokens, sent, client: { from: query } }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.client }))
// Each organization's own name, as Settings holds it (lib/org-identity).
vi.mock('@/lib/org-identity', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/org-identity')>()
  const names: Record<string, string> = { 'org-A': 'Nile Journeys', 'org-B': 'Red Sea Tours' }
  return {
    ...real,
    businessIdentity: () => ({ ...real.EMPTY_IDENTITY, name: 'Autoura' }),
    orgIdentity: async (orgId?: string | null) => ({ ...real.EMPTY_IDENTITY, name: (orgId && names[orgId]) || 'Autoura' }),
  }
})
vi.mock('@/lib/gmail', () => ({
  GmailAuthError: class extends Error {},
  getAuthenticatedGmail: async (userId: string) => ({
    emailAddress: h.tokens.find(t => t.user_id === userId)?.email ?? '',
    gmail: {
      users: {
        messages: {
          send: async ({ requestBody }: { requestBody: { raw: string } }) => {
            h.sent.push({ userId, raw: Buffer.from(requestBody.raw, 'base64url').toString() })
            return { data: { id: 'msg' } }
          },
        },
      },
    },
  }),
}))

import { sendEmailInternal } from '@/lib/email-send'

const mail = { to: 'guest@example.com', subject: 'Payment due', html: '<p>hi</p>' }
const headers = () => h.sent.at(-1)!.raw.split('\r\n\r\n')[0]

beforeEach(() => {
  h.sent.length = 0
  process.env.GMAIL_USER = 'platform@autoura.example'
})

describe('sendEmailInternal: whose mailbox', () => {
  it('sends an organization’s mail from that organization’s mailbox, not the first one connected', async () => {
    const r = await sendEmailInternal({ ...mail, orgId: 'org-A' })
    expect(r.success).toBe(true)
    expect(h.sent.at(-1)!.userId).toBe('a-owner')
    expect(headers()).toMatch(/^From: Nile Journeys <office@org-a\.example>$/m)
  })

  it('prefers the member who clicked Send, when they connected their own', async () => {
    await sendEmailInternal({ ...mail, orgId: 'org-A', senderUserId: 'a-agent' })
    expect(h.sent.at(-1)!.userId).toBe('a-agent')
  })

  it('sends nothing, rather than from another organization’s mailbox, when none of its members connected one', async () => {
    const r = await sendEmailInternal({ ...mail, orgId: 'org-C' })
    expect(r).toMatchObject({ success: false, noAccount: true })
    expect(h.sent).toHaveLength(0)
  })

  it('sends platform mail from the GMAIL_USER mailbox', async () => {
    await sendEmailInternal(mail)
    expect(h.sent.at(-1)!.userId).toBe('platform')
  })

  it('copies nothing to the platform address', async () => {
    await sendEmailInternal({ ...mail, orgId: 'org-B' })
    expect(headers()).not.toMatch(/^Bcc:/m)
    expect(h.sent.at(-1)!.raw).not.toContain('platform@autoura.example')
  })

  it('names the platform on the platform’s own mail', async () => {
    await sendEmailInternal(mail)
    expect(headers()).toMatch(/^From: Autoura <platform@autoura\.example>$/m)
  })
})
