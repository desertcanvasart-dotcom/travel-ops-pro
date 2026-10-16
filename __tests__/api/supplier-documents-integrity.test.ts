// Supplier documents (Operate › Documents audit #2, #4–#7):
//   - POST inserted the raw body: a voucher could be created already
//     'confirmed', with its own id; now only content columns, as a draft.
//   - a number drawn for the company that collides is retried; a number
//     typed by hand that collides is the caller's 409.
//   - DELETE removed a voucher the supplier holds; now only a cancelled one,
//     or a draft never sent. PUT took any status string.
//   - the tiles counted the filtered rows; now one count per status.
//   - the send routes trusted the browser's base64 PDF.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Op = { op: string; args: unknown[] }
type Resp = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null }

const db = vi.hoisted(() => {
  const log: { table: string; ops: { op: string; args: unknown[] }[] }[] = []
  const state = {
    // Answer for one finished query: table + the ops it ran.
    respond: (() => ({ data: null, error: null })) as (table: string, ops: { op: string; args: unknown[] }[]) => any,
    rpc: (() => ({ data: null, error: { code: 'PGRST202' } })) as (fn: string, args: any) => any,
  }
  function chain(table: string) {
    const entry = { table, ops: [] as { op: string; args: unknown[] }[] }
    log.push(entry)
    const proxy: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: any) => resolve(state.respond(table, entry.ops))
        if (prop === 'single' || prop === 'maybeSingle') {
          return async () => {
            entry.ops.push({ op: prop, args: [] })
            return state.respond(table, entry.ops)
          }
        }
        return (...args: unknown[]) => { entry.ops.push({ op: prop, args }); return proxy }
      },
    })
    return proxy
  }
  return { log, state, client: { from: (t: string) => chain(t), rpc: async (fn: string, args: any) => state.rpc(fn, args) } }
})

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => db.client }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
const whatsapp = vi.hoisted(() => vi.fn(async () => ({ success: true, messageId: 'wa-1' })))
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: (args: unknown) => (whatsapp as any)(args) }))
const uploaded = vi.hoisted(() => [] as Buffer[])
vi.mock('@/lib/storage/outbound-documents', () => ({
  uploadOutboundPdf: async (_db: unknown, _p: string, bytes: Buffer) => { uploaded.push(bytes); return 'https://signed' },
}))
vi.mock('@/lib/org-identity', () => ({ orgIdentity: async () => ({ name: 'ATS', email: 'ops@ats.example' }) }))

import { POST, GET as list } from '@/app/api/supplier-documents/route'
import { PUT, DELETE } from '@/app/api/supplier-documents/[id]/route'
import { POST as sendWhatsApp } from '@/app/api/whatsapp/send-supplier-document/route'
import { POST as sendEmail } from '@/app/api/send-supplier-document/route'
import { deleteBlockReason, isSupplierDocumentStatus } from '@/lib/documents/supplier-document-fields'
import { decodePdfAttachment, MAX_PDF_BYTES, mimeBase64Lines } from '@/lib/documents/pdf-attachment'
import { supplierDocumentStats } from '@/lib/documents/supplier-document-stats'

const params = { params: Promise.resolve({ id: 'doc-1' }) } as never
const req = (body?: unknown, url = 'http://x/api', method = 'POST') =>
  new Request(url, body === undefined ? { method } : { method, body: JSON.stringify(body) }) as never
const has = (ops: Op[], op: string) => ops.some(o => o.op === op)
const inserts = () => db.log.filter(e => e.table === 'supplier_documents' && has(e.ops, 'insert'))
const insertedRow = (i = 0) => (inserts()[i].ops.find(o => o.op === 'insert')!.args[0] as Record<string, unknown>[])[0]
const PDF = Buffer.from('%PDF-1.4\n%fake voucher\n').toString('base64')

beforeEach(() => {
  db.log.length = 0
  uploaded.length = 0
  whatsapp.mockClear()
  db.state.respond = () => ({ data: null, error: null })
  db.state.rpc = () => ({ data: null, error: { code: 'PGRST202' } })
})

