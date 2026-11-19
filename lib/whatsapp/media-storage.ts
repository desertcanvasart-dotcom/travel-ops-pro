// ============================================
// Where WhatsApp files live in storage, and which paths a message may point at
// ============================================
// Shared by the attach route, the webhook's copy of incoming files, the media
// route that reads them back, and the backfill script, so they cannot drift.
// Ported from autoura-saas #819 / #820, with the company in every path
// (travel-ops-pro's whatsapp_messages carry no org of their own; the path's
// org is checked against the conversation's).

export const MEDIA_BUCKET = 'whatsapp-media'

/** The part of a storage client that uploads and makes buckets. */
interface MediaStorage {
  storage: {
    from(bucket: string): { upload(path: string, body: Uint8Array | ArrayBuffer | Blob, opts: { contentType: string; upsert?: boolean }): PromiseLike<{ error: { message: string } | null }> }
    createBucket(name: string, opts: { public: boolean }): PromiseLike<{ error: { message: string } | null }>
  }
}

/**
 * Upload into the whatsapp-media bucket, creating it PRIVATE the first time
 * it is needed (a fresh or self-hosted install has no dashboard step for it).
 * Every upload goes through here.
 */
export async function uploadWhatsAppMedia(
  client: MediaStorage,
  path: string,
  body: Uint8Array | ArrayBuffer | Blob,
  opts: { contentType: string; upsert?: boolean },
): Promise<{ error: { message: string } | null }> {
  let res = await client.storage.from(MEDIA_BUCKET).upload(path, body, opts)
  if (res.error && /bucket.*not.*found/i.test(res.error.message)) {
    // PRIVATE: customers' passports and payment slips. Reads go through
    // /api/whatsapp/media/[id], which checks the caller and signs a link.
    const made = await client.storage.createBucket(MEDIA_BUCKET, { public: false })
    if (made.error && !/already exists/i.test(made.error.message)) return { error: made.error }
    res = await client.storage.from(MEDIA_BUCKET).upload(path, body, opts)
  }
  return { error: res.error }
}

const SAFE = /[^a-zA-Z0-9_-]/g
const seg = (s: string) => s.replace(SAFE, '_')

/** A browser voice note is ~10–30 KB a minute; this is generous. */
export const MAX_VOICE_NOTE_BYTES = 10 * 1024 * 1024
export const MAX_VOICE_NOTE_SECONDS = 5 * 60

/** outbound/<org>/<id>.ogg: a voice note recorded in the inbox. */
export function outboundVoicePath(orgId: string, id: string): string {
  return `outbound/${seg(orgId)}/${seg(id)}.ogg`
}

/**
 * outbound/<org>/<id>/<file-name>: a file sent from the inbox. The file's own
 * (safe) name ends the path, so the link Twilio fetches carries it and the
 * customer's WhatsApp shows "Itinerary.pdf", not an id.
 */
export function outboundFilePath(orgId: string, id: string, safeName: string): string {
  return `outbound/${seg(orgId)}/${seg(id)}/${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

/** inbound/<org>/<sid>.<ext>: where a customer's file is kept once we have the bytes. */
export function inboundFilePath(orgId: string, messageSid: string, ext: string): string {
  return `inbound/${seg(orgId)}/${seg(messageSid)}.${ext.replace(/[^a-z0-9]/g, '') || 'bin'}`
}

/**
 * May this message's media_storage_path be signed? The service role signs
 * whatever it is given, so the path must be one written for THIS message of
 * THIS company: inbound/<its org>/<its sid>.<ext>, or an outbound file or
 * voice note under its org.
 */
export function storagePathBelongsTo(path: string, row: { message_sid: string | null; org_id: string }): boolean {
  const org = seg(row.org_id)
  const sid = seg(String(row.message_sid ?? ''))
  if (sid && new RegExp(`^inbound/${org}/${sid}\\.[a-z0-9]+$`).test(path)) return true
  return new RegExp(`^outbound/${org}/[a-zA-Z0-9_-]+\\.ogg$`).test(path) ||
    new RegExp(`^outbound/${org}/[a-zA-Z0-9_-]+/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$`).test(path)
}

/**
 * Is this media_url one of OUR Twilio account's media links? Only then may the
 * server fetch it with the account's credentials, never an arbitrary URL a
 * row was edited to hold.
 */
export function isOwnTwilioMediaUrl(url: string | null | undefined, accountSid: string | undefined): boolean {
  if (!url || !accountSid || !/^AC[a-f0-9]{32}$/i.test(accountSid)) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'api.twilio.com' &&
      new RegExp(`^/2010-04-01/Accounts/${accountSid}/Messages/MM[a-f0-9]{32}/Media/ME[a-f0-9]{32}$`, 'i').test(u.pathname)
  } catch {
    return false
  }
}
