// ============================================
// CONCIERGE BRIEF — DB INTAKE (idempotent upsert + revision history)
// ============================================
// Writes a validated+mapped brief into Autoura:
//   1. find-or-create a clients prospect (by email, then phone)
//   2. upsert client_preferences + append a client_notes summary
//   3. upsert concierge_briefs (one current row per conversation_id)
//   4. append concierge_brief_revisions (idempotency + history)
//
// Idempotency & ordering (spec §5/§6):
//   - same (conversation_id, brief_revision) replay  -> 'duplicate_ignored' (200)
//   - newer revision                                 -> 'updated' (200), review re-opened
//   - older revision arriving late                   -> 'older_revision_filed' (200)
//   - first time                                     -> 'received' (201)
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MappedBrief } from './concierge-brief-schema'

export type IngestOutcome = 'received' | 'updated' | 'duplicate_ignored' | 'older_revision_filed'

export interface IngestResult {
  outcome: IngestOutcome
  httpStatus: number          // 201 for received, 200 otherwise
  briefId: string
  conversationId: string
  clientId: string | null
  reviewStatus: string
  briefRevision: number
}

interface IngestMeta {
  requestId: string | null
  rawPayload: unknown
}

const PG_UNIQUE_VIOLATION = '23505'

// ---- clients ----
async function findOrCreateClient(mapped: MappedBrief, supabase: SupabaseClient): Promise<string | null> {
  const { email, phone } = mapped.clientMatch

  if (email) {
    const { data } = await supabase.from('clients').select('id').eq('email', email).limit(1).maybeSingle()
    if (data?.id) return data.id
  }
  if (phone) {
    const { data } = await supabase.from('clients').select('id').eq('phone', phone).limit(1).maybeSingle()
    if (data?.id) return data.id
  }

  const { data: created, error } = await supabase
    .from('clients')
    .insert(mapped.client)
    .select('id')
    .single()

  if (error) {
    console.error('[concierge] client insert failed:', error.message)
    return null
  }
  return created.id
}

async function upsertClientPreferences(clientId: string, mapped: MappedBrief, supabase: SupabaseClient): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('client_preferences')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle()

    if (existing) {
      // Update only the concierge-derived fields; don't clobber any
      // accommodation/pace a human may have set.
      await supabase
        .from('client_preferences')
        .update({
          interests: mapped.preferences.interests,
          special_needs: mapped.preferences.special_needs,
          preferred_tier: mapped.preferences.preferred_tier,
        })
        .eq('client_id', clientId)
    } else {
      await supabase.from('client_preferences').insert({
        client_id: clientId,
        preferred_accommodation_type: '3-star',
        tour_pace_preference: 'moderate',
        interests: mapped.preferences.interests,
        special_needs: mapped.preferences.special_needs,
        preferred_tier: mapped.preferences.preferred_tier,
      })
    }
  } catch (e) {
    console.warn('[concierge] could not save client_preferences (non-blocking):', e)
  }
}

async function addBriefNote(clientId: string, summary: string | null, revision: number, supabase: SupabaseClient): Promise<void> {
  if (!summary) return
  try {
    await supabase.from('client_notes').insert({
      client_id: clientId,
      note_text: `[Concierge brief — revision ${revision}] ${summary}`,
      note_type: 'general',
      is_internal: true,
    })
  } catch (e) {
    console.warn('[concierge] could not save client_notes (non-blocking):', e)
  }
}

// ---- revision history ----
async function insertRevision(
  briefId: string,
  conversationId: string,
  revision: number,
  isUpdate: boolean,
  meta: IngestMeta,
  supabase: SupabaseClient
): Promise<'inserted' | 'duplicate'> {
  const { error } = await supabase.from('concierge_brief_revisions').insert({
    brief_id: briefId,
    conversation_id: conversationId,
    brief_revision: revision,
    is_update: isUpdate,
    payload: meta.rawPayload,
    request_id: meta.requestId,
  })
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return 'duplicate'
    throw error
  }
  return 'inserted'
}

// ---- main entry ----
export async function ingestBrief(
  mapped: MappedBrief,
  meta: IngestMeta,
  supabase: SupabaseClient
): Promise<IngestResult> {
  const conversationId = String(mapped.briefRow.conversation_id)
  const incomingRevision = mapped.briefRevision

  // 1. Client (find-or-create). Best-effort: a brief is still stored even
  //    if the client write fails, so we never lose a lead.
  const clientId = await findOrCreateClient(mapped, supabase)

  // 2. Look up the current brief row for this conversation.
  const { data: current } = await supabase
    .from('concierge_briefs')
    .select('id, brief_revision')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  // ---- FIRST TIME: no current row ----
  if (!current) {
    const insertRow = {
      ...mapped.briefRow,
      client_id: clientId,
      request_id: meta.requestId,
      raw_payload: meta.rawPayload,
    }
    const { data: inserted, error } = await supabase
      .from('concierge_briefs')
      .insert(insertRow)
      .select('id, review_status')
      .single()

    if (error && error.code === PG_UNIQUE_VIOLATION) {
      // Race: another request created it first. Re-run as an existing-row case.
      return ingestBrief(mapped, meta, supabase)
    }
    if (error) throw error

    await insertRevision(inserted.id, conversationId, incomingRevision, !!mapped.briefRow.is_update, meta, supabase)
    if (clientId) {
      await upsertClientPreferences(clientId, mapped, supabase)
      await addBriefNote(clientId, mapped.note, incomingRevision, supabase)
    }
    return {
      outcome: 'received', httpStatus: 201, briefId: inserted.id,
      conversationId, clientId, reviewStatus: inserted.review_status, briefRevision: incomingRevision,
    }
  }

  const briefId = current.id as string
  const currentRevision = current.brief_revision as number

  // ---- EXACT REPLAY: same revision already current ----
  if (incomingRevision === currentRevision) {
    return {
      outcome: 'duplicate_ignored', httpStatus: 200, briefId,
      conversationId, clientId, reviewStatus: 'needs_review', briefRevision: incomingRevision,
    }
  }

  // ---- NEWER REVISION: update in place, re-open for review ----
  if (incomingRevision > currentRevision) {
    const updateRow = {
      ...mapped.briefRow,
      is_update: true,
      client_id: clientId,
      request_id: meta.requestId,
      raw_payload: meta.rawPayload,
      review_status: 'needs_review',   // owner decision #6: revision re-opens the lead
    }
    // Monotonic guard: only advances if still strictly newer than what's stored.
    const { data: updated } = await supabase
      .from('concierge_briefs')
      .update(updateRow)
      .eq('conversation_id', conversationId)
      .lt('brief_revision', incomingRevision)
      .select('id, review_status')
      .maybeSingle()

    await insertRevision(briefId, conversationId, incomingRevision, true, meta, supabase)
    if (clientId) {
      await upsertClientPreferences(clientId, mapped, supabase)
      await addBriefNote(clientId, mapped.note, incomingRevision, supabase)
    }
    return {
      outcome: 'updated', httpStatus: 200, briefId,
      conversationId, clientId,
      reviewStatus: updated?.review_status ?? 'needs_review', briefRevision: incomingRevision,
    }
  }

  // ---- OLDER REVISION arriving late: file into history, keep current ----
  const filed = await insertRevision(briefId, conversationId, incomingRevision, !!mapped.briefRow.is_update, meta, supabase)
  return {
    outcome: filed === 'duplicate' ? 'duplicate_ignored' : 'older_revision_filed',
    httpStatus: 200, briefId, conversationId, clientId,
    reviewStatus: 'needs_review', briefRevision: incomingRevision,
  }
}
