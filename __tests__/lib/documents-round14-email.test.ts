import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMessageId, threadingFromMessageIds, threadingLines, storedReplyHeaders } from '@/lib/email/reply-threading'
import { pickConversationUpdates } from '@/lib/email/conversation-updates'
import { knownContactEmailsForOrg, processNewEmailLeads, type LeadExtraction } from '@/lib/email/email-leads'
import { escapeHtml } from '@/lib/html-escape'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

type Row = Record<string, any>

// A small query-builder stand-in: eq / is / not-null / ilike / order / limit,
// awaited directly or through maybeSingle, and update / insert.
function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0
  return {
    tables,
    from(table: string) {
      const data = (tables[table] ??= [])
      const filters: Array<(r: Row) => boolean> = []
      let order: { col: string; asc: boolean } | null = null
      let limit = Infinity
      let patch: Row | null = null
      let inserted: Row | null = null
      const run = () => {
        let out = data.filter(r => filters.every(f => f(r)))
        if (patch) { for (const r of out) Object.assign(r, patch); return { data: null, error: null } }
        if (order) out = [...out].sort((a, b) => (a[order!.col] < b[order!.col] ? -1 : 1) * (order!.asc ? 1 : -1))
        return { data: out.slice(0, limit), error: null }
      }
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return q },
        not: (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push(r => r[c] != null); return q },
        ilike: (c: string, v: string) => { filters.push(r => String(r[c] ?? '').toLowerCase() === v.toLowerCase()); return q },
        order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return q },
        limit: (n: number) => { limit = n; return q },
        maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
        single: async () => ({ data: inserted, error: null }),
        then: (res: (v: unknown) => void) => res(run()),
        update: (p: Row) => { patch = p; return q },
        insert: (row: Row) => { inserted = { id: `new-${++seq}`, ...row }; data.push(inserted); return q },
      }
      return q
    },
  }
}

describe('reply threading from stored Message-IDs', () => {
  it('only a real Message-ID is used — never our own row id, never a header with a line break', () => {
    expect(isMessageId('<abc.123@mail.gmail.com>')).toBe(true)
    expect(isMessageId('3f1c2a9e-1111-2222-3333-444455556666')).toBe(false)
    expect(isMessageId('<a@b>\r\nBcc: x@evil.com')).toBe(false)
    expect(isMessageId(null)).toBe(false)
  })

  it('answers the newest message; References lists them oldest to newest', () => {
    expect(threadingFromMessageIds(['<1@x>', 'junk', '<2@x>'])).toEqual({ inReplyTo: '<2@x>', references: '<1@x> <2@x>' })
    expect(threadingFromMessageIds([])).toEqual({})
    expect(threadingLines({ inReplyTo: '<2@x>', references: '<1@x> <2@x>' })).toEqual(['In-Reply-To: <2@x>', 'References: <1@x> <2@x>'])
    expect(threadingLines({})).toEqual([])
  })

  it('reads the conversation\'s stored messages', async () => {
    const db = fakeDb({
      email_messages: [
        { conversation_id: 'c1', rfc_message_id: '<old@x>', sent_at: '2026-10-01' },
        { conversation_id: 'c1', rfc_message_id: '<new@x>', sent_at: '2026-10-02' },
        { conversation_id: 'c1', rfc_message_id: null, sent_at: '2026-10-03' },
        { conversation_id: 'c2', rfc_message_id: '<other@x>', sent_at: '2026-10-04' },
      ],
    })
    expect(await storedReplyHeaders(db, 'c1')).toEqual({ inReplyTo: '<new@x>', references: '<old@x> <new@x>' })
    expect(await storedReplyHeaders(db, null)).toEqual({})
  })
})

describe('copilot draft send builds its email like /api/gmail/send', () => {
  const r = src('app/api/copilot/drafts/[id]/send/route.ts')
  it('header-safe To, encoded Subject, base64 body, the conversation\'s thread and Message-IDs', () => {
    expect(r).toContain('`To: ${headerSafe(thread.contact_info)}`')
    expect(r).toContain('`Subject: ${encodeEmailHeader(headerSafe(subject))}`')
    expect(r).toContain("'MIME-Version: 1.0'")
    expect(r).toContain("'Content-Transfer-Encoding: base64'")
    expect(r).toContain('storedReplyHeaders(supabase, thread.email_conversation_id)')
    expect(r).toContain('threadId: gmailThreadId')
    expect(r).not.toContain('In-Reply-To: ${thread.email_conversation_id}')
  })
})

describe('Gmail poll and labels act on the session user', () => {
  it('POST /api/gmail/poll reads no body', () => {
    const r = src('app/api/gmail/poll/route.ts')
    const post = r.slice(r.indexOf('export async function POST'))
    expect(post).toContain('const userId = await getCurrentUserId()')
    expect(post).not.toContain('request.json()')
    expect(src('lib/use-email-polling.ts')).not.toContain('JSON.stringify({ userId })')
  })

  it('labels: no shared OAuth2 client; one Gmail per request', () => {
    const r = src('app/api/gmail/labels/route.ts')
    expect(r).not.toContain('new google.auth.OAuth2')
    expect(r).not.toContain('setCredentials({')
    expect(r).toContain('getAuthenticatedGmail(userId)')
  })
})

