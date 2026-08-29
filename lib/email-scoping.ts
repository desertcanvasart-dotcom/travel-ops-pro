// ============================================
// What belongs in the shared inbox — and what stays personal
// ============================================
// The unified inbox is built by syncing the operator's connected Gmail into
// email_conversations/email_messages, where every staff member can read it.
// The sync's only filter was `after:<date>` — so it ingested the WHOLE
// mailbox: live 2FA codes ("Your ChatGPT code is 354411"), GitHub and banking
// notifications, personal calendar invites. All of it readable by every
// account on the install. An external audit (AUT-H02) saw the symptom and
// called it "test data leaked into production"; the reality was worse — it
// was the operator's real mailbox, shared with the whole team.
//
// THE RULE: the shared inbox holds CORRESPONDENCE — mail a person wrote, or
// mail involving a known business contact. Machine mail addressed to the
// operator personally (verification codes, alerts, newsletters, receipts from
// SaaS tools) never enters the shared store at all. Not hidden: never stored.
//
// Three-step decision, in order:
//   1. Known business contact (client / supplier / B2B partner email, or a
//      thread already in the store) → SYNC. This overrides every machine
//      signal, because booking systems legitimately write from no-reply@.
//   2. Machine-shaped (RFC 3834 Auto-Submitted, bulk precedence, list
//      headers, Gmail's own PROMOTIONS/SOCIAL/UPDATES/FORUMS categories, or a
//      do-not-reply sender) → SKIP.
//   3. Anything else is a human writing to the agency → SYNC. An agency's
//      next customer is, by definition, someone not yet in the clients table
//      — an allowlist alone would silently drop every new inquiry.
//
// The classifier lives in lib/email-scoping-core.mjs (plain JS) so
// scripts/scope-inbox.mjs — bare node, no TS — runs the same rules the app
// does. This file is the typed surface plus the database-aware loader.

export {
  looksAutomated,
  shouldStoreThread,
  type EmailClassifierInput,
} from './email-scoping-core.mjs'

/**
 * Every address the business knows, lowercased, for the known-contact check.
 *
 * One query per table per sync run, not per message. Suppliers keep their
 * address on `contact_email` (lib/suppliers/fields.ts is the vocabulary);
 * clients and partners on `email`.
 */
export async function loadKnownContactEmails(
  supabase: {
    from: (t: string) => {
      select: (c: string) => PromiseLike<{ data: Array<Record<string, unknown>> | null }>
    }
  }
): Promise<Set<string>> {
  const known = new Set<string>()
  const collect = (rows: Array<Record<string, unknown>> | null, col: string) => {
    for (const row of rows ?? []) {
      const v = row[col]
      if (typeof v === 'string' && v.includes('@')) known.add(v.trim().toLowerCase())
    }
  }
  const [clients, suppliers, partners] = await Promise.all([
    supabase.from('clients').select('email'),
    supabase.from('suppliers').select('contact_email'),
    supabase.from('b2b_partners').select('email'),
  ])
  collect(clients.data, 'email')
  collect(suppliers.data, 'contact_email')
  collect(partners.data, 'email')
  return known
}
