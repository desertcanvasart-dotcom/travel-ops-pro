// ============================================
// Traveller document uploads — what is accepted, and where it lands
// ============================================
// The one place that decides whether a file a stranger sent us is allowed in.
// The portal upload route is the only write path in this app that takes a FILE
// from someone with no session, so the rules live here rather than inline, and
// they are tested directly.
//
// Three separate checks, because each catches what the others miss:
//   1. The declared MIME must be on the allowlist. Cheap, and rejects the
//      obvious.
//   2. The real bytes must match that declared type. `file.type` is set by the
//      caller; a magic-byte sniff is what makes the allowlist mean anything.
//   3. The stored extension comes from the VALIDATED type, never the filename.
//      A name of `passport.jpg.html` must not decide how the object is served.
//
// The bucket is PRIVATE (migration 20260827_traveller_documents). Nothing here
// ever builds a public URL; reads are signed URLs issued by an org-scoped
// route. If you find yourself reaching for getPublicUrl on this bucket, stop.

import { safeKeySegment } from '@/lib/storage-key'

export const TRAVELLER_DOCS_BUCKET = 'traveller-documents'

/** 10 MB. A phone photo of a passport page is 2–5 MB; a scan is smaller. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

/** Supporting documents per traveller, excluding the passport slot. A cap so
 *  "attach anything" cannot become an unbounded store of personal data we did
 *  not ask for and have to defend. */
export const MAX_OTHER_DOCUMENTS = 6

export type DocumentKind = 'passport' | 'other'

/** Declared type → stored extension. Membership here IS the allowlist. */
export const EXT_FOR_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

export const ALLOWED_TYPES = Object.keys(EXT_FOR_TYPE)

/**
 * The type the bytes actually are, or null when they are none of the accepted
 * ones. HEIC is the awkward case and the common one — iPhones photograph a
 * passport as HEIC — so it is sniffed through its ISO-BMFF box rather than
 * trusted from the header alone.
 */
export function sniffType(buf: Uint8Array): string | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...buf.subarray(start, end))

  if (buf.length >= 4 && ascii(0, 4) === '%PDF') return 'application/pdf'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png'
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  // ISO base media file: bytes 4-8 are 'ftyp', then a brand. HEIC brands are
  // heic/heix/hevc/hevx/mif1/msf1.
  if (buf.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
  }
  return null
}

export type UploadRejection =
  | 'empty'
  | 'too_large'
  | 'type_not_allowed'
  | 'content_mismatch'
  | 'too_many'

/**
 * Decide whether these bytes may be stored.
 *
 * `declaredType` is caller-supplied and never trusted on its own; it must be on
 * the allowlist AND agree with the bytes. Returning the sniffed type (not the
 * declared one) means every caller downstream works from what the file really
 * is.
 */
export function checkUpload(
  bytes: Uint8Array,
  declaredType: string,
  opts: { existingOtherCount?: number; kind?: DocumentKind } = {}
): { ok: true; type: string; ext: string } | { ok: false; reason: UploadRejection } {
  if (!bytes || bytes.length === 0) return { ok: false, reason: 'empty' }
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'too_large' }
  if (!ALLOWED_TYPES.includes(declaredType)) return { ok: false, reason: 'type_not_allowed' }

  const sniffed = sniffType(bytes)
  // A JPEG announced as a PDF is as wrong as an executable announced as a
  // JPEG: if the two disagree we do not get to pick which one was honest.
  if (!sniffed || sniffed !== declaredType) return { ok: false, reason: 'content_mismatch' }

  if (
    opts.kind === 'other' &&
    (opts.existingOtherCount ?? 0) >= MAX_OTHER_DOCUMENTS
  ) {
    return { ok: false, reason: 'too_many' }
  }

  return { ok: true, type: sniffed, ext: EXT_FOR_TYPE[sniffed] }
}

/**
 * Where the object lands.
 *
 * Every segment is sanitised even though all of them are server-side ids —
 * the guarantee should hold by construction, not because today's callers
 * happen to pass UUIDs. `unique` keeps a re-upload from colliding with an
 * object still being read through an outstanding signed URL.
 */
export function documentStorageKey(args: {
  bookingId: string
  passengerId: string
  kind: DocumentKind
  ext: string
  unique: string
}): string {
  const booking = safeKeySegment(args.bookingId, 'booking')
  const passenger = safeKeySegment(args.passengerId, 'passenger')
  const kind = args.kind === 'passport' ? 'passport' : 'other'
  const unique = safeKeySegment(args.unique, 'file')
  const ext = safeKeySegment(args.ext, 'bin')
  return `${booking}/${passenger}/${kind}-${unique}.${ext}`
}

/** Retention: how long a scan may be kept after the trip ends.
 *  Zero days — the purge runs the day after the booking's end date. */
export const RETENTION_DAYS_AFTER_TRIP = 0

/**
 * When this upload becomes purgeable, stamped once at upload time.
 *
 * Deliberately NOT recomputed at purge time: if it were, moving a booking's
 * end date would silently extend how long a passport image is retained, and
 * nobody would ever notice that it had.
 *
 * A booking with no end date still gets a horizon — an undated booking must
 * not mean a passport kept for ever — so it falls back to a year from upload.
 */
export function purgeAfterFor(
  bookingEndDate: string | null | undefined,
  uploadedAt: Date
): string {
  const end = bookingEndDate ? Date.parse(`${String(bookingEndDate).slice(0, 10)}T00:00:00Z`) : NaN
  const base = Number.isFinite(end) ? new Date(end) : addDays(uploadedAt, 365)
  return addDays(base, RETENTION_DAYS_AFTER_TRIP + 1).toISOString()
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

/** Japanese labels for what the traveller sees. The portal is Japanese-only by
 *  design — an English fallback on a passport form invites the wrong kind of
 *  confidence — so the rejection reasons are too. */
export const REJECTION_MESSAGE_JA: Record<UploadRejection, string> = {
  empty: 'ファイルが空です。',
  too_large: 'ファイルサイズが大きすぎます（上限10MB）。',
  type_not_allowed: 'この形式には対応していません。PDF・JPEG・PNG・WEBP・HEICをご利用ください。',
  content_mismatch: 'ファイルの内容が形式と一致しません。別のファイルをお試しください。',
  too_many: `添付できる書類は${MAX_OTHER_DOCUMENTS}件までです。`,
}
