import DOMPurify from 'dompurify'

// Sanitize untrusted HTML before rendering it via dangerouslySetInnerHTML.
// Inbound email / WhatsApp message bodies are attacker-controlled, so rendering
// them raw is a stored-XSS vector. DOMPurify strips scripts, event handlers,
// javascript: URLs, etc., keeping safe formatting.
//
// SSR-safe: DOMPurify needs a DOM `window`. These bodies are only shown after a
// client-side selection (never in the initial server-rendered HTML), so on the
// server we return '' and let the client fill it in on hydration — no unsanitized
// HTML ever reaches the DOM.
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  if (typeof window === 'undefined') return ''
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
