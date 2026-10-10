// Each organization has its own WhatsApp number (migration 20261125). The
// number a customer writes TO decides whose inbox the thread is in, and an org
// replies only from its own number. These pin the resolver's rules, the
// webhook's refusal to file a message under a guessed org, and the org filter
// on every inbox route (all service-role: nothing else filters them).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// A tiny in-memory stand-in for the Supabase query builder: enough of
// select / eq / in / is / not-null / limit / maybeSingle / insert / update for
// the resolver and the webhook.
// ---------------------------------------------------------------------------
type Row = Record<string, any>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  inserts: [] as Array<{ table: string; row: Row }>,
  failOn: null as string | null,
}))

function fakeClient() {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: Row | null = null
      let limitN: number | null = null
      let countOpts: { count?: string; head?: boolean } = {}
      const rows = () => (db.tables[table] ?? []).filter(r => filters.every(f => f(r)))
      const run = (single: 'one' | 'maybe' | null) => {
        if (db.failOn === table) return { data: null, error: { message: 'boom', code: 'XX000' } }
        if (mode === 'insert') {
          const row = { id: `${table}-${(db.tables[table] ?? []).length + 1}`, ...payload }
          ;(db.tables[table] ??= []).push(row)
          db.inserts.push({ table, row })
          return { data: single ? row : [row], error: null }
        }
        if (mode === 'update') {
          for (const r of rows()) Object.assign(r, payload)
          return { data: null, error: null }
        }
        let out = rows()
        if (limitN != null) out = out.slice(0, limitN)
        if (countOpts.count) return { data: countOpts.head ? null : out, count: rows().length, error: null }
        if (single) return { data: out[0] ?? null, error: null }
        return { data: out, error: null }
      }
      const b: any = {
        select: (_c?: string, opts?: { count?: string; head?: boolean }) => { if (opts) countOpts = opts; return b },
        insert: (row: Row) => { mode = 'insert'; payload = row; return b },
        update: (row: Row) => { mode = 'update'; payload = row; return b },
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
        in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return b },
        is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return b },
        not: (c: string, op: string, v: unknown) => {
          if (op === 'is' && v === null) filters.push(r => r[c] != null)
          return b
        },
        order: () => b,
        limit: (n: number) => { limitN = n; return b },
        maybeSingle: () => Promise.resolve(run('maybe')),
        single: () => Promise.resolve(run('one')),
        then: (res: any, rej: any) => Promise.resolve(run(null)).then(res, rej),
      }
      return b
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }))
vi.mock('@/lib/twilio-signature', () => ({
  verifyTwilioSignature: () => true,
  formDataToParams: (fd: FormData) => Object.fromEntries(fd.entries()),
}))
vi.mock('@/lib/copilot-intake', () => ({ createCopilotInboxEntry: vi.fn(async () => null) }))
vi.mock('@/lib/auth/default-org', () => ({ getDefaultOrgId: vi.fn(async () => 'org-default') }))

import { orgForWhatsAppNumber, senderForOrg, teamMemberInOrg, NO_WHATSAPP_SENDER } from '@/lib/whatsapp-org'
import { createCopilotInboxEntry } from '@/lib/copilot-intake'
import { POST as webhook } from '@/app/api/whatsapp/webhook/route'

const supabase = fakeClient() as any
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
/** Comments explain the rule; they must not be able to satisfy it. */
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

beforeEach(() => {
  db.tables = {}
  db.inserts = []
  db.failOn = null
  delete process.env.TWILIO_WHATSAPP_FROM
  delete process.env.TWILIO_WHATSAPP_NUMBER
  vi.mocked(createCopilotInboxEntry).mockClear()
})

const twoOrgs = () => {
  db.tables.organizations = [
    { id: 'org-a', whatsapp_number: '+819012345678' },
    { id: 'org-b', whatsapp_number: '+201001234567' },
    { id: 'org-c', whatsapp_number: null },
  ]
}

describe('orgForWhatsAppNumber', () => {
  it("resolves the org that owns the receiving number, in Twilio's form or plain", async () => {
    twoOrgs()
    expect(await orgForWhatsAppNumber(supabase, 'whatsapp:+819012345678')).toBe('org-a')
    expect(await orgForWhatsAppNumber(supabase, '+20 100 123 4567')).toBe('org-b')
  })

  it('a number nobody owns resolves to no org — never to the default', async () => {
    twoOrgs()
    expect(await orgForWhatsAppNumber(supabase, 'whatsapp:+14155238886')).toBeNull()
    expect(await orgForWhatsAppNumber(supabase, '')).toBeNull()
  })

  it('with no number configured anywhere, the single-number deployment keeps the default org', async () => {
    db.tables.organizations = [{ id: 'org-a', whatsapp_number: null }]
    expect(await orgForWhatsAppNumber(supabase, 'whatsapp:+14155238886')).toBe('org-default')
  })

  it('a lookup error throws (the webhook asks Twilio to retry) instead of falling back', async () => {
    db.failOn = 'organizations'
    await expect(orgForWhatsAppNumber(supabase, '+819012345678')).rejects.toBeTruthy()
  })
})

