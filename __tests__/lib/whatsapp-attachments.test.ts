// WhatsApp files (20270121, ported from autoura-saas #819 / #820): which
// files may be sent, how big, what name a download gets, where copies are
// kept (per company), and the backfill script's agreement with the app.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  checkSendable, resolveMime, safeFileName, downloadName, extFor, labelFor, SENDABLE_ACCEPT, FILE_TYPES,
} from '@/lib/whatsapp/attachments'
import { outboundFilePath, outboundVoicePath, inboundFilePath, storagePathBelongsTo, uploadWhatsAppMedia, isOwnTwilioMediaUrl } from '@/lib/whatsapp/media-storage'
import { keepTwilioMedia } from '@/lib/whatsapp/keep-inbound-media'
import * as backfill from '@/scripts/keep-whatsapp-media.mjs'

const MB = 1024 * 1024

describe('what may be sent', () => {
  it('photos, video and documents — PDF, Word, Excel, PowerPoint, text, CSV', () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.mp4', 'video/mp4'], ['a.pdf', 'application/pdf'],
      ['a.docx', ''], ['a.xlsx', ''], ['a.pptx', ''], ['a.txt', 'text/plain'], ['rates.csv', 'text/csv'],
    ]) expect(checkSendable({ name, type, size: 1000 }).ok, name).toBe(true)
  })

  it('refuses other files, empty ones, and anything over WhatsApp\'s size', () => {
    expect(checkSendable({ name: 'a.zip', type: 'application/zip', size: 10 })).toMatchObject({ ok: false })
    expect(checkSendable({ name: 'a.exe', type: '', size: 10 })).toMatchObject({ ok: false })
    expect(checkSendable({ name: 'a.webp', type: 'image/webp', size: 10 })).toMatchObject({ ok: false })
    expect(checkSendable({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatchObject({ ok: false })
    const big = checkSendable({ name: 'pic.jpg', type: 'image/jpeg', size: 6 * MB })
    expect(big).toMatchObject({ ok: false })
    expect(!big.ok && big.error).toMatch(/5 MB/)
    expect(checkSendable({ name: 'doc.pdf', type: 'application/pdf', size: 15 * MB }).ok).toBe(true)
    expect(checkSendable({ name: 'doc.pdf', type: 'application/pdf', size: 17 * MB }).ok).toBe(false)
  })

  it('the file\'s extension wins over a missing or wrong browser type (Windows calls a .csv Excel)', () => {
    expect(resolveMime('application/vnd.ms-excel', 'rates.csv')).toBe('text/csv')
    expect(resolveMime('', 'plan.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(resolveMime('application/octet-stream', 'x.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(resolveMime('image/jpeg', 'photo.JPEG')).toBe('image/jpeg')
    expect(resolveMime('', 'noextension')).toBe(null)
  })

  it('the picker offers what can be sent', () => {
    expect(SENDABLE_ACCEPT).toContain('.csv')
    expect(SENDABLE_ACCEPT).toContain('.xlsx')
    expect(SENDABLE_ACCEPT).not.toContain('.webp')
  })
})

describe('file names', () => {
  it('safe: letters, digits, dot, dash; the type\'s extension; never empty', () => {
    expect(safeFileName('Itinéraire Nil 2027 (v2).pdf', 'application/pdf')).toBe('Itineraire-Nil-2027-v2.pdf')
    expect(safeFileName('../../etc/passwd', 'text/plain')).toBe('etc-passwd.txt')
    expect(safeFileName('', 'image/jpeg')).toBe('file.jpg')
    expect(safeFileName('rates', 'text/csv')).toBe('rates.csv')
    expect(safeFileName('x'.repeat(200) + '.pdf', 'application/pdf').length).toBeLessThanOrEqual(80)
  })

  it('a download keeps its own name, else WhatsApp-<date>-<type>', () => {
    expect(downloadName({ media_filename: 'Passport scan.pdf', media_type: 'application/pdf' })).toBe('Passport-scan.pdf')
    expect(downloadName({ media_filename: null, media_type: 'image/jpeg', sent_at: '2026-11-12T10:00:00Z' })).toBe('WhatsApp-2026-11-12-photo.jpg')
    expect(downloadName({ media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', created_at: '2026-11-13T00:00:00Z' })).toBe('WhatsApp-2026-11-13-excel-sheet.xlsx')
  })

  it('Word, Excel and CSV keep their extension (were stored as .bin)', () => {
    expect(extFor('text/csv')).toBe('csv')
    expect(extFor('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx')
    expect(extFor('audio/ogg; codecs=opus')).toBe('ogg')
    expect(extFor('application/x-unknown')).toBe('bin')
    expect(labelFor('text/csv')).toBe('CSV file')
  })
})

describe('where files are kept, and which a message may point at', () => {
  const org = '11271ceb-709a-40ef-ba14-81cac60953a9'
  const other = '00000000-0000-0000-0000-000000000000'
  it('a sent file keeps its name in the path; the path belongs to its company only', () => {
    const p = outboundFilePath(org, 'abc-123', 'Plan-2027.pdf')
    expect(p).toBe(`outbound/${org}/abc-123/Plan-2027.pdf`)
    expect(storagePathBelongsTo(p, { message_sid: 'SMx', org_id: org })).toBe(true)
    expect(storagePathBelongsTo(p, { message_sid: 'SMx', org_id: other })).toBe(false)
    expect(storagePathBelongsTo(`outbound/${org}/abc/../../x.pdf`, { message_sid: 'SMx', org_id: org })).toBe(false)
  })

  it('a voice note is outbound/<org>/<id>.ogg, for its company only', () => {
    const p = outboundVoicePath(org, 'v-1')
    expect(p).toBe(`outbound/${org}/v-1.ogg`)
    expect(storagePathBelongsTo(p, { message_sid: 'SMx', org_id: org })).toBe(true)
    expect(storagePathBelongsTo(p, { message_sid: 'SMx', org_id: other })).toBe(false)
  })

  it('a customer\'s file is inbound/<org>/<its sid>.<ext>, for that message of that company only', () => {
    const sid = 'MM0123456789abcdef0123456789abcdef'
    const p = inboundFilePath(org, sid, 'pdf')
    expect(p).toBe(`inbound/${org}/${sid}.pdf`)
    expect(storagePathBelongsTo(p, { message_sid: sid, org_id: org })).toBe(true)
    expect(storagePathBelongsTo(p, { message_sid: 'MMother', org_id: org })).toBe(false)
    expect(storagePathBelongsTo(p, { message_sid: sid, org_id: other })).toBe(false)
  })
})

describe('keeping our own copy of a Twilio file', () => {
  const ACC = 'AC' + 'a'.repeat(32)
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACC}/Messages/MM${'b'.repeat(32)}/Media/ME${'c'.repeat(32)}`
  const sid = 'MM' + 'b'.repeat(32)

  function fakeAdmin(row: { media_storage_path: string | null } | null) {
    const calls: { uploads: Array<{ path: string; type: string; size: number }>; updates: Array<Record<string, unknown>> } = { uploads: [], updates: [] }
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        update: (patch: Record<string, unknown>) => ({ eq: () => ({ is: async () => { calls.updates.push(patch); return { error: null } } }) }),
      }),
      storage: { from: () => ({ upload: async (p: string, b: Uint8Array, o: { contentType: string }) => { calls.uploads.push({ path: p, type: o.contentType, size: b.byteLength }); return { error: null } } }) },
    }
    return { admin: admin as never, calls }
  }
  const twilio = (status: number, type = 'application/pdf', bytes = 3) =>
    (async () => new Response(new Uint8Array(bytes), { status, headers: { 'content-type': type } })) as unknown as typeof fetch

  it('copies the bytes to inbound/<sid>.<ext> and points the row at them', async () => {
    const { admin, calls } = fakeAdmin({ media_storage_path: null })
    const r = await keepTwilioMedia(admin, { org_id: 'org-1', message_sid: sid, media_url: url, media_type: 'application/pdf' }, { fetch: twilio(200), accountSid: ACC, authToken: 't' })
    expect(r).toEqual({ ok: true, path: `inbound/org-1/${sid}.pdf` })
    expect(calls.uploads).toEqual([{ path: `inbound/org-1/${sid}.pdf`, type: 'application/pdf', size: 3 }])
    expect(calls.updates).toEqual([{ media_storage_path: `inbound/org-1/${sid}.pdf` }])
  })

  it('never fetches a link that is not our own Twilio account\'s', async () => {
    const { admin, calls } = fakeAdmin({ media_storage_path: null })
    const r = await keepTwilioMedia(admin, { org_id: 'org-1', message_sid: sid, media_url: 'https://evil.example/x.pdf', media_type: null }, { fetch: twilio(200), accountSid: ACC, authToken: 't' })
    expect(r.ok).toBe(false)
    expect(calls.uploads).toEqual([])
  })

  it('skips a message that was not stored (a blocked sender) or already has a copy; reports a Twilio failure', async () => {
    const opts = { fetch: twilio(200), accountSid: ACC, authToken: 't' }
    expect(await keepTwilioMedia(fakeAdmin(null).admin, { org_id: 'org-1', message_sid: sid, media_url: url, media_type: null }, opts)).toEqual({ ok: false, reason: 'message not stored' })
    expect(await keepTwilioMedia(fakeAdmin({ media_storage_path: 'inbound/x.pdf' }).admin, { org_id: 'org-1', message_sid: sid, media_url: url, media_type: null }, opts)).toEqual({ ok: false, reason: 'already copied' })
    const failed = await keepTwilioMedia(fakeAdmin({ media_storage_path: null }).admin, { org_id: 'org-1', message_sid: sid, media_url: url, media_type: null }, { ...opts, fetch: twilio(404) })
    expect(failed).toEqual({ ok: false, reason: 'Twilio answered 404' })
  })
})

describe('the storage area is created, privately, when it is missing (live 2026-11-13)', () => {
  function store(bucketExists: boolean) {
    const log: string[] = []
    let exists = bucketExists
    const client = {
      storage: {
        from: () => ({ upload: async (p: string) => { log.push(`upload ${p}`); return { error: exists ? null : { message: 'Bucket not found' } } } }),
        createBucket: async (name: string, o: { public: boolean }) => { log.push(`create ${name} public=${o.public}`); exists = true; return { error: null } },
      },
    }
    return { client, log }
  }

  it('creates the PRIVATE bucket and uploads again', async () => {
    const { client, log } = store(false)
    expect(await uploadWhatsAppMedia(client, 'inbound/MM1.jpg', new Uint8Array(1), { contentType: 'image/jpeg' })).toEqual({ error: null })
    expect(log).toEqual(['upload inbound/MM1.jpg', 'create whatsapp-media public=false', 'upload inbound/MM1.jpg'])
  })

  it('touches nothing else when the bucket is there', async () => {
    const { client, log } = store(true)
    await uploadWhatsAppMedia(client, 'x.pdf', new Uint8Array(1), { contentType: 'application/pdf' })
    expect(log).toEqual(['upload x.pdf'])
  })
})

describe('the backfill script agrees with the app', () => {
  it('same paths, same Twilio-link rule, same extensions', () => {
    const ACC = 'AC' + 'a'.repeat(32)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${ACC}/Messages/MM${'b'.repeat(32)}/Media/ME${'c'.repeat(32)}`
    for (const [org, sid, ext] of [['org-1', 'MMabc', 'pdf'], ['a/b', 'MM..x', 'jpg'], ['o', 's', '']]) {
      expect(backfill.inboundFilePath(org, sid, ext)).toBe(inboundFilePath(org, sid, ext))
    }
    for (const u of [url, 'https://evil.example/x', url.replace('api.twilio.com', 'api.twilio.com.evil'), null]) {
      expect(backfill.isOwnTwilioMediaUrl(u, ACC)).toBe(isOwnTwilioMediaUrl(u, ACC))
    }
    for (const mime of Object.keys(FILE_TYPES)) expect(backfill.extFor(mime)).toBe(extFor(mime))
    expect(backfill.MEDIA_BUCKET).toBe('whatsapp-media')
  })

  it('is a dry run unless --apply', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/keep-whatsapp-media.mjs'), 'utf8')
    expect(src).toMatch(/if \(!apply\) \{ console\.log\('Dry run/)
  })
})

describe('the routes check the company', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
  it('media: through the conversation, this company only, and only a path written for it', () => {
    const src = read('app/api/whatsapp/media/[id]/route.ts')
    expect(src).toContain(".eq('whatsapp_conversations.org_id', orgId)")
    expect(src).toContain('storagePathBelongsTo(storagePath, { message_sid: message.message_sid, org_id: orgId })')
  })
  it('attachment: this company\'s conversation; refuses before the migration rather than send a file the inbox cannot show', () => {
    const src = read('app/api/whatsapp/attachment/route.ts')
    expect(src).toMatch(/from\('whatsapp_conversations'\)[\s\S]*?\.eq\('org_id', orgId\)/)
    expect(src.indexOf('MISSING_COLUMN.has')).toBeLessThan(src.indexOf('uploadWhatsAppMedia('))
  })
  it('webhook: copies a stored message\'s file after answering Twilio', () => {
    const src = read('app/api/whatsapp/webhook/route.ts')
    expect(src.indexOf('keepTwilioMedia(')).toBeGreaterThan(src.indexOf("from('whatsapp_messages')"))
    expect(src).toMatch(/after\(async \(\) => \{\s*const kept = await keepTwilioMedia/)
  })
})
