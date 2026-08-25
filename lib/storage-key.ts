// ============================================
// SAFE OBJECT-STORAGE KEYS
// ============================================
// Every storage key in this app is built by interpolating an id, a document
// number or a filename extension into a template:
//
//   `supplier-documents/${documentNumber}-${Date.now()}.pdf`
//
// When that value comes from a request body it decides where the object lands.
// These are Supabase Storage keys rather than filesystem paths, so the ceiling
// is lower than the phrase "path traversal" suggests — nobody reaches
// /etc/passwd. But several of these buckets are created `public: true`, so an
// object written to an unexpected key is world-readable by URL, and
// `upsert: true` means it can land ON something already there.
//
// One sanitiser, applied at every interpolation, so the guarantee holds by
// construction instead of by each route remembering to be careful.

/**
 * Reduce one interpolated value to a single safe path SEGMENT.
 *
 * Keeps the characters real ids and document numbers actually use
 * (`a-z A-Z 0-9 . _ -`) and drops everything else, so a value can neither
 * introduce a `/` to nest itself somewhere unexpected nor a `..` to climb.
 *
 * A legitimate value passes through untouched: `INV-2026-0001` and a UUID are
 * unchanged, so this does not move any object already in storage.
 */
export function safeKeySegment(value: unknown, fallback = 'unknown'): string {
  const raw = String(value ?? '')
  const cleaned = raw
    .replace(/[^A-Za-z0-9._-]/g, '')
    // Collapse dot runs: a lone dot is fine in a filename, `..` is a climb.
    .replace(/\.{2,}/g, '.')
    // A leading dot makes a hidden file and is never wanted in a generated key.
    .replace(/^\.+/, '')
  // Cap it: a key is not a place to store a megabyte of attacker text.
  const capped = cleaned.slice(0, 100)
  return capped || fallback
}

/**
 * The extension for a generated filename, taken from a user-supplied name.
 *
 * `name.split('.').pop()` cannot itself produce a `..` — it returns the text
 * after the FINAL dot, which by construction contains no dot — but it can
 * return a `/`, an empty string, or a kilobyte of junk. This returns a short
 * alphanumeric extension or the fallback, and never a separator.
 */
export function safeExtension(fileName: unknown, fallback = 'bin'): string {
  const name = String(fileName ?? '')
  const dot = name.lastIndexOf('.')
  if (dot === -1 || dot === name.length - 1) return fallback
  const ext = name.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  return ext.toLowerCase() || fallback
}
