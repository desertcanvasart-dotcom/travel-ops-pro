// ============================================
// HTML ESCAPING
// ============================================
// One implementation, for every place this codebase builds an HTML string by
// interpolation — emails, PDF templates, printable documents. The alternative
// is what happened in app/api/pdf/generate: a template that dropped caller-
// supplied trip and customer text straight into markup, so a day description
// could close the tag it was sitting in and add markup of its own to a document
// that is then rendered by a real browser.

/** Escape text before it goes into HTML content or a double-quoted attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Format a number for display, never emitting NaN/Infinity into a document. */
export function money(value: unknown, digits = 2): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n.toFixed(digits) : (0).toFixed(digits)
}