describe('senderForOrg', () => {
  it("is the org's own number", async () => {
    twoOrgs()
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886'
    expect(await senderForOrg(supabase, 'org-a')).toBe('whatsapp:+819012345678')
  })

  it('an org without a number may not send once any org has one — not even from the env sender', async () => {
    twoOrgs()
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886'
    expect(await senderForOrg(supabase, 'org-c')).toBeNull()
    expect(await senderForOrg(supabase, null)).toBeNull()
  })

  it('with no number configured anywhere, the env sender stands in', async () => {
    db.tables.organizations = [{ id: 'org-a', whatsapp_number: null }]
    process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886'
    expect(await senderForOrg(supabase, 'org-a')).toBe('whatsapp:+14155238886')
    delete process.env.TWILIO_WHATSAPP_NUMBER
    expect(await senderForOrg(supabase, 'org-a')).toBeNull()
  })

  it('says how to fix it', () => {
    expect(NO_WHATSAPP_SENDER).toMatch(/Company profile/)
  })
})

describe('teamMemberInOrg', () => {
  it("a linked member belongs to their login's org only", async () => {
    twoOrgs()
    db.tables.team_members = [{ id: 'tm-1', user_id: 'u-1' }]
    db.tables.organization_members = [{ org_id: 'org-a', user_id: 'u-1' }]
    expect(await teamMemberInOrg(supabase, 'tm-1', 'org-a')).toBe(true)
    expect(await teamMemberInOrg(supabase, 'tm-1', 'org-b')).toBe(false)
    expect(await teamMemberInOrg(supabase, 'tm-missing', 'org-a')).toBe(false)
  })

  it('an unlinked member is accepted only while there is a single organization', async () => {
    db.tables.team_members = [{ id: 'tm-2', user_id: null }]
    db.tables.organizations = [{ id: 'org-a' }]
    expect(await teamMemberInOrg(supabase, 'tm-2', 'org-a')).toBe(true)
    twoOrgs()
    expect(await teamMemberInOrg(supabase, 'tm-2', 'org-a')).toBe(false)
  })
})

