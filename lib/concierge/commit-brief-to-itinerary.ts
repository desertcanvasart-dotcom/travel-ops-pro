// ============================================
// CONCIERGE BRIEF → ITINERARY COMMIT
// ============================================
// Phase 1 — operator-triggered. Takes a Concierge-origin
// communication_threads row, finds its brief, and creates an itineraries
// row with the brief's structured fields populated and `thread_id` set
// so the provenance chain (thread → itinerary → booking) is queryable
// in a single JOIN.
//
// IDEMPOTENCY — both layers:
//   - DB:   partial UNIQUE INDEX idx_itineraries_thread_id_unique
//           (migrations/20260627_itinerary_thread_id.sql) — at most one
//           itinerary per thread.
//   - Code: find-by-thread-id BEFORE insert; on 23505 race, re-lookup.
//
// THE THREAD DECIDES THE COMPANY (DEFERRED_GATES.md G1). The itinerary is
// stamped with communication_threads.org_id — the company the lead came in
// to (NOT NULL since 20261204) — never with the operator's session. The
// caller (the commit route) checks the operator is a member of that company;
// the session is an access check, not an attribution.
//
// ITINERARY CODES. itinerary_code is unique, and the ITN-S-<year>-<nnn> code
// is random: a 23505 on insert is EITHER a concurrent commit of the same
// thread (the thread_id index) OR a code another itinerary already has. The
// re-lookup by thread tells them apart — a row there is the race's winner;
// none means the code collided, so we try again with a new code.
//
// PROVENANCE TO BRIEF IS TRANSITIVE.
//   itineraries.thread_id → communication_threads.id; brief reached via
//   thread.brief_id. See migration comment for rationale.
//
// PHASE 1 SCOPE — closes the chain. Does NOT generate a day-by-day plan
// here. The committed itinerary row has the brief's structured fields
// (client, dates, pax, trip name) so the operator can immediately open it
// in /itineraries/[id]/edit and use the existing MODEL_GENERATOR-backed
// AI tooling (lib/ai/prompt-builder.ts) to fill out days. We reuse that
// existing path rather than forking it.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { reassertClientId } from '@/lib/itineraries/reassert-client'
import { newItineraryCode } from '@/lib/itineraries/itinerary-code'

const PG_UNIQUE_VIOLATION = '23505'
const MAX_CODE_ATTEMPTS = 5
const FALLBACK_CURRENCY = 'EUR'

export interface CommitResult {
  /** The company the itinerary belongs to — the thread's. */
  orgId: string
  itineraryId: string
  itineraryCode: string
  tripName: string
  briefId: string | null
  wasNewItinerary: boolean
}

// Minimal shape we read from the Concierge brief. Maps 1:1 to columns on
// concierge_briefs (see migrations/20260608_concierge_briefs.sql).
interface ConciergeBrief {
  id: string
  client_id: string | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  language: string | null
  destinations: unknown // JSONB — array of strings or richer objects
  trip_length_days: number | null
  dates_specific: string | null // ISO date (start)
  dates_window: unknown // JSONB
  travelers_count: number | null
  brief_summary: string | null
}

function deriveTripName(brief: ConciergeBrief): string {
  // Best-effort label from destinations + length. Falls back gracefully.
  const dests = Array.isArray(brief.destinations) ? brief.destinations : []
  const destLabel = dests
    .map((d) => (typeof d === 'string' ? d : (d as { name?: string })?.name))
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')
  const nights = brief.trip_length_days ?? 0
  if (destLabel && nights > 0) return `${destLabel} — ${nights} day trip`
  if (destLabel) return `${destLabel} trip`
  if (nights > 0) return `${nights} day Egypt trip`
  return 'Egypt trip'
}

function deriveStartEnd(brief: ConciergeBrief): { start_date: string; end_date: string; total_days: number } {
  const days = brief.trip_length_days && brief.trip_length_days > 0 ? brief.trip_length_days : 7
  // start_date: dates_specific if present else today + 30 days (a plausible
  // placeholder the operator will edit). end_date: start + (days - 1).
  const start = brief.dates_specific
    ? new Date(brief.dates_specific)
    : (() => {
        const d = new Date()
        d.setUTCDate(d.getUTCDate() + 30)
        return d
      })()
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + Math.max(0, days - 1))
  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
    total_days: days,
  }
}

function generateItineraryCode(): string {
  // Mirror format from app/api/ai/generate-itinerary/route.ts:317.
  // 'S' = standard tier (briefs don't carry tier — operator tunes on edit).
  // 8 hex characters: 1000 codes a year clashed (AUDIT L8).
  return newItineraryCode('ITN-S')
}

