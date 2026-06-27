#!/usr/bin/env node
// ============================================
// Phase 0 verification: fire a test Concierge brief end-to-end.
// ============================================
// Bypasses HMAC by writing directly to Supabase with the service-role key
// (read from .env.local). INSERTs a test concierge_briefs row, then mirrors
// the promoteBriefToThread() logic in lib/concierge/promote-brief-to-thread.ts
// to create the communication_thread + communication_inbox row that should
// surface in /copilot.
//
// REQUIRES migration 20260626_concierge_to_copilot.sql applied first
// (adds communication_threads.brief_id, origin + partial unique index).
//
// Usage:
//   node scripts/phase0-fire-concierge-test.mjs                    # fresh brief, rev 1
//   node scripts/phase0-fire-concierge-test.mjs --revision 2 \
//        --conversation-id <existing>                              # bump revision
//   node scripts/phase0-fire-concierge-test.mjs --conversation-id <existing>
//                                                                  # exact replay test
// ============================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ---- env loader (minimal; .env.local only) ----
function loadEnvLocal() {
  const path = resolve(repoRoot, '.env.local')
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const [, k, vRaw] = m
    const v = vRaw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    if (!process.env[k]) process.env[k] = v
  }
}

// ---- args ----
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = true
    }
  }
  return args
}

// ---- promotion logic (mirrors lib/concierge/promote-brief-to-thread.ts) ----
const PG_UNIQUE_VIOLATION = '23505'

function deriveChannel(preferred) {
  return (preferred || '').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'email'
}
function deriveContactInfo(brief, channel) {
  if (channel === 'whatsapp') return brief.visitor_phone || brief.visitor_email || 'unknown'
  return brief.visitor_email || brief.visitor_phone || 'unknown'
}

