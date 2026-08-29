#!/usr/bin/env node
// ============================================
// scope-inbox — retire the mailbox backlog from the shared inbox
// ============================================
// The email sync used to ingest the operator's ENTIRE Gmail into the shared
// store (see lib/email-scoping.ts for the rule that now stops it). This
// script deals with what was ingested BEFORE that rule existed: it classifies
// every stored conversation and HIDES the ones that are machine mail with no
// business relationship — verification codes, bank notifications,
// newsletters.
//
//   node --env-file=.env.local scripts/scope-inbox.mjs           # dry run
//   node --env-file=.env.local scripts/scope-inbox.mjs --yes     # apply
//
// HIDES, never deletes. is_hidden is the product's own soft-delete, it is
// reversible from the UI, and hidden threads are visible only to the mailbox
// owner — which is exactly where personal mail belongs. The audit that found
// this data said "purge test data from all production tenants"; following
// that advice would have deleted 137 threads of the operator's real mail,
// supplier correspondence included. Hiding cannot destroy anything.
//
// Stored rows carry no headers or Gmail labels, so this classifies on what
// exists: the counterparty address shape, the known-contact tables, and
// whether a client is already linked. Weaker than the live classifier — a
// personal note from a human stays visible — but every signal it does use
// means the same thing it means at sync time.

import { createClient } from '@supabase/supabase-js'
import { MACHINE_LOCAL_PART } from '../lib/email-scoping-core.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (node --env-file=.env.local).')
  process.exit(1)
}
const supabase = createClient(url, key)
const apply = process.argv.includes('--yes')

async function all(table, cols) {
  const { data, error } = await supabase.from(table).select(cols)
  if (error) throw new Error(`${table}: ${error.message}`)
  return data ?? []
}

const known = new Set()
for (const [table, col] of [['clients', 'email'], ['suppliers', 'contact_email'], ['b2b_partners', 'email']]) {
  for (const row of await all(table, col)) {
    const v = row[col]
    if (typeof v === 'string' && v.includes('@')) known.add(v.trim().toLowerCase())
  }
}

const conversations = await all(
  'email_conversations',
  'id, client_email, client_id, subject, is_hidden, message_count, last_message_at'
)

const toHide = []
for (const c of conversations) {
  if (c.is_hidden) continue                       // already somebody's decision
  if (c.client_id) continue                       // linked to a client — business
  const email = (c.client_email ?? '').trim().toLowerCase()
  if (known.has(email)) continue                  // known contact — business
  const localPart = email.split('@')[0] ?? ''
  if (!MACHINE_LOCAL_PART.test(localPart)) continue // shaped like a person — leave it
  toHide.push(c)
}

console.log(`conversations: ${conversations.length}`)
console.log(`already hidden: ${conversations.filter(c => c.is_hidden).length}`)
console.log(`machine mail with no business link: ${toHide.length}`)
console.log('')

for (const c of toHide) {
  const when = (c.last_message_at ?? '').slice(0, 10)
  console.log(`  ${when}  ${c.client_email}  — ${String(c.subject ?? '').slice(0, 60)}`)
}

if (!toHide.length) {
  console.log('Nothing to do.')
  process.exit(0)
}

if (!apply) {
  console.log('')
  console.log('Dry run. Read the list — every line will be HIDDEN (owner-only), not deleted.')
  console.log('Re-run with --yes to apply.')
  process.exit(0)
}

// By ids from our own scoped select, one batch — the notifications lesson:
// PostgREST rejects or= on mutations, so mutate by the ids you already hold.
const { error } = await supabase
  .from('email_conversations')
  .update({ is_hidden: true, updated_at: new Date().toISOString() })
  .in('id', toHide.map(c => c.id))
if (error) {
  console.error('Update failed:', error.message)
  process.exit(1)
}
console.log('')
console.log(`Hidden ${toHide.length} conversation(s). Reversible: the mailbox owner sees them under include_hidden and can un-hide any of them.`)
