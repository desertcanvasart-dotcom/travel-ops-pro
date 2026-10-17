// ============================================
// Inbox rules: does a message match, and what to do with it
// ============================================
// Kept by the app (migration 20261202), applied to new mail after each sync
// and, on request, to what is already in the mailbox through Gmail search.
// Pure except applyRulesToNewMail, which takes its database and Gmail.

export interface RuleConditions {
  from?: string
  to?: string
  subject?: string
  has_words?: string
}

export interface RuleActions {
  /** A made folder (Gmail label id) to file the email in. */
  label_id?: string | null
  skip_inbox?: boolean
  mark_read?: boolean
  star?: boolean
  trash?: boolean
  spam?: boolean
}

export interface EmailRule {
  id: string
  name?: string | null
  org_id: string
  enabled: boolean
  conditions: RuleConditions
  actions: RuleActions
  applied_count?: number
}

export interface RuleMessage {
  from: string
  to: string[]
  cc: string[]
  subject: string
  text: string
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Clean conditions; null when none is left (a rule must match something). */
export function cleanConditions(c: unknown): RuleConditions | null {
  const src = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
  const out: RuleConditions = {}
  for (const k of ['from', 'to', 'subject', 'has_words'] as const) {
    const v = typeof src[k] === 'string' ? (src[k] as string).trim().slice(0, 300) : ''
    if (v) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/** Clean actions; null when there is nothing to do. */
export function cleanActions(a: unknown): RuleActions | null {
  const src = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
  const out: RuleActions = {}
  if (typeof src.label_id === 'string' && /^Label_[0-9]+$/.test(src.label_id)) out.label_id = src.label_id
  for (const k of ['skip_inbox', 'mark_read', 'star', 'trash', 'spam'] as const) if (src[k] === true) out[k] = true
  // Trash and spam are exclusive ends; trash wins.
  if (out.trash) delete out.spam
  return Object.keys(out).length ? out : null
}

// Matching works like Gmail's own search, not "contains": a rule moved mail
// out of the inbox when one of its words sat inside another ("tour" in
// "tourism"), and "from: booking.com" took "notbooking.com" too (operator,
// 2026-10-16: emails showed, then vanished on the next refresh).
//   - an address condition is the whole address, or a domain (with or
//     without "@") and its subdomains; anything else is words of the name;
//   - words are whole words. Japanese / Chinese text has no spaces between
//     words, so there a word is found anywhere in the text.

const ADDRESS = /[^\s<>"',;:()[\]]+@[^\s<>"',;:()[\]]+/g
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/

const addressesIn = (header: string) => (header.toLowerCase().match(ADDRESS) ?? []).map(a => a.replace(/\.$/, ''))
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A whole word (or, in CJK text, the characters anywhere). */
export function wordIn(text: string, word: string): boolean {
  const w = norm(word)
  if (!w) return true
  if (CJK.test(w)) return norm(text).includes(w)
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, 'iu').test(text)
}

/** Every word of the phrase, each as a whole word. */
const wordsIn = (text: string, phrase: string) => norm(phrase).split(' ').every(w => wordIn(text, w))

/** Does one header value ("Name <a@b.com>") meet a from/to condition? */
export function addressMatches(header: string, condition: string): boolean {
  const c = norm(condition)
  const addrs = addressesIn(header)
  if (c.includes('@') && !c.startsWith('@')) return addrs.includes(c)
  const domain = c.replace(/^@/, '')
  if (DOMAIN.test(domain)) return addrs.some(a => { const d = a.split('@')[1] ?? ''; return d === domain || d.endsWith(`.${domain}`) })
  return wordsIn(header, c)
}

export function ruleMatches(c: RuleConditions, m: RuleMessage): boolean {
  if (c.from && !addressMatches(m.from, c.from)) return false
  if (c.to && ![...m.to, ...m.cc].some(a => addressMatches(a, c.to!))) return false
  if (c.subject && !wordsIn(m.subject, c.subject)) return false
  if (c.has_words && !wordsIn(`${m.subject} ${m.text}`, c.has_words)) return false
  return true
}

/**
 * Why these conditions would move far more mail than meant, or null. A rule
 * on the office's own address (or its domain) takes every email the office
 * receives; a half address ("info@") matched every address containing it;
 * a one- or two-letter word is inside half of all mail.
 */
export function conditionProblem(c: RuleConditions, ownAddresses: string[]): string | null {
  const own = ownAddresses.map(a => a.trim().toLowerCase()).filter(Boolean)
  const ownDomains = new Set(own.map(a => a.split('@')[1]).filter(Boolean))
  for (const key of ['from', 'to'] as const) {
    const v = norm(c[key])
    if (!v) continue
    if (v.includes('@') && !v.startsWith('@') && !/^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) {
      return `"${c[key]}" is not a whole address — write the full address (name@example.com) or a domain (example.com).`
    }
    const domain = v.replace(/^@/, '')
    if (own.includes(v) || (DOMAIN.test(domain) && ownDomains.has(domain))) {
      return `"${c[key]}" is your own mailbox — a rule on it would catch every email you receive. Use the sender's address, a subject or words instead.`
    }
  }
  const short = norm(c.has_words).split(' ').find(w => w && !CJK.test(w) && w.length < 3)
  if (short) return `"${short}" is too short a word to filter on — it appears in most emails.`
  return null
}

/** The Gmail label change for a rule's actions (trash is its own call). */
export function labelChange(a: RuleActions): { add: string[]; remove: string[] } {
  const add = new Set<string>()
  const remove = new Set<string>()
  if (a.label_id) add.add(a.label_id)
  if (a.skip_inbox || a.spam) remove.add('INBOX')
  if (a.mark_read) remove.add('UNREAD')
  if (a.star) add.add('STARRED')
  if (a.spam) add.add('SPAM')
  return { add: [...add], remove: [...remove] }
}

/** The same conditions as a Gmail search, for "apply to existing". */
export function gmailQuery(c: RuleConditions): string {
  const q = (v: string) => (/[\s()"]/.test(v) ? `"${v.replace(/"/g, '')}"` : v)
  // A domain is "@domain" in Gmail search, so it does not take the domain
  // as a word of a name.
  const addr = (v: string) => (DOMAIN.test(norm(v)) ? `@${norm(v)}` : q(v))
  return [
    c.from ? `from:${addr(c.from)}` : '',
    c.to ? `to:${addr(c.to)}` : '',
    c.subject ? `subject:${q(c.subject)}` : '',
    c.has_words ? c.has_words.replace(/[()"]/g, ' ').trim() : '',
  ].filter(Boolean).join(' ')
}

// ---- after each sync ----

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

interface RuleGmail {
  users: { messages: {
    modify: (p: { userId: string; id: string; requestBody: { addLabelIds: string[]; removeLabelIds: string[] } }) => Promise<unknown>
    trash: (p: { userId: string; id: string }) => Promise<unknown>
  } }
}

export interface ApplyDeps {
  db: Db
  /** The organisation of a mailbox owner (lib/email/email-leads orgForMailbox). */
  orgForMailbox: (db: Db, mailboxUserId: string | null) => Promise<string | null>
  gmailFor: (mailboxUserId: string) => Promise<RuleGmail>
  limit?: number
}

/** Check each new inbound message once against its organisation's rules. */
export async function applyRulesToNewMail(deps: ApplyDeps): Promise<{ checked: number; applied: number; errors: number }> {
  const { db } = deps
  const { data: pending, error } = await db.from('email_messages')
    .select('id, message_id, conversation_id, from_address, to_addresses, cc_addresses, subject, body_text, snippet')
    .is('rules_checked_at', null)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: true })
    .limit(deps.limit ?? 100)
  if (error) throw error

  const rulesByOrg = new Map<string, EmailRule[]>()
  const mailboxByConversation = new Map<string, string | null>()
  let checked = 0, applied = 0, errors = 0

  for (const msg of (pending ?? []) as Array<{
    id: string; message_id: string; conversation_id: string | null; from_address: string
    to_addresses: string[] | null; cc_addresses: string[] | null; subject: string | null
    body_text: string | null; snippet: string | null
  }>) {
    // What a rule did is kept on the message (migration 20270106): the inbox
    // and Communicate say why an email left the Inbox.
    let ruleApplied: Record<string, unknown> | null = null
    const done = () => db.from('email_messages')
      .update({ rules_checked_at: new Date().toISOString(), ...(ruleApplied ? { rule_applied: ruleApplied } : {}) })
      .eq('id', msg.id)
    try {
      let mailbox: string | null = null
      if (msg.conversation_id) {
        if (!mailboxByConversation.has(msg.conversation_id)) {
          const { data: conv } = await db.from('email_conversations').select('user_id').eq('id', msg.conversation_id).maybeSingle()
          mailboxByConversation.set(msg.conversation_id, (conv?.user_id as string | null) ?? null)
        }
        mailbox = mailboxByConversation.get(msg.conversation_id) ?? null
      }
      const orgId = mailbox ? await deps.orgForMailbox(db, mailbox) : null
      if (!mailbox || !orgId) { await done(); checked++; continue }

      if (!rulesByOrg.has(orgId)) {
        const { data: rules } = await db.from('email_rules').select('id, name, org_id, enabled, conditions, actions, applied_count').eq('org_id', orgId).eq('enabled', true)
        rulesByOrg.set(orgId, (rules ?? []) as EmailRule[])
      }
      const message: RuleMessage = {
        from: msg.from_address, to: msg.to_addresses ?? [], cc: msg.cc_addresses ?? [],
        subject: msg.subject ?? '', text: msg.body_text || msg.snippet || '',
      }
      const hits = rulesByOrg.get(orgId)!.filter(r => ruleMatches(r.conditions || {}, message))
      if (hits.length > 0) {
        const gmail = await deps.gmailFor(mailbox)
        const add = new Set<string>(), remove = new Set<string>()
        let trash = false
        for (const r of hits) {
          const ch = labelChange(r.actions || {})
          ch.add.forEach(l => add.add(l))
          ch.remove.forEach(l => remove.add(l))
          if (r.actions?.trash) trash = true
        }
        if (trash) {
          await gmail.users.messages.trash({ userId: 'me', id: msg.message_id })
        } else if (add.size || remove.size) {
          await gmail.users.messages.modify({ userId: 'me', id: msg.message_id, requestBody: { addLabelIds: [...add], removeLabelIds: [...remove] } })
        }
        for (const r of hits) {
          r.applied_count = (r.applied_count ?? 0) + 1
          await db.from('email_rules').update({ applied_count: r.applied_count }).eq('id', r.id)
        }
        const merged: RuleActions = {}
        for (const r of hits) Object.assign(merged, r.actions || {})
        if (merged.trash) delete merged.spam
        ruleApplied = { rules: hits.map(r => ({ id: r.id, name: r.name ?? null })), actions: merged, at: new Date().toISOString() }
        applied++
      }
      try {
        const saved = await done()
        if (saved?.error) throw saved.error
      } catch (e) {
        // Before 20270106 there is no rule_applied column: mark it checked
        // without the record rather than apply the rule again next sync.
        if (!ruleApplied) throw e
        ruleApplied = null
        await done()
      }
      checked++
    } catch (err) {
      // Left unchecked: tried again on the next sync.
      console.error('[email-rules] message', msg.id, err instanceof Error ? err.message : err)
      errors++
    }
  }
  return { checked, applied, errors }
}
