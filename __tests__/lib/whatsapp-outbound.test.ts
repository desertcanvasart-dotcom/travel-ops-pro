// A WhatsApp message sent from the Templates page went out through Twilio and
// was filed nowhere, so the customer's conversation never showed it (audit
// T3). recordOutboundWhatsApp files it the way the inbox reply does: in the
// org's thread for that number, opening one if there is none.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordOutboundWhatsApp } from '@/lib/whatsapp-outbound'

function fakeDb(existing: { id: string } | null) {
  const calls: Array<{ table: string; op: string; args: unknown }> = []
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { filters[c] = v; return chain },
        maybeSingle: async () => { calls.push({ table, op: 'lookup', args: { ...filters } }); return { data: existing, error: null } },
        insert: (row: unknown) => {
          calls.push({ table, op: 'insert', args: row })
          return table === 'whatsapp_conversations'
            ? { select: () => ({ single: async () => ({ data: { id: 'new-conv' }, error: null }) }) }
            : Promise.resolve({ error: null })
        },
      }
      return chain
    },
  }
  return { db, calls }
}

describe('recordOutboundWhatsApp', () => {
  it("files the message in the org's existing thread for the number", async () => {
    const { db, calls } = fakeDb({ id: 'conv-1' })
    const id = await recordOutboundWhatsApp(db, { orgId: 'org-a', phone: '+81 90 1234 5678', body: 'Hello', messageSid: 'SM1' })
    expect(id).toBe('conv-1')
    expect(calls[0]).toEqual({ table: 'whatsapp_conversations', op: 'lookup', args: { org_id: 'org-a', phone_number: '+819012345678' } })
    expect(calls[1]).toMatchObject({
      table: 'whatsapp_messages', op: 'insert',
      args: { conversation_id: 'conv-1', message_sid: 'SM1', direction: 'outbound', message_body: 'Hello', status: 'sent' },
    })
  })

  it("opens a thread in the sender's org when there is none", async () => {
    const { db, calls } = fakeDb(null)
    const id = await recordOutboundWhatsApp(db, { orgId: 'org-b', phone: '+20 100 123 4567', body: 'Hi', clientId: 'client-9' })
    expect(id).toBe('new-conv')
    expect(calls[1]).toMatchObject({
      table: 'whatsapp_conversations', op: 'insert',
      args: { org_id: 'org-b', phone_number: '+201001234567', client_id: 'client-9' },
    })
    expect(calls[2]).toMatchObject({ table: 'whatsapp_messages', args: { conversation_id: 'new-conv' } })
  })

  it('files nothing for a number it cannot read', async () => {
    const { db, calls } = fakeDb(null)
    expect(await recordOutboundWhatsApp(db, { orgId: 'org-a', phone: '090-1234', body: 'x' })).toBeNull()
    expect(calls).toEqual([])
  })

  it('the template send route files a successful WhatsApp send', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/templates/send/route.ts'), 'utf8')
    expect(src).toMatch(/if \(result\.success\) \{\s*const filed = await recordOutboundWhatsApp\(supabase, \{\s*orgId,/)
  })
})
