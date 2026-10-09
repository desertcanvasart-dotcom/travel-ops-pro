// Supplier vouchers had no org boundary: every route read and wrote them with
// the service role and no org filter, so any signed-in user could list, open,
// edit, delete and send another organization's vouchers by id
// (migrations/20261113_supplier_documents_org.sql). These pin the filter on
// every route and the sender choice for email.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { table: string; op: string; args: unknown[] }

// Hoisted: the route modules build their clients at import time.
const db = vi.hoisted(() => {
  const calls: { table: string; op: string; args: unknown[] }[] = []
  // What the next read of a table returns.
  const state = { rows: {} as Record<string, unknown> }
  function chain(table: string) {
    const result = () => ({ data: state.rows[table] ?? null, error: null })
    const proxy: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: any) => resolve(result())
        if (prop === 'single' || prop === 'maybeSingle') {
          return async () => {
            const r = result()
            const data = Array.isArray(r.data) ? r.data[0] ?? null : r.data
            return data ? { data, error: null } : { data: null, error: prop === 'single' ? { code: 'PGRST116' } : null }
          }
        }
        return (...args: unknown[]) => { calls.push({ table, op: prop, args }); return proxy }
      },
    })
    return proxy
  }
  return { calls, state, client: { from: (t: string) => chain(t) } }
})
const calls: Call[] = db.calls

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => db.client }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
const gmailSend = vi.hoisted(() => vi.fn(async () => ({ data: { id: 'msg-1' } })))
const gmailFor = vi.hoisted(() => vi.fn()) as any
vi.mock('@/lib/gmail', () => ({
  getAuthenticatedGmail: (id: string) => gmailFor(id),
  GmailAuthError: class extends Error {},
}))
const whatsapp = vi.hoisted(() => vi.fn(async () => ({ success: true, messageId: 'wa-1' })))
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: (args: unknown) => (whatsapp as any)(args) }))
vi.mock('@/lib/storage/outbound-documents', () => ({ uploadOutboundPdf: async () => 'https://signed' }))

import { GET as getOne, PUT, DELETE } from '@/app/api/supplier-documents/[id]/route'
import { GET as list, POST } from '@/app/api/supplier-documents/route'
import { POST as sendEmail } from '@/app/api/send-supplier-document/route'
import { POST as sendWhatsApp } from '@/app/api/whatsapp/send-supplier-document/route'
import { orgGmailSenderId } from '@/lib/email/org-gmail-sender'

const params = { params: Promise.resolve({ id: 'doc-1' }) } as never
const req = (body?: unknown, url = 'http://x/api') =>
  new Request(url, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) as never
const orgFilters = (table = 'supplier_documents') =>
  calls.filter(c => c.table === table && c.op === 'eq' && c.args[0] === 'org_id').map(c => c.args[1])

beforeEach(() => {
  calls.length = 0
  db.state.rows = {}
  gmailSend.mockClear(); whatsapp.mockClear()
  gmailFor.mockReset()
  gmailFor.mockImplementation(async () => ({ gmail: { users: { messages: { send: gmailSend } } }, emailAddress: '' }))
})