describe('POST /api/supplier-documents creates a draft from the document’s own columns', () => {
  it('a body asking for confirmed, a chosen id and confirmation stamps stores a plain draft', async () => {
    db.state.respond = (t, ops) => (has(ops, 'insert') ? { data: { id: 'new' }, error: null } : { data: null, error: null })
    const res = await POST(req({
      id: 'chosen-id', document_type: 'hotel_voucher', document_number: 'HV-9', supplier_name: 'S', client_name: 'C',
      status: 'confirmed', confirmed_by: 'someone', confirmed_at: '2026-01-01', sent_at: '2026-01-01',
      completed_at: '2026-01-02', payment_status: 'paid', created_by: 'mallory',
    }))
    expect(res.status).toBe(200)
    const row = insertedRow()
    expect(row.status).toBe('draft')
    for (const k of ['id', 'confirmed_by', 'confirmed_at', 'sent_at', 'completed_at', 'payment_status']) expect(row).not.toHaveProperty(k)
    expect(row).toMatchObject({ org_id: 'org-A', created_by: 'user-1', document_number: 'HV-9', supplier_name: 'S' })
  })

  it("draws the company's next number and retries one that collides", async () => {
    let n = 6
    db.state.rpc = (fn, args) => ({ data: `${args.p_prefix}-${args.p_year}-000${++n}`, error: null })
    // The number each insert carried, as it was sent.
    const tried: unknown[] = []
    db.state.respond = (t, ops) => {
      if (!has(ops, 'insert')) return { data: null, error: null }
      tried.push((ops.find(o => o.op === 'insert')!.args[0] as Record<string, unknown>[])[0].document_number)
      return tried.length === 1 ? { data: null, error: { code: '23505' } } : { data: { id: 'new' }, error: null }
    }
    const res = await POST(req({ document_type: 'hotel_voucher', supplier_name: 'S', client_name: 'C' }))
    expect(res.status).toBe(200)
    expect(tried).toEqual([
      `HV-${new Date().getFullYear()}-0007`, `HV-${new Date().getFullYear()}-0008`,
    ])
  })

  it('a typed number already used in the company is a 409, not a silent renumber', async () => {
    db.state.respond = (t, ops) => (has(ops, 'insert') ? { data: null, error: { code: '23505' } } : { data: null, error: null })
    const res = await POST(req({ document_type: 'hotel_voucher', document_number: 'HV-2026-0001', supplier_name: 'S', client_name: 'C' }))
    expect(res.status).toBe(409)
    expect(inserts()).toHaveLength(1)
  })
})

describe('PUT validates the status; DELETE spares what the supplier holds', () => {
  it('refuses a status no screen knows', async () => {
    const res = await PUT(req({ status: 'approved' }, 'http://x', 'PUT'), params)
    expect(res.status).toBe(400)
    expect(db.log.some(e => has(e.ops, 'update'))).toBe(false)
    expect(isSupplierDocumentStatus('cancelled')).toBe(true)
  })

  it.each([
    [{ status: 'sent', sent_at: '2026-01-01' }],
    [{ status: 'confirmed', sent_at: '2026-01-01' }],
    [{ status: 'completed', sent_at: null }],
    [{ status: 'draft', sent_at: '2026-01-01' }], // sent, then reverted to draft
  ])('refuses to delete %o with a 409 and the reason', async row => {
    db.state.respond = (t, ops) => (has(ops, 'maybeSingle') ? { data: { id: 'doc-1', ...row }, error: null } : { data: [], error: null })
    const res = await DELETE(req(undefined, 'http://x', 'DELETE'), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Cancelled/)
    expect(db.log.some(e => has(e.ops, 'delete'))).toBe(false)
  })

  it('deletes a cancelled document, or a draft that never went out', async () => {
    for (const row of [{ status: 'cancelled', sent_at: '2026-01-01' }, { status: 'draft', sent_at: null }]) {
      db.log.length = 0
      db.state.respond = (t, ops) => (has(ops, 'maybeSingle') ? { data: { id: 'doc-1', ...row }, error: null } : { data: [{ id: 'doc-1' }], error: null })
      expect((await DELETE(req(undefined, 'http://x', 'DELETE'), params)).status).toBe(200)
      expect(db.log.some(e => has(e.ops, 'delete'))).toBe(true)
    }
    expect(deleteBlockReason({ status: 'draft' })).toBeNull()
  })
})

