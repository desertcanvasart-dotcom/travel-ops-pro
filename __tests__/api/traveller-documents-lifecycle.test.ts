// Passport files must not outlive their record, a traveller must never be
// left with no passport on file, and a failed read must not look like an
// empty one:
// - deleting a booking cascaded its document rows away but left the files,
//   where the purge cron (which finds files through those rows) never could;
// - replacing a passport deleted the old one before the new row went in;
// - the office panel and the portal list read any database error as
//   "nothing uploaded";
// - a file at the 10 MiB cap arrived cut short and was "no file selected".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  objects: new Set<string>(),
  failInsert: false,
  failRemove: false,
  readError: null as { code?: string; message: string } | null,
}))

// A small in-memory PostgREST: enough of select/eq/is/insert/update/delete.
function query(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: { kind: 'select' | 'update' | 'delete' | 'insert'; data?: Row } = { kind: 'select' }
  const rows = () => (h.tables[table] ??= [])
  const run = () => {
    if (op.kind === 'select' && h.readError && table !== 'bookings') return { data: null, error: h.readError }
    if (op.kind === 'insert') {
      if (h.failInsert) return { data: null, error: { message: 'insert failed' } }
      const row = { id: `new-${rows().length}`, purged_at: null, ...op.data }
      rows().push(row)
      return { data: [row], error: null }
    }
    const hit = rows().filter(r => filters.every(f => f(r)))
    if (op.kind === 'update') hit.forEach(r => Object.assign(r, op.data))
    if (op.kind === 'delete') h.tables[table] = rows().filter(r => !hit.includes(r))
    return { data: hit, error: null }
  }
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (data: Row) => { op = { kind: 'insert', data }; return b },
    update: (data: Row) => { op = { kind: 'update', data }; return b },
    delete: () => { op = { kind: 'delete' }; return b },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return b },
    order: () => b,
    limit: () => b,
    maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } },
    single: async () => { const r = run(); const d = (r.data as Row[] | null)?.[0] ?? null; return { data: d, error: r.error ?? (d ? null : { message: 'none' }) } },
    then: (res: (v: unknown) => void) => res(run()),
  }
  return b
}
const db = vi.hoisted(() => ({}) as Record<string, unknown>)
Object.assign(db, {
  from: (t: string) => query(t),
  storage: {
    from: () => ({
      upload: async (p: string) => { h.objects.add(p); return { error: null } },
      remove: async (paths: string[]) => {
        if (h.failRemove) return { error: { message: 'storage down' } }
        paths.forEach(p => h.objects.delete(p)); return { error: null }
      },
    }),
  },
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  getCurrentUserId: async () => 'u1',
  noOrgResponse: () => new Response(null, { status: 403 }),
  requireRole: async () => null,
}))
vi.mock('@/lib/portal/traveller-gate', () => ({
  travellerWriteContext: async () => ({
    ok: true,
    link: { booking_id: 'b1', details_locked_at: null },
    booking: { org_id: 'org-A', end_date: '2026-12-01' },
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ success: true }), getClientIdentifier: () => 'ip', rateLimitResponse: () => new Response(null, { status: 429 }) }))
vi.mock('@/lib/portal/traveller-documents', async (orig) => ({
  ...(await orig<typeof import('@/lib/portal/traveller-documents')>()),
  ensureTravellerDocsBucket: async () => {},
}))

import { POST as upload, GET as portalList } from '@/app/api/portal/[token]/travellers/[id]/documents/route'
import { DELETE as deleteBooking } from '@/app/api/bookings/[id]/route'
import { GET as staffList } from '@/app/api/bookings/[id]/passenger-documents/route'
import { MAX_DOCUMENT_BYTES, REJECTION_MESSAGE_JA, removeBookingDocumentFiles } from '@/lib/portal/traveller-documents'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const portalReq = (init: RequestInit = {}) => {
  const req = new Request('http://x', init) as unknown as Record<string, unknown>
  req.cookies = { get: () => undefined }
  return req as never
}
const ctx = { params: Promise.resolve({ token: 'tok', id: 'p1' }) }
function uploadPassport() {
  const form = new FormData()
  form.append('file', new File([PNG], 'passport.png', { type: 'image/png' }))
  form.append('kind', 'passport')
  return upload(portalReq({ method: 'POST', body: form }), ctx)
}
const livePassports = () => h.tables.booking_passenger_documents.filter(r => r.kind === 'passport' && r.purged_at === null)

