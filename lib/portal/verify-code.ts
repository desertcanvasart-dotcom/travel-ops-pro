// ============================================
// The one-time code on a per-traveller portal link
// ============================================
// In friends mode the lead sees every friend's link, family name and date of
// birth — the whole name+DOB gate. The code is the one fact the lead never
// sees: it goes only to the traveller's own email. It is stored as an HMAC,
// used once, expires, and is discarded after MAX_ATTEMPTS wrong tries (a new
// one must then be emailed).

import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

export const MAX_ATTEMPTS = 5
/** In the link email — it may be opened days later. */
export const LINK_EMAIL_CODE_TTL_MS = 7 * 86_400_000
/** Asked for from the gate ("send me a new code"). */
export const RESEND_CODE_TTL_MS = 30 * 60_000
/** Between two codes asked for from the gate. */
export const RESEND_COOLDOWN_MS = 60_000

function secret(): string {
  return process.env.PORTAL_VERIFY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function hashVerifyCode(token: string, code: string): string {
  return createHmac('sha256', secret()).update(`portal-code:${token}:${code}`).digest('hex')
}

/** Digits only; full-width digits and spaces from a phone keyboard are fine. */
export function normalizeCode(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, '') : ''
}

/** A fresh code for this link, replacing any earlier one. Returns the code
 *  (to email) or null when it could not be stored. */
export async function issueVerifyCode(admin: Admin, token: string, ttlMs: number): Promise<string | null> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const { error } = await admin
    .from('booking_portal_links')
    .update({
      verify_code_hash: hashVerifyCode(token, code),
      verify_code_expires_at: new Date(Date.now() + ttlMs).toISOString(),
      verify_code_issued_at: new Date().toISOString(),
      verify_code_attempts: 0,
    })
    .eq('token', token)
  return error ? null : code
}

export type CodeState = {
  verify_code_hash?: string | null
  verify_code_expires_at?: string | null
  verify_code_attempts?: number | null
}

/** The link's code state, read on its own: before 20261122 is applied the
 *  columns do not exist, and selecting them with the link failed the whole
 *  read — every portal gate, family links included, answered "not found".
 *  A failed read is "no code issued" (a traveller with an email then cannot
 *  pass until the migration is applied — closed, not open). */
export async function readCodeState(admin: Admin, token: string): Promise<CodeState> {
  try {
    const { data, error } = await admin
      .from('booking_portal_links')
      .select('verify_code_hash, verify_code_expires_at, verify_code_attempts')
      .eq('token', token)
      .maybeSingle()
    if (error || !data) return {}
    return data as CodeState
  } catch {
    return {}
  }
}

/** Pure check of a code against the stored state. */
export function codeMatches(token: string, given: unknown, state: CodeState, now = Date.now()): boolean {
  const code = normalizeCode(given)
  if (!/^\d{6}$/.test(code) || !state.verify_code_hash) return false
  if (!state.verify_code_expires_at || Date.parse(state.verify_code_expires_at) <= now) return false
  if ((state.verify_code_attempts ?? 0) >= MAX_ATTEMPTS) return false
  const a = Buffer.from(hashVerifyCode(token, code), 'hex')
  const b = Buffer.from(state.verify_code_hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Check and consume: a match clears the code (single use); a miss counts
 *  toward MAX_ATTEMPTS, after which the code is discarded. */
export async function consumeVerifyCode(admin: Admin, token: string, given: unknown, state: CodeState): Promise<boolean> {
  if (codeMatches(token, given, state)) {
    await admin
      .from('booking_portal_links')
      .update({ verify_code_hash: null, verify_code_expires_at: null, verify_code_attempts: 0 })
      .eq('token', token)
    return true
  }
  if (state.verify_code_hash) {
    const attempts = (state.verify_code_attempts ?? 0) + 1
    await admin
      .from('booking_portal_links')
      .update(attempts >= MAX_ATTEMPTS
        ? { verify_code_hash: null, verify_code_expires_at: null, verify_code_attempts: 0 }
        : { verify_code_attempts: attempts })
      .eq('token', token)
  }
  return false
}

/** A traveller with an email on file (or a code already issued) must give
 *  the code. One with no email cannot receive one; their gate stays name+DOB. */
export function travellerNeedsCode(pax: { email?: string | null } | null, link: CodeState): boolean {
  return !!pax?.email?.trim() || !!link.verify_code_hash
}

/** The code paragraph for an email (Japanese, like the rest of the portal). */
export function codeEmailHtml(code: string, validFor: string): string {
  return `<p>確認コード：<strong style="font-size:20px;letter-spacing:4px">${code}</strong></p>` +
    `<p>このコードは${validFor}有効で、一度だけご利用いただけます。ほかの方には教えないでください。</p>`
}