describe('the list tiles count the whole company, whatever the filters', () => {
  it('one count per status over the org (or the trip), not the filtered rows', async () => {
    const counts: Record<string, number> = { total: 12, draft: 4, sent: 3, confirmed: 2, completed: 1, cancelled: 2 }
    db.state.respond = (t, ops) => {
      const select = ops.find(o => o.op === 'select')
      if ((select?.args[1] as { head?: boolean } | undefined)?.head) {
        const status = ops.find(o => o.op === 'eq' && o.args[0] === 'status')?.args[1] as string | undefined
        return { count: counts[status ?? 'total'], error: null }
      }
      return { data: [{ id: 'd1', status: 'sent' }], error: null } // the filtered list: one row
    }
    const res = await list(req(undefined, 'http://x/api/supplier-documents?status=sent', 'GET'))
    expect((await res.json()).stats).toEqual(counts)
    // No count is narrowed by the Status filter; every count is the org's.
    const countReads = db.log.filter(e => ((e.ops.find(o => o.op === 'select')?.args[1]) as { head?: boolean } | undefined)?.head)
    expect(countReads).toHaveLength(6)
    expect(countReads.every(e => e.ops.some(o => o.op === 'eq' && o.args[0] === 'org_id' && o.args[1] === 'org-A'))).toBe(true)
    expect(countReads.filter(e => e.ops.some(o => o.op === 'eq' && o.args[0] === 'status' && o.args[1] === 'sent'))).toHaveLength(1)
  })

  it("scopes to one trip when the list is opened for it", async () => {
    db.state.respond = () => ({ count: 0, error: null })
    await supplierDocumentStats(db.client, 'org-A', 'trip-1')
    expect(db.log.every(e => e.ops.some(o => o.op === 'eq' && o.args[0] === 'itinerary_id' && o.args[1] === 'trip-1'))).toBe(true)
  })
})

describe('the send routes send only a real, bounded PDF', () => {
  it('decodes a PDF and refuses anything else', () => {
    expect(decodePdfAttachment(PDF)).toMatchObject({ ok: true })
    expect(decodePdfAttachment(`data:application/pdf;filename=generated.pdf;base64,${PDF}`)).toMatchObject({ ok: true })
    expect(decodePdfAttachment('')).toMatchObject({ ok: false })
    expect(decodePdfAttachment(undefined)).toMatchObject({ ok: false })
    expect(decodePdfAttachment(Buffer.from('<html>not a pdf</html>').toString('base64'))).toEqual({ ok: false, error: 'The attachment is not a PDF' })
    // A CRLF and a boundary of the caller's: not base64.
    expect(decodePdfAttachment(`${PDF}\r\n--boundary_1\r\nContent-Type: text/html\r\n\r\nPGgxPg==`)).toMatchObject({ ok: false, error: 'PDF attachment is not valid base64' })
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_PDF_BYTES)]).toString('base64')
    expect(decodePdfAttachment(big)).toEqual({ ok: false, error: 'PDF attachment is too large' })
  })

  it('MIME lines are 76 characters', () => {
    const lines = mimeBase64Lines('A'.repeat(200)).split('\r\n')
    expect(lines.map(l => l.length)).toEqual([76, 76, 48])
  })

  const row = { id: 'doc-1', document_type: 'hotel_voucher', document_number: 'HV-1', supplier_name: 'Hotel', supplier_whatsapp: '+201000000000', supplier_contact_email: 'hotel@example.com', client_name: 'Guest' }

  it('WhatsApp: a non-PDF is refused before anything is uploaded or sent', async () => {
    db.state.respond = () => ({ data: row, error: null })
    const res = await sendWhatsApp(req({ documentId: 'doc-1', pdfBase64: Buffer.from('MZ\x90\x00').toString('base64') }))
    expect(res.status).toBe(400)
    expect(uploaded).toEqual([])
    expect(whatsapp).not.toHaveBeenCalled()
  })

  it('WhatsApp: uploads the decoded bytes of a real PDF', async () => {
    db.state.respond = () => ({ data: row, error: null })
    expect((await sendWhatsApp(req({ documentId: 'doc-1', pdfBase64: PDF }))).status).toBe(200)
    expect(uploaded[0].subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('email: a body smuggling MIME parts is refused before the mailbox is touched', async () => {
    db.state.respond = () => ({ data: row, error: null })
    const res = await sendEmail(req({ documentId: 'doc-1', pdfBase64: `${PDF}\r\n--x\r\nContent-Type: text/html\r\n\r\nhi` }) as never)
    expect(res.status).toBe(400)
    expect(db.log.some(e => e.table === 'gmail_tokens')).toBe(false)
  })
})
