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

export function ruleMatches(c: RuleConditions, m: RuleMessage): boolean {
  const has = (hay: string, needle?: string) => !needle || norm(hay).includes(norm(needle))
  if (!has(m.from, c.from)) return false
  if (c.to && ![...m.to, ...m.cc].some(a => has(a, c.to))) return false
  if (!has(m.subject, c.subject)) return false
  if (c.has_words) {
    const body = norm(`${m.subject} ${m.text}`)
    if (!norm(c.has_words).split(' ').every(w => body.includes(w))) return false
  }
  return true
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
  return [
    c.from ? `from:${q(c.from)}` : '',
    c.to ? `to:${q(c.to)}` : '',
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
    const done = () => db.from('email_messages').update({ rules_checked_at: new Date().toISOString() }).eq('id', msg.id)
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
        const { data: rules } = await db.from('email_rules').select('id, org_id, enabled, conditions, actions, applied_count').eq('org_id', orgId).eq('enabled', true)
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
        applied++
      }
      await done()
      checked++
    } catch (err) {
      // Left unchecked: tried again on the next sync.
      console.error('[email-rules] message', msg.id, err instanceof Error ? err.message : err)
      errors++
    }
  }
  return { checked, applied, errors }
}
