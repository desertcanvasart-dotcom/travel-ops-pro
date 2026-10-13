// ============================================
// A PDF the browser rendered, checked before it is sent
// ============================================
// The voucher send routes (email and WhatsApp) attach the PDF the page made
// in the browser. The base64 string was used as it came: spliced raw into the
// email's MIME body — where a CRLF and the guessable boundary could add
// parts of the caller's choosing — and uploaded as "application/pdf"
// whatever it held, at any size. It is now decoded and checked: base64 only,
// a real PDF (starts with %PDF-), at most MAX_PDF_BYTES; and what is sent is
// re-encoded from the bytes, never the string as given.

/** A voucher is a page or two; 10 MB leaves room for a logo and fonts. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

export type PdfAttachment =
  | { ok: true; bytes: Buffer; base64: string }
  | { ok: false; error: string }

export function decodePdfAttachment(input: unknown): PdfAttachment {
  if (typeof input !== 'string' || input.length === 0) return { ok: false, error: 'PDF attachment is required' }
  // A data: URI's prefix is tolerated (jsPDF's datauristring); nothing else.
  const raw = input.replace(/^data:application\/pdf;(?:[a-z0-9=._-]+;)*base64,/i, '')
  // 4/3 of the byte limit, plus padding: refuse before decoding a huge string.
  if (raw.length > Math.ceil(MAX_PDF_BYTES / 3) * 4) return { ok: false, error: 'PDF attachment is too large' }
  if (raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
    return { ok: false, error: 'PDF attachment is not valid base64' }
  }
  const bytes = Buffer.from(raw, 'base64')
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, error: 'PDF attachment is too large' }
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, error: 'The attachment is not a PDF' }
  }
  return { ok: true, bytes, base64: bytes.toString('base64') }
}

/** Base64 in 76-character lines, as MIME (RFC 2045) wants a body part. */
export function mimeBase64Lines(base64: string): string {
  return base64.replace(/.{76}(?=.)/g, '$&\r\n')
}
