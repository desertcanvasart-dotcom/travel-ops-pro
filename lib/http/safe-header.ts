// ============================================
// HEADER-SAFE STRINGS
// ============================================
// Any value interpolated into an email header (To, Subject) or an HTTP header
// must not carry CR or LF: a newline lets the caller inject additional headers
// — a hidden Bcc, a forged Reply-To, a second Subject. Gmail's raw MIME builder
// and the SMTP path both construct headers by string interpolation, so the
// value has to be cleaned at the point it goes in.

// CR, LF, and the other C0 control characters (0x00–0x1F) plus DEL (0x7F). Any
// of these in a header value is either an injection attempt or corruption.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g

/** Strip CR/LF and control chars so a value cannot break out of its header. */
export function headerSafe(value: unknown): string {
  return String(value ?? '').replace(CONTROL_CHARS, ' ').trim()
}

/**
 * A single email address, header-safe. Collapses to '' if the cleaned value has
 * no '@' — a caller passing a header-injection payload gets nothing usable, not
 * a smuggled header.
 */
export function safeEmailAddress(value: unknown): string {
  const cleaned = headerSafe(value)
  return cleaned.includes('@') ? cleaned : ''
}
