// ============================================
// Whose company is this? — one answer, for everything a customer sees
// ============================================
// The operator's own name, email, website and phone were literals in 30 files:
// invoice reminders, booking confirmations, WhatsApp templates, contract PDFs,
// transport vouchers, the navigation bar. Some were bare strings; 35 more were
// `process.env.BUSINESS_NAME || <a literal>`, where the env var is honoured and
// THE LITERAL IS THE DEFAULT — so an install that had not set it sent mail
// signed with another agency's name, and pointed customers at their website.
//
// That is a blocker for a second install, and it is why this exists.
//
// BLANK BEATS FAKE. The same rule lib/org-name.ts already applies to the
// company name on an invoice: a document with no name looks unfinished, which
// it is; a document naming a company that does not exist looks wrong in a way
// the reader cannot diagnose. So every field here falls back to '' — never to
// a placeholder, and never to whoever wrote the code.
//
// TWO ACCESSORS, because the callers genuinely differ:
//
//   businessIdentity()  synchronous, environment only. For pure formatters
//                       (PDF builders, message composers) that must not reach
//                       for a database, and for code with no org in scope.
//   orgIdentity()       async, prefers the `organizations` row and falls back
//                       to the environment. For routes that already know which
//                       organization they are acting for.
//
// The organization row is the better source: it is edited in Settings by the
// person whose company it is, rather than in a deploy variable.

import { customerFacingOrgName } from '@/lib/org-name'

// createServerClient is imported LAZILY, inside orgIdentity(), on purpose.
// At module scope it builds a Supabase client and throws "supabaseUrl is
// required" when the environment is not configured — which took two unrelated
// AI test suites down the moment they imported businessIdentity(), a function
// that reads nothing but process.env. A synchronous, env-only accessor must not
// drag a database client into every file that wants the operator's name.

export interface OrgIdentity {
  /** The trading name, or '' if unset or still a seeded placeholder. */
  name: string
  email: string
  phone: string
  website: string
  address: string
  /** The operator's own marketing line, if they set one in Settings. The
   *  templates used to hardcode the first operator's ("…local Egypt travel
   *  experts"), which is a claim, not a label — so it comes from their row or
   *  it does not appear. */
  tagline: string
}

export const EMPTY_IDENTITY: OrgIdentity = {
  name: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  tagline: '',
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Identity from the environment. Never invents a value.
 *
 * `BUSINESS_NAME` and friends are documented in .env.example. An install that
 * sets none of them gets blanks, which reads as unfinished rather than as
 * somebody else's company.
 */
export function businessIdentity(env: NodeJS.ProcessEnv = process.env): OrgIdentity {
  return {
    name: customerFacingOrgName(clean(env.BUSINESS_NAME)),
    email: clean(env.BUSINESS_EMAIL),
    phone: clean(env.BUSINESS_WHATSAPP),
    website: clean(env.BUSINESS_WEBSITE),
    address: '',
    // No BUSINESS_TAGLINE: a tagline is written, edited and reconsidered, which
    // is Settings' job, not a deploy variable's.
    tagline: '',
  }
}

/** An `organizations` row → identity, applying the placeholder-name rule. */
export function identityFromOrg(org: Record<string, unknown> | null | undefined): OrgIdentity {
  if (!org) return EMPTY_IDENTITY
  return {
    name: customerFacingOrgName(clean(org.name)),
    email: clean(org.contact_email),
    phone: clean(org.company_phone),
    website: clean(org.company_website),
    address: clean(org.company_address),
    tagline: clean(org.tagline),
  }
}

/** Field-by-field: the organization's value if it has one, else the env's. */
export function mergeIdentity(primary: OrgIdentity, fallback: OrgIdentity): OrgIdentity {
  return {
    name: primary.name || fallback.name,
    email: primary.email || fallback.email,
    phone: primary.phone || fallback.phone,
    website: primary.website || fallback.website,
    address: primary.address || fallback.address,
    tagline: primary.tagline || fallback.tagline,
  }
}

/**
 * The operator's identity for customer-facing output.
 *
 * Prefers the organization row — it is edited by the person whose company it
 * is — and falls back per field to the environment. Fails soft: a database
 * that will not answer must not stop an invoice being generated, so the
 * environment's answer is used and the document is merely less complete.
 */
export async function orgIdentity(orgId?: string | null): Promise<OrgIdentity> {
  const env = businessIdentity()
  if (!orgId) return env
  try {
    const { createServerClient } = await import('@/lib/supabase-server')
    const supabase = createServerClient()
    const { data } = await supabase
      .from('organizations')
      // select('*') deliberately: naming columns here would break the whole
      // read the day one is added or renamed, and this is on the path of every
      // customer document.
      .select('*')
      .eq('id', orgId)
      .maybeSingle()
    return mergeIdentity(identityFromOrg(data as Record<string, unknown> | null), env)
  } catch {
    return env
  }
}

/**
 * The operator's initials, for a letterhead monogram.
 *
 * Two customer-facing PDF templates drew a circle reading "T2E" — the first
 * operator's initials, hardcoded, on every agency's quote. Initials are
 * identity exactly as the name is, so they are derived from it and blank when
 * it is blank: a letterhead with no monogram is unfinished, one with somebody
 * else's is wrong.
 *
 * Words, not characters, and at most three — "Karnak Voyages Ltd" is KVL, and
 * a single-word name gives its first two letters rather than one lonely
 * capital. Non-Latin names (a Japanese operator's 会社名) have no initials to
 * take, so the first character stands for the whole.
 */
export function monogram(name: string): string {
  const words = clean(name).split(/[\s\-–—]+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words
    .slice(0, 3)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

/**
 * A sign-off line, or '' when the operator has no name set.
 *
 * `"Best regards,\n"` alone is a complete, correct sign-off. `"Best regards,\n
 * Travel2Egypt"` sent from another agency is not.
 */
export function signOff(identity: OrgIdentity, greeting = 'Best regards,'): string {
  return identity.name ? `${greeting}\n${identity.name}` : greeting
}
