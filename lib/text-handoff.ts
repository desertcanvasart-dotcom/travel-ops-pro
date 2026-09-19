// ============================================
// HANDING A LONG TEXT TO THE NEXT PAGE
// ============================================
// The inbox hands an email to the parser, the unified thread hands a
// conversation to the pricing grid, and the inbox hands an order form to the
// intake. All three used to base64 the whole text into the query string.
//
// That works until it doesn't. A URL is part of the request LINE, which counts
// against Node's header budget — 16KB by default — and base64 costs a third
// more than the text it carries, on top of the percent-encoding of its own
// `+` and `/`. A Japanese email is three UTF-8 bytes per character before any
// of that. Operator, 2026-09-19, clicking Parse on a real email:
//
//     autoura.net/whatsapp-parser?conversation=RnJvbTogSnVhbi0YSBMIFB...
//     This page isn't working — HTTP ERROR 431
//
// 431 is "Request Header Fields Too Large". Nothing reached the app, so
// nothing was logged and nothing could be caught: the longer the email, the
// more certain the failure, which is exactly backwards for a parser whose job
// is long emails.
//
// So the text travels in sessionStorage and only a short key goes in the URL.
// sessionStorage is per-tab and these handovers are same-tab navigations, so
// the text is there when the next page asks for it, and it is gone when the
// tab closes.

const PREFIX = 'travel-ops:handoff:'
/** Long enough to survive a slow page load, short enough not to accumulate. */
const MAX_AGE_MS = 60 * 60 * 1000

interface Stashed {
  text: string
  at: number
}

/** Old handovers from earlier navigations in this tab. */
function prune(store: Storage) {
  const now = Date.now()
  for (let i = store.length - 1; i >= 0; i--) {
    const key = store.key(i)
    if (!key?.startsWith(PREFIX)) continue
    try {
      const entry = JSON.parse(store.getItem(key) || '{}') as Partial<Stashed>
      if (!entry.at || now - entry.at > MAX_AGE_MS) store.removeItem(key)
    } catch {
      store.removeItem(key)
    }
  }
}

/**
 * Park `text` for the next page and return the key that fetches it.
 *
 * Returns null when there is no session storage to park it in (SSR, a locked
 * -down browser, a full quota). The caller then falls back to the URL, which
 * is what every caller did before — fine for a short text, and a long one was
 * already failing.
 */
export function stashHandoffText(text: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const store = window.sessionStorage
    prune(store)
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const entry: Stashed = { text, at: Date.now() }
    store.setItem(PREFIX + key, JSON.stringify(entry))
    return key
  } catch {
    return null
  }
}

/**
 * The text a key was parked under, or null.
 *
 * Null is a real answer, not only an error: a key whose URL was copied into
 * another tab or reopened tomorrow has no text behind it, and the page should
 * say so rather than showing an empty box that looks like it lost the email.
 */
export function readHandoffText(key: string | null | undefined): string | null {
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as Partial<Stashed>
    return typeof entry.text === 'string' ? entry.text : null
  } catch {
    return null
  }
}

/**
 * UTF-8 safe base64, for the fallback path.
 *
 * `btoa(String.fromCharCode(...bytes))` — which the unified thread used —
 * spreads the whole array into a call frame and throws RangeError on a long
 * conversation, so the fallback has to not be that.
 */
export function encodeTextParam(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** The inverse, tolerant of the URL-safe alphabet and of missing padding. */
export function decodeTextParam(value: string): string {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}
