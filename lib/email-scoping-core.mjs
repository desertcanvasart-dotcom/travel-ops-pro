// ============================================
// Email scoping — RUNTIME CORE
// ============================================
// Plain JavaScript on purpose, mirroring lib/support/bundle-core.mjs: the
// same classifier has to run inside the Next app (TypeScript) AND inside
// scripts/scope-inbox.mjs, a bare node script that cannot import .ts. Two
// copies of the do-not-reply pattern is how one of them stops matching.
//
// The rule itself is documented in lib/email-scoping.ts, the typed surface.

/** Sender local-parts that are machinery, not people. Anchored to the local
 *  part so a real person like "renee.ply@…" is never caught by "reply". */
export const MACHINE_LOCAL_PART =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|mailer-daemon|postmaster|bounce[s]?|newsletters?|marketing|updates?|info-noreply|security|account-security|verification|verify)([+.\-_].*)?$/i

/** Gmail's own sort of the mailbox. PERSONAL (and unlabelled) mail passes;
 *  the categories Gmail itself files as machine output do not. */
const MACHINE_CATEGORIES = new Set([
  'CATEGORY_PROMOTIONS',
  'CATEGORY_SOCIAL',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS',
])

const header = (headers, name) => {
  if (!headers) return ''
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : ''
}

/**
 * Does this message look like it was produced by a machine?
 *
 * Pure and side-effect free; every signal is independently sufficient. The
 * strongest come first: Auto-Submitted is the standard (RFC 3834) way for
 * generated mail — verification codes included — to declare itself.
 */
/** The website's order form (tour-up.jp お問合せフォーム) arrives from a
 *  system address with a fixed subject. It is the office's next customer,
 *  not machinery: a subject or opening line that names the form is
 *  correspondence whatever the sender's local part says. */
export const ORDER_FORM_MARKERS = /(お問合せフォーム|お問い合わせフォーム|申込みフォーム|ツアーコード|tour-up\.jp)/
export function looksLikeOrderForm(input) {
  const s = `${input?.subject ?? ''}\n${input?.snippet ?? ''}`
  return ORDER_FORM_MARKERS.test(s)
}

export function looksAutomated(input) {
  if (looksLikeOrderForm(input)) return false
  const autoSubmitted = header(input.headers, 'Auto-Submitted').trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true

  const precedence = header(input.headers, 'Precedence').trim().toLowerCase()
  if (precedence === 'bulk' || precedence === 'junk' || precedence === 'list') return true

  if (header(input.headers, 'List-Id') || header(input.headers, 'List-Unsubscribe')) return true

  if (input.labelIds && input.labelIds.some(l => MACHINE_CATEGORIES.has(l))) return true

  const localPart = (input.counterpartyEmail || '').split('@')[0] || ''
  return MACHINE_LOCAL_PART.test(localPart)
}

/**
 * Should this thread enter the SHARED store?
 *
 * `isKnownContact` is the caller's lookup against clients/suppliers/partners
 * (and existing conversations — a thread already in the store stays in sync,
 * because hiding is the operator's decision and re-classifying would undo it).
 */
export function shouldStoreThread(input, isKnownContact) {
  if (isKnownContact) return true
  return !looksAutomated(input)
}