describe('supplier-documents routes stay inside the org', () => {
  it('lists only the org’s vouchers', async () => {
    db.state.rows.supplier_documents = []
    await list(req(undefined, 'http://x/api/supplier-documents'))
    expect(orgFilters()).toEqual(['org-A'])
  })

  it('opens, edits and deletes by id only within the org', async () => {
    await getOne(req(), params)
    await PUT(req({ status: 'sent' }), params)
    await DELETE(req(), params)
    expect(orgFilters()).toEqual(['org-A', 'org-A', 'org-A'])
  })

  it('answers 404 for a voucher that is not the org’s', async () => {
    expect((await getOne(req(), params)).status).toBe(404)
    expect((await PUT(req({ status: 'sent' }), params)).status).toBe(404)
    expect((await DELETE(req(), params)).status).toBe(404)
  })

  it('never moves a voucher to another trip or org on edit', async () => {
    db.state.rows.supplier_documents = [{ id: 'doc-1' }]
    await PUT(req({ itinerary_id: 'their-trip', org_id: 'org-B', status: 'sent' }), params)
    const update = calls.find(c => c.op === 'update')!.args[0] as Record<string, unknown>
    expect(update).not.toHaveProperty('itinerary_id')
    expect(update).not.toHaveProperty('org_id')
    expect(update.status).toBe('sent')
  })

  it('creates a voucher in the caller’s org, never one named in the body', async () => {
    db.state.rows.supplier_documents = [{ id: 'new' }]
    await POST(req({ document_type: 'hotel_voucher', document_number: 'HV-1', supplier_name: 'S', client_name: 'C', org_id: 'org-B' }))
    const inserted = (calls.find(c => c.op === 'insert')!.args[0] as Record<string, unknown>[])[0]
    expect(inserted.org_id).toBe('org-A')
  })

  it('refuses to create a voucher on another org’s trip', async () => {
    const res = await POST(req({ document_type: 'hotel_voucher', itinerary_id: 'their-trip' }))
    expect(res.status).toBe(404)
    expect(calls.some(c => c.op === 'insert')).toBe(false)
  })
})