beforeEach(() => {
  h.failInsert = false
  h.failRemove = false
  h.readError = null
  h.objects = new Set(['b1/p1/old.png'])
  h.tables = {
    bookings: [{ id: 'b1', org_id: 'org-A', status: 'pending', booking_code: 'BK-1' }],
    booking_passengers: [{ id: 'p1', booking_id: 'b1' }],
    booking_passenger_documents: [
      { id: 'old', booking_id: 'b1', passenger_id: 'p1', kind: 'passport', storage_path: 'b1/p1/old.png', purged_at: null },
    ],
  }
})

describe('replacing a passport', () => {
  it('swaps the old one for the new, file and row', async () => {
    expect((await uploadPassport()).status).toBe(200)
    expect(livePassports()).toHaveLength(1)
    expect(livePassports()[0].id).not.toBe('old')
    expect(h.objects.has('b1/p1/old.png')).toBe(false)
  })

  it('keeps the old passport, file and row, when the new one cannot be saved', async () => {
    h.failInsert = true
    expect((await uploadPassport()).status).toBe(500)
    expect(livePassports().map(r => r.id)).toEqual(['old'])
    expect([...h.objects]).toEqual(['b1/p1/old.png'])
  })
})

describe('deleting a booking', () => {
  const del = () => deleteBooking({} as never, { params: Promise.resolve({ id: 'b1' }) })

  it('removes its travellers’ files before the rows cascade away', async () => {
    expect((await del()).status).toBe(200)
    expect(h.objects.size).toBe(0)
    expect(h.tables.bookings).toHaveLength(0)
  })

  it('keeps the booking when the files cannot be removed', async () => {
    h.failRemove = true
    expect((await del()).status).toBe(500)
    expect(h.tables.bookings).toHaveLength(1)
  })

  it('treats a missing documents table as nothing to remove', async () => {
    h.readError = { code: '42P01', message: 'missing' }
    expect(await removeBookingDocumentFiles(db as never, 'b1')).toBeNull()
  })
})

describe('a failed read is not an empty list', () => {
  it('the office list reports it', async () => {
    h.readError = { code: '57014', message: 'timeout' }
    expect((await staffList({} as never, { params: Promise.resolve({ id: 'b1' }) })).status).toBe(500)
  })

  it('the portal list reports it', async () => {
    h.readError = { code: '57014', message: 'timeout' }
    expect((await portalList(portalReq(), ctx)).status).toBe(500)
  })

  it('the office panel and portal show it, and the portal shows the lock message, not "locked"', () => {
    const panel = readFileSync(join(process.cwd(), 'app/components/TravellerDocumentsPanel.tsx'), 'utf8')
    expect(panel).toContain("setError('Could not load the traveller documents.')")
    const portal = readFileSync(join(process.cwd(), 'app/portal/[token]/TravellerDocuments.tsx'), 'utf8')
    expect(portal).toContain("if (json.error && json.error !== 'locked') return json.error")
    expect(portal).not.toMatch(/setError\(json\.error \|\|/)
  })
})

describe('an upload cut short at the size cap', () => {
  it('says the file is too large, not that none was selected', async () => {
    const res = await upload(portalReq({
      method: 'POST', body: 'cut short', headers: { 'content-length': String(MAX_DOCUMENT_BYTES + 200) },
    }), ctx)
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe(REJECTION_MESSAGE_JA.too_large)
  })
})