export async function commitBriefToItinerary(
  threadId: string,
  supabase: SupabaseClient
): Promise<CommitResult> {
  // 1. Load the thread — must be Concierge-origin and carry a brief_id. Its
  //    org_id is the itinerary's company.
  const { data: thread, error: threadErr } = await supabase
    .from('communication_threads')
    .select('id, org_id, origin, brief_id, client_id, client_name')
    .eq('id', threadId)
    .maybeSingle()
  if (threadErr || !thread) {
    throw new Error(
      `[commit-brief] thread not found: ${threadId}${threadErr ? ` (${threadErr.message})` : ''}`
    )
  }
  if (thread.origin !== 'concierge') {
    throw new Error(
      `[commit-brief] thread ${threadId} has origin='${thread.origin}', expected 'concierge'`
    )
  }
  if (!thread.brief_id) {
    throw new Error(`[commit-brief] thread ${threadId} has no brief_id`)
  }
  if (!thread.org_id) {
    throw new Error(`[commit-brief] thread ${threadId} has no organisation`)
  }
  const orgId = thread.org_id as string

  // 2. Idempotency — return existing itinerary if one is already linked.
  const { data: existingItin } = await supabase
    .from('itineraries')
    .select('id, itinerary_code, trip_name')
    .eq('thread_id', threadId)
    .maybeSingle()
  if (existingItin) {
    return {
      orgId,
      itineraryId: existingItin.id as string,
      itineraryCode: existingItin.itinerary_code as string,
      tripName: existingItin.trip_name as string,
      briefId: thread.brief_id as string,
      wasNewItinerary: false,
    }
  }

  // 3. Load the brief — its structured fields populate the itinerary row.
  const { data: brief, error: briefErr } = await supabase
    .from('concierge_briefs')
    .select(
      'id, client_id, visitor_name, visitor_email, visitor_phone, language, destinations, trip_length_days, dates_specific, dates_window, travelers_count, brief_summary'
    )
    .eq('id', thread.brief_id)
    .maybeSingle()
  if (briefErr || !brief) {
    throw new Error(
      `[commit-brief] brief not found: ${thread.brief_id}${briefErr ? ` (${briefErr.message})` : ''}`
    )
  }
  const briefRow = brief as ConciergeBrief

  // The company's own currency (organizations.default_currency), not a
  // hard-coded EUR: ATS bills in JPY.
  const { data: org } = await supabase
    .from('organizations')
    .select('default_currency')
    .eq('id', orgId)
    .maybeSingle()
  const currency = (org?.default_currency as string | null | undefined) || FALLBACK_CURRENCY

  const tripName = deriveTripName(briefRow)
  const { start_date, end_date, total_days } = deriveStartEnd(briefRow)
  const numAdults = briefRow.travelers_count && briefRow.travelers_count > 0 ? briefRow.travelers_count : 2

  // 4. INSERT. A 23505 is a concurrent commit of this thread (re-lookup finds
  // the winner) or a taken itinerary code (re-lookup finds nothing: retry
  // with a new code).
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const { data: created, error: insertErr } = await supabase
      .from('itineraries')
      .insert({
        itinerary_code: generateItineraryCode(),
        org_id: orgId,
        thread_id: threadId,
        client_id: briefRow.client_id ?? thread.client_id ?? null,
        client_name: briefRow.visitor_name ?? thread.client_name ?? 'Unknown',
        client_email: briefRow.visitor_email ?? null,
        client_phone: briefRow.visitor_phone ?? null,
        trip_name: tripName,
        start_date,
        end_date,
        total_days,
        num_adults: numAdults,
        num_children: 0,
        currency,
        total_cost: 0,
        status: 'draft',
        // package_type and tier are intentionally not preset — the operator
        // picks them on the edit page where existing UI handles it.
        // source records the broad channel; thread_id is the precise pointer.
        source: 'b2c_concierge',
        notes: briefRow.brief_summary ?? null,
      })
      .select('id, itinerary_code, trip_name, client_id')
      .single()

    if (insertErr) {
      if (insertErr.code !== PG_UNIQUE_VIOLATION) throw insertErr
      const { data: raced } = await supabase
        .from('itineraries')
        .select('id, itinerary_code, trip_name')
        .eq('thread_id', threadId)
        .maybeSingle()
      if (raced) {
        return {
          orgId,
          itineraryId: raced.id as string,
          itineraryCode: raced.itinerary_code as string,
          tripName: raced.trip_name as string,
          briefId: thread.brief_id as string,
          wasNewItinerary: false,
        }
      }
      // The code was taken — another code.
      continue
    }

    // Prod drops client_id on INSERT — see lib/itineraries/reassert-client.ts
    await reassertClientId(
      supabase,
      created as { id: string; client_id?: string | null },
      briefRow.client_id ?? thread.client_id ?? null
    )

    return {
      orgId,
      itineraryId: (created as { id: string }).id,
      itineraryCode: (created as { itinerary_code: string }).itinerary_code,
      tripName: (created as { trip_name: string }).trip_name,
      briefId: thread.brief_id as string,
      wasNewItinerary: true,
    }
  }
  throw new Error(
    `[commit-brief] no free itinerary code after ${MAX_CODE_ATTEMPTS} attempts`
  )
}