describe('an email links only to the receiving organisation\'s client', () => {
  it('the migration matches clients of the mailbox user\'s organisations and clears foreign links', () => {
    const m = src('migrations/20261127_email_client_link_in_org.sql')
    expect(m).toContain('CREATE OR REPLACE FUNCTION public.auto_link_email_to_client()')
    expect(m).toContain('SELECT om.org_id FROM organization_members om WHERE om.user_id = NEW.user_id')
    expect(m).toContain('NEW.user_id IS NOT NULL')
    expect(m).toMatch(/UPDATE public\.email_conversations ec\s+SET client_id = NULL/)
  })

  it('known contacts are the org\'s clients and partners, plus the shared suppliers', async () => {
    const db = fakeDb({
      clients: [{ org_id: 'A', email: 'a@x.com' }, { org_id: 'B', email: 'b@x.com' }],
      b2b_partners: [{ org_id: 'A', email: 'pa@x.com' }, { org_id: 'B', email: 'pb@x.com' }],
      suppliers: [{ contact_email: 'Hotel@x.com' }],
    })
    expect([...await knownContactEmailsForOrg(db, 'A')].sort()).toEqual(['a@x.com', 'hotel@x.com', 'pa@x.com'])
  })

  it('another organisation\'s client writing in becomes a lead here, not a "known contact"', async () => {
    const request: LeadExtraction = {
      is_travel_request: true, first_name: 'Jane', last_name: 'Doe', phone: null, country: null, language: null,
      destinations: [], travel_dates: null, travellers: null, summary: null,
    }
    const db = fakeDb({
      email_conversations: [{ id: 'c1', user_id: 'uA', client_id: null, subject: 'Trip', lead_checked_at: null, created_at: '2026-10-01' }],
      email_messages: [{ conversation_id: 'c1', direction: 'inbound', from_address: 'jane@x.com', subject: 'Trip', body_text: 'A trip please', sent_at: '2026-10-01T00:00:00Z' }],
      gmail_tokens: [], organizations: [{ id: 'A', office_email_addresses: [] }, { id: 'B', office_email_addresses: [] }],
      organization_members: [{ user_id: 'uA', org_id: 'A', created_at: '2026-01-01' }],
      clients: [{ id: 'cb', org_id: 'B', email: 'jane@x.com' }], suppliers: [], b2b_partners: [], email_lead_dismissals: [],
    })
    const out = await processNewEmailLeads(db, { extract: async () => request })
    expect(out[0].outcome).toBe('lead_created')
    expect(db.tables.clients.find(c => c.org_id === 'A')).toMatchObject({ email: 'jane@x.com', status: 'lead' })
  })

  it('a client\'s page lists only conversations in its org members\' mailboxes', () => {
    const r = src('app/api/unified/client/[clientId]/route.ts')
    expect(r).toContain(".in('user_id', memberIds)")
  })

  it('copilot intake files under the mailbox org and matches only its clients', () => {
    const s = src('lib/email/sync-mailbox.ts')
    expect(s).toContain('orgForMailbox(supabase, user_id)')
    expect(s).toMatch(/\.from\('clients'\)\s*\n\s*\.select\('id, first_name, last_name'\)\s*\n\s*\.eq\('org_id', orgId\)/)
    expect(s).toMatch(/clientName: matchedClient[\s\S]{0,200}orgId,\n\s*\},\n\s*supabase/)
  })
})

describe('shared-inbox replies', () => {
  it('send from the conversation owner\'s mailbox only when they are in the caller\'s org; else drop the thread and thread by Message-ID', () => {
    const r = src('app/api/gmail/send/route.ts')
    expect(r).toContain(".from('organization_members').select('user_id').eq('org_id', orgId).eq('user_id', conv.user_id)")
    expect(r).toContain('getAuthenticatedGmail(mailboxUserId)')
    expect(r).toContain('gmailThreadId = undefined')
    expect(r).toContain('storedThreading = await storedReplyHeaders(supabase, conv.id)')
    expect(r).toContain('threadId: gmailThreadId')
    // Who answered is still the caller.
    expect(r).toContain('sent_by: userId')
  })
})

describe('email conversation PATCH', () => {
  it('takes only the allowed fields, of the right shape', () => {
    expect(pickConversationUpdates({ status: 'archived', unread_count: 0, is_hidden: true, user_id: 'x', thread_id: 't' }))
      .toEqual({ status: 'archived', unread_count: 0, is_hidden: true })
    expect(pickConversationUpdates({ assigned_team_member_id: null, client_id: 'c1' })).toEqual({ assigned_team_member_id: null, client_id: 'c1' })
    expect(pickConversationUpdates({ status: 'deleted' })).toBeNull()
    expect(pickConversationUpdates({ unread_count: -1 })).toBeNull()
    expect(pickConversationUpdates({ is_hidden: 'yes' })).toBeNull()
  })

  it('checks the client and the assignee against the org; the composer sends conversation_id', () => {
    const r = src('app/api/email/conversations/route.ts')
    expect(r).not.toContain('updateData = { ...updateData, ...updates }')
    expect(r).toContain('recordsInOrg(supabase, orgId, { client_id: updates.client_id })')
    expect(r).toContain('teamMemberInOrg(supabase, assignee, orgId)')
    expect(src('components/unified/UnifiedMessageThread.tsx')).toContain("{ conversation_id: conversation.id, action: agentId ? 'assign' : 'unassign', assigned_team_member_id: agentId }")
  })
})

describe('the thread composer sends text, not markup', () => {
  it('escapes what the agent typed and keeps its line breaks', () => {
    const c = src('components/unified/UnifiedMessageThread.tsx')
    expect(c).toContain("body: escapeHtml(messageToSend).replace(/\\r?\\n/g, '<br>')")
    expect(escapeHtml('a < b & "c"\nnext').replace(/\r?\n/g, '<br>')).toBe('a &lt; b &amp; &quot;c&quot;<br>next')
  })

  it('the rich-HTML composers are unchanged', () => {
    expect(src('components/unified/ComposeEmailModal.tsx')).not.toContain('escapeHtml(')
  })
})
