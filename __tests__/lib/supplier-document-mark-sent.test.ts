// Sending a voucher used to be followed by a separate, unchecked PUT from the
// page, so a voucher could reach the supplier and stay "draft". The send routes
// now mark it themselves, and a re-send never moves a voucher backwards.
import { describe, it, expect } from 'vitest'
import { markSupplierDocumentSent } from '@/lib/documents/mark-sent'

function db(status: string | null) {
  const updates: Record<string, unknown>[] = []
  const filters: [string, unknown][] = []
  const client = {
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => { filters.push([c, v]); return b }
      b.maybeSingle = async () => ({ data: status === null ? null : { status }, error: null })
      b.update = (u: Record<string, unknown>) => { updates.push(u); return b }
      b.then = (r: (v: unknown) => void) => r({ error: null })
      return b
    },
  }
  return { client, updates, filters }
}

const now = new Date('2026-10-08T12:00:00Z')

describe('markSupplierDocumentSent', () => {
  it('moves a draft to sent, stamping when and how', async () => {
    const d = db('draft')
    expect(await markSupplierDocumentSent(d.client, { documentId: 'doc', orgId: 'org', via: 'email', now })).toEqual({ error: null })
    expect(d.updates[0]).toMatchObject({ status: 'sent', sent_via: 'email', sent_at: now.toISOString() })
  })

  it('records a re-send without moving a confirmed voucher back to sent', async () => {
    const d = db('confirmed')
    await markSupplierDocumentSent(d.client, { documentId: 'doc', orgId: 'org', via: 'whatsapp', now })
    expect(d.updates[0]).not.toHaveProperty('status')
    expect(d.updates[0]).toMatchObject({ sent_via: 'whatsapp' })
  })

  it('stays inside the organization', async () => {
    const d = db('draft')
    await markSupplierDocumentSent(d.client, { documentId: 'doc', orgId: 'org', via: 'email', now })
    expect(d.filters.filter(([c]) => c === 'org_id').every(([, v]) => v === 'org')).toBe(true)
  })

  it('reports a voucher it cannot find', async () => {
    const d = db(null)
    expect((await markSupplierDocumentSent(d.client, { documentId: 'doc', orgId: 'org', via: 'email', now })).error).toBeTruthy()
    expect(d.updates).toHaveLength(0)
  })
})