describe('sending a voucher', () => {
  const email = { documentId: 'doc-1', supplierEmail: 'hotel@example.com', supplierName: 'Hotel', documentNumber: 'HV-1', documentType: 'Hotel Voucher', clientName: 'Guest', pdfBase64: 'JVBERi0=' }
  const wa = { documentId: 'doc-1', supplierPhone: '+201000000000', supplierName: 'Hotel', documentNumber: 'HV-1', documentType: 'Hotel Voucher', clientName: 'Guest', pdfBase64: 'JVBERi0=' }

  it('refuses another org’s voucher by email and by WhatsApp', async () => {
    expect((await sendEmail(req(email) as never)).status).toBe(404)
    expect((await sendWhatsApp(req(wa))).status).toBe(404)
    expect(gmailSend).not.toHaveBeenCalled()
    expect(whatsapp).not.toHaveBeenCalled()
  })

  // The voucher row: the recipient, number and names come from here.
  const row = {
    id: 'doc-1', status: 'draft', document_type: 'hotel_voucher', document_number: 'HV-1',
    supplier_name: '<b>Hotel</b>', supplier_contact_email: 'hotel@example.com', client_name: 'Guest',
    supplier_whatsapp: '+201000000000',
  }

  it('emails from the org’s mailbox, with no copy to a platform address and names escaped', async () => {
    db.state.rows.supplier_documents = [row]
    db.state.rows.organization_members = [{ user_id: 'user-1' }]
    db.state.rows.gmail_tokens = [{ user_id: 'user-1' }]
    const res = await sendEmail(req({ ...email, documentType: 'Voucher\r\nBcc: x@evil.test' }) as never)
    expect(res.status).toBe(200)
    expect(gmailFor).toHaveBeenCalledWith('user-1')
    const raw = Buffer.from((gmailSend.mock.calls[0] as any)[0].requestBody.raw, 'base64url').toString()
    const headers = raw.split('\r\n\r\n')[0]
    expect(headers).not.toMatch(/^Bcc:/m)
    expect(headers).not.toMatch(/^From:/m)
    const htmlPart = raw.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n')[0]
    const html = Buffer.from(htmlPart, 'base64').toString()
    expect(html).toContain('&lt;b&gt;Hotel&lt;/b&gt;')
  })

  it('a Japanese subject and file name are encoded, not sent raw (they arrived as mojibake)', async () => {
    db.state.rows.supplier_documents = [{ ...row, supplier_name: 'カイロ交通', client_name: '山田 太郎' }]
    db.state.rows.organization_members = [{ user_id: 'user-1' }]
    db.state.rows.gmail_tokens = [{ user_id: 'user-1' }]
    await sendEmail(req({ ...email, documentType: 'ホテルバウチャー' }) as never)
    const raw = Buffer.from((gmailSend.mock.calls.at(-1) as any)[0].requestBody.raw, 'base64url').toString()
    const subject = raw.match(/^Subject: (.*)$/m)![1]
    expect(subject).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/)
    expect(Buffer.from(subject.slice(10, -2), 'base64').toString('utf8')).toContain('ホテルバウチャー')
    expect(raw).toContain(`filename*=UTF-8''`)
    expect(raw).toContain(encodeURIComponent('カイロ交通'))
    expect(raw.split('\r\n').filter(l => /^(Subject|Content-Disposition|Content-Type): /.test(l)).every(l => /^[\x00-\x7F]*$/.test(l))).toBe(true)
  })

  it('sends to the voucher’s supplier, never an address the request names', async () => {
    db.state.rows.supplier_documents = [row]
    db.state.rows.organization_members = [{ user_id: 'user-1' }]
    db.state.rows.gmail_tokens = [{ user_id: 'user-1' }]
    await sendEmail(req({ ...email, supplierEmail: 'attacker@evil.test' }) as never)
    const raw = Buffer.from((gmailSend.mock.calls.at(-1) as any)[0].requestBody.raw, 'base64url').toString()
    expect(raw).toMatch(/^To: hotel@example\.com$/m)
    expect(raw).not.toContain('attacker@evil.test')
  })

  it('marks the voucher sent itself once the email has gone', async () => {
    db.state.rows.supplier_documents = [row]
    db.state.rows.organization_members = [{ user_id: 'user-1' }]
    db.state.rows.gmail_tokens = [{ user_id: 'user-1' }]
    await sendEmail(req(email) as never)
    const update = calls.filter(c => c.table === 'supplier_documents' && c.op === 'update').at(-1)!.args[0] as Record<string, unknown>
    expect(update).toMatchObject({ status: 'sent', sent_via: 'email' })
    expect(orgFilters().every(o => o === 'org-A')).toBe(true)
  })

  it('sends WhatsApp to the voucher’s number and marks it sent', async () => {
    db.state.rows.supplier_documents = [row]
    const res = await sendWhatsApp(req({ ...wa, supplierPhone: '+19999999999' }))
    expect(res.status).toBe(200)
    expect(whatsapp).toHaveBeenCalledOnce()
    expect((whatsapp.mock.calls[0] as any[])[0].to).toBe('+201000000000')
    const update = calls.filter(c => c.table === 'supplier_documents' && c.op === 'update').at(-1)!.args[0] as Record<string, unknown>
    expect(update).toMatchObject({ status: 'sent', sent_via: 'whatsapp' })
  })

  it('says Gmail is not connected when no member of the org has a mailbox', async () => {
    db.state.rows.supplier_documents = [row]
    db.state.rows.organization_members = [{ user_id: 'user-1' }]
    db.state.rows.gmail_tokens = []
    expect((await sendEmail(req(email) as never)).status).toBe(401)
    expect(gmailSend).not.toHaveBeenCalled()
  })
})

describe('orgGmailSenderId', () => {
  const db = (members: string[], connected: string[]) => ({
    from: (t: string) => {
      const data = t === 'organization_members' ? members.map(user_id => ({ user_id })) : connected.map(user_id => ({ user_id }))
      const b: any = { select: () => b, eq: () => b, order: () => b, in: () => b, then: (r: any) => r({ data }) }
      return b
    },
  })

  it('prefers the user’s own mailbox', async () => {
    expect(await orgGmailSenderId(db(['owner', 'me'], ['owner', 'me']), 'org', 'me')).toBe('me')
  })

  it('falls back to the longest-standing member’s mailbox', async () => {
    expect(await orgGmailSenderId(db(['owner', 'agent', 'me'], ['agent', 'owner']), 'org', 'me')).toBe('owner')
  })

  it('never picks a mailbox outside the org', async () => {
    // The tokens query is limited to members; an outsider's row cannot match.
    expect(await orgGmailSenderId(db(['me'], ['outsider']), 'org', 'me')).toBeNull()
    expect(await orgGmailSenderId(db([], ['outsider']), 'org', 'me')).toBeNull()
  })
})