async function promoteBriefToThread(briefId, supabase) {
  const { data: brief, error: briefErr } = await supabase
    .from('concierge_briefs')
    .select(
      'id, client_id, visitor_name, visitor_email, visitor_phone, preferred_contact, brief_summary, brief_revision, submitted_at, received_at'
    )
    .eq('id', briefId)
    .maybeSingle()
  if (briefErr || !brief) throw new Error(`brief not found: ${briefId}: ${briefErr?.message || ''}`)

  const channel = deriveChannel(brief.preferred_contact)
  const contactInfo = deriveContactInfo(brief, channel)
  const nowIso = new Date().toISOString()
  const lastMessageAt = brief.submitted_at || brief.received_at || nowIso
  const revision = brief.brief_revision ?? 1

  let threadId
  let wasNewThread = false

  const { data: existingThread } = await supabase
    .from('communication_threads')
    .select('id, client_id')
    .eq('brief_id', briefId)
    .maybeSingle()

  if (existingThread) {
    threadId = existingThread.id
    const update = { last_message_at: lastMessageAt, updated_at: nowIso }
    if (!existingThread.client_id && brief.client_id) {
      update.client_id = brief.client_id
      update.client_name = brief.visitor_name
    }
    const { error: updErr } = await supabase
      .from('communication_threads')
      .update(update)
      .eq('id', threadId)
    if (updErr) console.warn('thread metadata update warning:', updErr.message)
  } else {
    const { data: created, error: insertErr } = await supabase
      .from('communication_threads')
      .insert({
        channel,
        client_id: brief.client_id,
        client_name: brief.visitor_name,
        contact_info: contactInfo,
        subject: 'AI Concierge brief',
        status: 'open',
        urgency: 'normal',
        last_message_at: lastMessageAt,
        message_count: 0,
        brief_id: briefId,
        origin: 'concierge',
      })
      .select('id')
      .single()

    if (insertErr) {
      if (insertErr.code === PG_UNIQUE_VIOLATION) {
        const { data: raced } = await supabase
          .from('communication_threads')
          .select('id')
          .eq('brief_id', briefId)
          .single()
        if (!raced) throw new Error('thread insert hit 23505 but re-lookup empty')
        threadId = raced.id
      } else {
        throw insertErr
      }
    } else {
      threadId = created.id
      wasNewThread = true
    }
  }

  const sourceMessageId = `concierge:${briefId}:rev${revision}`
  const messageBody = brief.brief_summary || 'AI Concierge brief received (no summary captured).'
  const messageSnippet = messageBody.slice(0, 200)

  let inboxId = null
  let wasNewInbox = false

  const { data: existingInbox } = await supabase
    .from('communication_inbox')
    .select('id')
    .eq('channel', channel)
    .eq('source_message_id', sourceMessageId)
    .maybeSingle()

  if (existingInbox) {
    inboxId = existingInbox.id
  } else {
    const { data: insertedInbox, error: inboxErr } = await supabase
      .from('communication_inbox')
      .insert({
        thread_id: threadId,
        channel,
        source_message_id: sourceMessageId,
        sender_name: brief.visitor_name,
        sender_contact: contactInfo,
        message_body: messageBody,
        message_snippet: messageSnippet,
        subject: `AI Concierge brief (rev ${revision})`,
        // Mirrors lib/concierge/promote-brief-to-thread.ts: Concierge inbox
        // rows start at 'new' so the auto-draft poller skips them; operator
        // presses "Generate draft reply" to invoke /api/copilot/drafts.
        status: 'new',
        received_at: brief.received_at || brief.submitted_at || nowIso,
      })
      .select('id')
      .single()

    if (inboxErr) {
      if (inboxErr.code === PG_UNIQUE_VIOLATION) {
        const { data: raced } = await supabase
          .from('communication_inbox')
          .select('id')
          .eq('channel', channel)
          .eq('source_message_id', sourceMessageId)
          .maybeSingle()
        inboxId = raced?.id ?? null
      } else {
        throw inboxErr
      }
    } else {
      inboxId = insertedInbox.id
      wasNewInbox = true
    }
  }

  const { count } = await supabase
    .from('communication_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
  if (count !== null) {
    await supabase
      .from('communication_threads')
      .update({ message_count: count, updated_at: nowIso })
      .eq('id', threadId)
  }

  return { threadId, inboxId, wasNewThread, wasNewInbox }
}

// ---- main ----
async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // sanity: confirm the migration is applied
  const probe = await supabase.from('communication_threads').select('id, brief_id, origin').limit(1)
  if (probe.error) {
    console.error('Schema probe failed. Likely migration 20260626_concierge_to_copilot.sql is NOT applied yet.')
    console.error('Error:', probe.error.message)
    process.exit(2)
  }

  const conversationId = args['conversation-id'] || `phase0-test-${Date.now()}`
  const revision = parseInt(args.revision || '1', 10)

  console.log('--- Phase 0 fire ---')
  console.log('conversation_id:', conversationId)
  console.log('brief_revision: ', revision)

  // INSERT or UPDATE the brief (mimics ingestBrief outcomes).
  // We do the simplest mapping that exercises promoteBriefToThread.
  const briefRow = {
    conversation_id: conversationId,
    session_id: `phase0-session-${conversationId}`,
    brief_revision: revision,
    is_update: revision > 1,
    received_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    visitor_name: 'Phase 0 Test Visitor',
    visitor_email: `phase0+${conversationId}@example.com`,
    visitor_phone: '+201000000000',
    preferred_contact: 'email',
    brief_summary: `[PHASE 0 TEST] AI Concierge brief — Cairo + Luxor 5 nights, 2 adults, October dates. Revision ${revision}.`,
    review_status: 'needs_review',
    is_actionable: true,
    raw_payload: { _phase0: true, revision },
  }

  // Look up current brief by conversation_id
  const { data: existing } = await supabase
    .from('concierge_briefs')
    .select('id, brief_revision')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  let briefId
  let outcomeLabel
  if (!existing) {
    const { data: ins, error: insErr } = await supabase
      .from('concierge_briefs')
      .insert(briefRow)
      .select('id')
      .single()
    if (insErr) {
      console.error('concierge_briefs INSERT failed:', insErr.message)
      process.exit(3)
    }
    briefId = ins.id
    outcomeLabel = 'received (first)'
  } else if (existing.brief_revision === revision) {
    briefId = existing.id
    outcomeLabel = 'duplicate_ignored (replay)'
    console.log('Brief at this revision already current — exercising idempotent re-promotion.')
  } else if (revision > existing.brief_revision) {
    const { data: upd, error: updErr } = await supabase
      .from('concierge_briefs')
      .update(briefRow)
      .eq('conversation_id', conversationId)
      .lt('brief_revision', revision)
      .select('id')
      .maybeSingle()
    if (updErr) {
      console.error('concierge_briefs UPDATE failed:', updErr.message)
      process.exit(3)
    }
    briefId = (upd && upd.id) || existing.id
    outcomeLabel = 'updated (newer revision)'
  } else {
    briefId = existing.id
    outcomeLabel = 'older_revision_filed'
    console.log('Older revision — would NOT call promote in the real webhook path. Skipping promote.')
    process.exit(0)
  }

  console.log('brief_id:       ', briefId)
  console.log('outcome (mock): ', outcomeLabel)

  const promotion = await promoteBriefToThread(briefId, supabase)
  console.log('---')
  console.log('thread_id:      ', promotion.threadId)
  console.log('inbox_id:       ', promotion.inboxId)
  console.log('wasNewThread:   ', promotion.wasNewThread)
  console.log('wasNewInbox:    ', promotion.wasNewInbox)

  // Verification join
  const { data: joined } = await supabase
    .from('communication_threads')
    .select('id, brief_id, origin, channel, client_name, contact_info, message_count, last_message_at')
    .eq('brief_id', briefId)
  console.log('---')
  console.log('communication_threads row(s) for this brief:')
  console.log(JSON.stringify(joined, null, 2))

  const { data: inboxRows } = await supabase
    .from('communication_inbox')
    .select('id, channel, source_message_id, subject, status, received_at')
    .eq('thread_id', promotion.threadId)
    .order('received_at', { ascending: false })
  console.log('---')
  console.log('communication_inbox rows for this thread:')
  console.log(JSON.stringify(inboxRows, null, 2))

  console.log('---')
  console.log('Open /copilot in the app and look for the purple "Concierge" badge.')
  console.log('Conversation id for retry/revision tests:', conversationId)
}

main().catch((e) => {
  console.error('FATAL:', e?.message || e)
  process.exit(99)
})
