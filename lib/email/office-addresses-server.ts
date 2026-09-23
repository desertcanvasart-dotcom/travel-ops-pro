// ============================================
// The office-address rule, loaded — and applied to mail already stored
// ============================================
// See lib/email/office-addresses.ts for the rule.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any }

import { bareAddress, isOfficeAddress, officeRule, type OfficeRule } from '@/lib/email/office-addresses'

/** The rule for this install: every connected mailbox + every organisation's
 *  configured office addresses (one organisation per install today — G1). */
export async function loadOfficeRule(db: Db): Promise<OfficeRule> {
  const [tokens, orgs] = await Promise.all([
    db.from('gmail_tokens').select('email'),
    db.from('organizations').select('office_email_addresses'),
  ])
  const mailboxes = ((tokens.data ?? []) as { email: string | null }[]).map(t => t.email || '').filter(Boolean)
  const configured = ((orgs.data ?? []) as { office_email_addresses: string[] | null }[]).flatMap(o => o.office_email_addresses ?? [])
  return officeRule(mailboxes, configured)
}

/**
 * Mail stored as the customer writing that the rule says is ours: turn it into
 * our reply, recompute each conversation's reply state, and give a
 * conversation that the office itself started the customer's address instead
 * of the office's. Returns what changed.
 */
export async function applyOfficeRule(db: Db, rule: OfficeRule): Promise<{ messages: number; conversations: number }> {
  if (rule.addresses.length === 0 && rule.domains.length === 0) return { messages: 0, conversations: 0 }

  const patterns = [...rule.addresses, ...rule.domains.map(d => `@${d}`)]
  const or = patterns.map(p => `from_address.ilike.%${p.replace(/[%_,()]/g, '')}%`).join(',')
  const { data: candidates, error } = await db.from('email_messages')
    .select('id, conversation_id, from_address')
    .eq('direction', 'inbound')
    .or(or)
    .limit(2000)
  if (error) throw error

  // ilike found candidates; the rule decides (a domain must match exactly).
  const ours = ((candidates ?? []) as { id: string; conversation_id: string | null; from_address: string }[])
    .filter(m => isOfficeAddress(rule, m.from_address))
  const touched = new Set<string>()
  for (const m of ours) {
    const { error: upErr } = await db.from('email_messages').update({ direction: 'outbound' }).eq('id', m.id)
    if (upErr) throw upErr
    if (m.conversation_id) touched.add(m.conversation_id)
  }

  // Conversations whose customer address is the office's own.
  const convOr = patterns.map(p => `client_email.ilike.%${p.replace(/[%_,()]/g, '')}%`).join(',')
  const { data: officeConvs } = await db.from('email_conversations').select('id, client_email').or(convOr).limit(2000)
  for (const c of ((officeConvs ?? []) as { id: string; client_email: string | null }[]).filter(c => isOfficeAddress(rule, c.client_email))) {
    touched.add(c.id)
  }

  for (const id of touched) {
    const { error: rpcErr } = await db.rpc('refresh_email_conversation_reply_state', { p_conversation: id })
    if (rpcErr) throw rpcErr
    const { data: conv } = await db.from('email_conversations').select('client_email').eq('id', id).maybeSingle()
    if (conv && isOfficeAddress(rule, conv.client_email)) {
      const customer = await customerAddress(db, id, rule)
      if (customer) await db.from('email_conversations').update({ client_email: customer }).eq('id', id)
    }
  }
  return { messages: ours.length, conversations: touched.size }
}

// ── The scheduled repair: only when there can be something to repair ──────
// applyOfficeRule scans stored mail with `from_address ILIKE '%…%'` — no index
// can serve a leading wildcard, so it reads every inbound message — and the
// gmail-sync cron ran it every 10 minutes. But mail synced AFTER the rule
// exists is already stored the right way round (sync-mailbox and the live
// poller judge direction by the same rule). What the repair reaches is mail
// stored BEFORE the rule said so, which only happens when the rule changes:
// an office address added in Settings (that route applies it at once) or a
// mailbox connected. So the scheduled run repairs when the rule differs from
// the last one applied in this process — and otherwise at most every
// REPAIR_EVERY_MS, as a safety net for mail written by any other path.
// In-process on purpose: a restart simply repairs once more.

const REPAIR_EVERY_MS = 6 * 60 * 60 * 1000
let lastRepair: { fingerprint: string; at: number } | null = null

const fingerprintOf = (rule: OfficeRule) =>
  JSON.stringify([[...rule.addresses].sort(), [...rule.domains].sort()])

/** applyOfficeRule when the rule changed since the last repair here, or the
 *  last repair is older than six hours. Null when it was not due. */
export async function applyOfficeRuleWhenDue(
  db: Db,
  rule: OfficeRule,
  now: number = Date.now(),
): Promise<{ messages: number; conversations: number } | null> {
  const fingerprint = fingerprintOf(rule)
  if (lastRepair && lastRepair.fingerprint === fingerprint && now - lastRepair.at < REPAIR_EVERY_MS) return null
  const changed = await applyOfficeRule(db, rule)
  // Recorded only after it worked: a failed repair is tried again next run.
  lastRepair = { fingerprint, at: now }
  return changed
}

/** Tests only: forget the last repair. */
export function resetOfficeRuleRepairSchedule(): void {
  lastRepair = null
}

/** The first address in the conversation that is not the office's. */
async function customerAddress(db: Db, conversationId: string, rule: OfficeRule): Promise<string | null> {
  const { data } = await db.from('email_messages')
    .select('from_address, to_addresses, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
    .limit(50)
  for (const m of (data ?? []) as { from_address: string; to_addresses: string[] | null }[]) {
    for (const a of [m.from_address, ...(m.to_addresses ?? [])]) {
      if (a && !isOfficeAddress(rule, a) && bareAddress(a).includes('@')) return bareAddress(a)
    }
  }
  return null
}