describe('inbound webhook', () => {
  const inbound = (to: string, from = 'whatsapp:+447700900123') => {
    const fd = new FormData()
    fd.set('From', from)
    fd.set('To', to)
    fd.set('Body', 'Hello')
    fd.set('MessageSid', `SM-${to}-${from}`)
    fd.set('NumMedia', '0')
    return { formData: async () => fd, headers: new Headers(), url: 'https://x/api/whatsapp/webhook' } as any
  }

  it('files the thread under the org that owns the receiving number, with that org on the copilot thread', async () => {
    twoOrgs()
    const res = await webhook(inbound('whatsapp:+201001234567'))
    expect(res.status).toBe(200)
    const conv = db.inserts.find(i => i.table === 'whatsapp_conversations')!.row
    expect(conv.org_id).toBe('org-b')
    expect(conv.phone_number).toBe('+447700900123')
    expect(vi.mocked(createCopilotInboxEntry).mock.calls[0][0].orgId).toBe('org-b')
  })

  it('the same customer writing to two orgs gets a thread in each', async () => {
    twoOrgs()
    await webhook(inbound('whatsapp:+819012345678'))
    await webhook(inbound('whatsapp:+201001234567'))
    const convs = db.tables.whatsapp_conversations
    expect(convs.map(c => c.org_id).sort()).toEqual(['org-a', 'org-b'])
    expect(db.tables.whatsapp_messages.map(m => m.conversation_id).sort())
      .toEqual(convs.map(c => c.id).sort())
  })

  it('a message to a number no org owns is acknowledged and stores nothing', async () => {
    twoOrgs()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await webhook(inbound('whatsapp:+14155238886'))
    expect(res.status).toBe(200)
    expect(db.inserts).toEqual([])
    expect(createCopilotInboxEntry).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("matches the sender to a client of the receiving org only", async () => {
    twoOrgs()
    db.tables.clients = [
      { id: 'c-a', org_id: 'org-a', phone: '+447700900123', first_name: 'Aya', last_name: 'A' },
    ]
    await webhook(inbound('whatsapp:+201001234567'))
    expect(db.tables.whatsapp_conversations[0].client_id).toBeNull()
    await webhook(inbound('whatsapp:+819012345678'))
    expect(db.tables.whatsapp_conversations[1].client_id).toBe('c-a')
  })
})

describe('outbound: every send uses the org sender', () => {
  it('lib/twilio-whatsapp takes the org and resolves its sender, never the env number directly', () => {
    const lib = code('lib/twilio-whatsapp.ts')
    expect(lib).toContain('await senderForOrg(getAdmin(), orgId)')
    expect(lib).not.toContain('process.env.TWILIO_WHATSAPP_FROM')
    expect(lib).toMatch(/interface WhatsAppMessage \{[\s\S]*?orgId: string\n\}/)
  })

  it('the inbox reply route sends from the org number and has no sandbox fallback', () => {
    const r = code('app/api/whatsapp/messages/route.ts')
    expect(r).toContain('await senderForOrg(supabase, orgId)')
    expect(r).not.toContain('TWILIO_WHATSAPP_NUMBER')
    expect(r).not.toContain('+14155238886')
  })

  it('every sendWhatsAppMessage caller passes its org', () => {
    const callers = [
      'app/api/cron/survey-invites/route.ts',
      'app/api/templates/send/route.ts',
      'app/api/b2c/quotes/[id]/send/route.ts',
      'app/api/bookings/[id]/send-confirmation/route.ts',
      'app/api/copilot/drafts/[id]/send/route.ts',
      'app/api/whatsapp/test/route.ts',
      'app/api/whatsapp/send-pickup/route.ts',
      ...['contract', 'invoice', 'quote', 'receipt', 'reminder', 'status', 'supplier-document', 'thankyou']
        .map(n => `app/api/whatsapp/send-${n}/route.ts`),
      'app/api/whatsapp/notify-guide/route.ts',
      'app/api/whatsapp/notify-resource/route.ts',
    ]
    for (const f of callers) {
      const calls = code(f).match(/sendWhatsAppMessage\(\{[^}]*\}/g) ?? []
      expect(calls.length, f).toBeGreaterThan(0)
      for (const c of calls) expect(c, f).toMatch(/\borgId\b/)
    }
  })
})

describe('inbox routes are scoped to the caller org', () => {
  const scoped = (f: string) => {
    const c = code(f)
    expect(c, f).toContain('getCurrentOrgId()')
    expect(c, f).toMatch(/if \(!orgId\) return noOrgResponse\(\)/)
    return c
  }

  it('conversations: list, start, update and hide only the org thread', () => {
    const c = scoped('app/api/whatsapp/conversations/route.ts')
    expect(c.match(/\.eq\('org_id', orgId\)/g)!.length).toBeGreaterThanOrEqual(6)
    expect(c).toContain('org_id: orgId,')
    expect(c).toMatch(/\.eq\('org_id', orgId\)\s*\n\s*\.eq\('phone_number', cleanPhone\)/)
    expect(c).toContain('await teamMemberInOrg(supabase, candidate.id, orgId)')
  })

  it('assign: conversation and assignee are the org own', () => {
    const c = scoped('app/api/whatsapp/conversations/assign/route.ts')
    expect(c.match(/\.eq\('org_id', orgId\)/g)!.length).toBe(4)
    expect(c).toContain('await teamMemberInOrg(supabase, newAssigneeId, orgId)')
  })

  it('messages: read and send only through an org conversation', () => {
    const c = scoped('app/api/whatsapp/messages/route.ts')
    expect(c.match(/\.eq\('org_id', orgId\)/g)!.length).toBe(3)
    expect(c).toContain("insert({ org_id: orgId, phone_number: cleanPhone })")
  })

  it('activity: through the conversation org', () => {
    const c = scoped('app/api/whatsapp/activity/route.ts')
    expect(c).toContain("conversation:whatsapp_conversations!inner(org_id)")
    expect(c).toContain(".eq('conversation.org_id', orgId)")
    expect(c.match(/\.eq\('org_id', orgId\)/g)!.length).toBe(2)
  })

  it('AI draft loads and writes only the org conversation', () => {
    const c = scoped('app/api/whatsapp/ai-agent/draft/route.ts')
    expect(c).toMatch(/\.eq\('id', conversationId\)\s*\n\s*\.eq\('org_id', orgId\)\s*\n\s*\.maybeSingle\(\)/)
    expect(c).toMatch(/\.eq\('id', conversationId\)\s*\n\s*\.eq\('org_id', orgId\)\s*$/m)
  })

  it('unified inbox, client view, dashboard, reindex and suggestions filter WhatsApp by org', () => {
    expect(code('app/api/unified/conversations/route.ts'))
      .toMatch(/from\('whatsapp_conversations'\)[\s\S]*?\.eq\('org_id', orgId\)[\s\S]*?portal_message_threads/)
    const client = scoped('app/api/unified/client/[clientId]/route.ts')
    expect(client).toMatch(/from\('whatsapp_conversations'\)[\s\S]*?\.eq\('org_id', orgId\)\s*\n\s*\.eq\('client_id', clientId\)/)
    expect(code('app/api/dashboard/summary/route.ts'))
      .toMatch(/from\('whatsapp_conversations'\)\s*\n\s*\.select\('unread_count'\)\s*\n\s*\.eq\('org_id', orgId\)/)
    expect(code('app/api/copilot/knowledge/reindex/route.ts')).toContain(".eq('conversation.org_id', orgId)")
    expect(code('app/api/ai/suggest-reply/route.ts').match(/resolveThread\(conversationId, orgId\)/g)).toHaveLength(2)
    expect(code('app/api/clients/route.ts')).toMatch(/\.eq\('org_id', orgId\)\s*\n\s*\.eq\('phone_number', body\.link_whatsapp_phone\)/)
  })

  it('webhook: conversation keyed by (org, phone), stamped with the org', () => {
    const c = code('app/api/whatsapp/webhook/route.ts')
    expect(c).toContain('await orgForWhatsAppNumber(supabase, to)')
    expect(c).toMatch(/\.eq\('org_id', inboxOrgId\)\s*\n\s*\.eq\('phone_number', phoneNumber\)/)
    expect(c).toContain('org_id: inboxOrgId,')
    expect(c).toContain('orgId: inboxOrgId,')
    expect(c).not.toContain('getDefaultOrgId')
  })
})

describe('settings and schema', () => {
  it('the company profile saves an E.164 number, admin-only, 409 on a clash', () => {
    const r = code('app/api/organization/branding/route.ts')
    expect(r).toContain("'whatsapp_number',")
    expect(r).toContain('toWhatsAppE164(raw)')
    expect(r).toContain("requireRole(['admin'])")
    expect(r).toMatch(/error\?\.code === '23505'[\s\S]*?status: 409/)
    expect(src('app/components/CompanyProfileCard.tsx')).toContain("set('whatsapp_number', e.target.value)")
  })

  it('the migration adds the number and the org, backfills, and keys threads per org', () => {
    const m = src('migrations/20261125_whatsapp_per_org.sql')
    expect(m).toContain('ADD COLUMN IF NOT EXISTS whatsapp_number TEXT')
    expect(m).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS organizations_whatsapp_number_key[\s\S]*?WHERE whatsapp_number IS NOT NULL/)
    expect(m).toContain('ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id)')
    expect(m).toContain('ORDER BY created_at ASC LIMIT 1')
    expect(m).toContain('DROP CONSTRAINT IF EXISTS whatsapp_conversations_phone_number_key')
    expect(m).toContain('UNIQUE (org_id, phone_number)')
    expect(m).toContain('idx_whatsapp_conversations_org')
    const types = src('types/database.types.ts')
    expect(types).toContain('whatsapp_number: string | null')
  })
})

describe('20261125 can run before the code that stamps org_id', () => {
  it('a thread inserted without org_id gets the same org as the backfill', () => {
    const m = readFileSync(join(process.cwd(), 'migrations/20261125_whatsapp_per_org.sql'), 'utf8')
    expect(m).toContain('BEFORE INSERT ON public.whatsapp_conversations')
    expect(m).toContain('NEW.org_id := (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)')
  })
})

describe('before 20261125 runs, the inbox still loads', () => {
  it('a failed WhatsApp read leaves WhatsApp out instead of failing the inbox', () => {
    const list = readFileSync(join(process.cwd(), 'app/api/unified/conversations/route.ts'), 'utf8')
    expect(list).not.toContain('if (waError) throw waError')
    expect(list).toContain('for (const conv of waError ? [] : waData || [])')
    const client = readFileSync(join(process.cwd(), 'app/api/unified/client/[clientId]/route.ts'), 'utf8')
    expect(client).not.toContain('if (waError) throw waError')
    expect(client).toContain('(waError ? [] : waConversations)')
  })
})
