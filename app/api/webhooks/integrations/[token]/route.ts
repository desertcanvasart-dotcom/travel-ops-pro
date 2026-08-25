// ============================================
// API: POST /api/webhooks/integrations/[token] — inbound departures mirror
// ============================================
// A partner platform POSTs their departures here. Lives under /api/webhooks/ so
// middleware skips the session lookup — this call has no user, and
// authenticates itself with an HMAC signature over the raw body.
//
// The URL carries a PER-CONNECTION opaque token, not our org id. A partner
// should never hold an internal identifier: the org id is identical across
// every connection, it ends up in their logs and config, and it invites probing
// other endpoints with it. The token routes only — the signature authenticates
// — and revoking one partner's endpoint leaves every other partner untouched.
//
// ORDER MATTERS and is not arbitrary:
//   1. read the RAW body (a re-serialized JSON body signs differently)
//   2. resolve the connection from the URL token alone
//   3. verify the signature BEFORE parsing or trusting anything in the body
//   4. record the delivery (idempotency claim) BEFORE applying it
//   5. normalize, plan, write
//
// Anything that reads the body as data before step 3 is treating an unverified
// stranger's payload as trusted input.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAdapter } from '@/lib/integrations/registry'
import { verifyWebhookSignature } from '@/lib/integrations/credentials'
import { planDepartureSync, type ExistingDeparture } from '@/lib/integrations/departure-sync'
import { IntegrationError } from '@/lib/integrations/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/** Reject a signature older than this, when the partner sends a timestamp. */
const SIGNATURE_TOLERANCE_SECONDS = 300

/** Refuse absurd payloads before doing any work on them. */
const MAX_DEPARTURES_PER_DELIVERY = 2000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // 0. Reject an oversized body BEFORE buffering it. request.text() reads the
  //    whole stream into memory; an unbounded delivery is a cheap DoS. 1 MiB is
  //    far above a legitimate departures batch.
  const declaredLen = Number(request.headers.get('content-length') || '0')
  if (declaredLen > 1_048_576) {
    return NextResponse.json({ success: false, error: 'Request body too large' }, { status: 413 })
  }

  // 1. RAW body first. JSON.parse → JSON.stringify reorders keys and drops
  //    whitespace, producing a different digest than the partner signed.
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ success: false, error: 'Could not read request body' }, { status: 400 })
  }
  // Also cap the ACTUAL size — content-length can lie or be absent.
  if (rawBody.length > 1_048_576) {
    return NextResponse.json({ success: false, error: 'Request body too large' }, { status: 413 })
  }

  // 2. Resolve the connection from the token alone. The org comes from the row,
  //    never from the caller — a partner cannot address another tenant even by
  //    guessing, because there is nothing in the request to guess WITH.
  const { data: integration, error: lookupError } = await supabaseAdmin
    .from('integrations')
    .select('id, org_id, provider, direction, is_active, inbound_secret, settings')
    .eq('endpoint_token', token)
    .maybeSingle()

  if (lookupError) {
    // The integrations table is absent when this deploy landed before the
    // migration. No table means no endpoint can be valid — 404, not 500.
    if (lookupError.code === 'PGRST205' || lookupError.code === '42P01') {
      console.warn('Integration webhook called before the integrations migration was applied')
      return NextResponse.json({ success: false, error: 'Integration not found' }, { status: 404 })
    }
    console.error('Integration lookup failed:', lookupError)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  // One answer for "no such token": anything more specific would let a caller
  // enumerate which endpoints exist.
  if (!integration) {
    return NextResponse.json({ success: false, error: 'Integration not found' }, { status: 404 })
  }
  if (!integration.is_active) {
    return NextResponse.json({ success: false, error: 'Integration is disabled' }, { status: 403 })
  }
  if (integration.direction === 'outbound') {
    return NextResponse.json(
      { success: false, error: 'This integration is configured as outbound only' },
      { status: 403 }
    )
  }

  // 3. Verify BEFORE trusting the body.
  const signature =
    request.headers.get('x-tops-signature') ||
    request.headers.get('x-signature') ||
    request.headers.get('x-hub-signature-256')
  const timestamp = request.headers.get('x-tops-timestamp') || request.headers.get('x-timestamp')

  const check = verifyWebhookSignature(rawBody, signature, integration.inbound_secret, {
    timestamp,
    toleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
  })
  if (!check.valid) {
    // Logged with the integration id but WITHOUT the body: an unverified
    // payload is attacker-controlled and does not belong in our logs.
    console.warn(`Rejected webhook for integration ${integration.id}: ${check.reason}`)
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ success: false, error: 'Body is not valid JSON' }, { status: 400 })
  }

  // 4. Normalize through the partner's adapter.
  const { adapter, fellBack } = resolveAdapter(integration.provider)
  let normalized
  try {
    normalized = adapter.normalizeInbound(parsed, (integration.settings || {}) as Record<string, unknown>)
  } catch (err) {
    const status = err instanceof IntegrationError ? err.status : 400
    const message = err instanceof Error ? err.message : 'Could not read the payload'
    await recordEvent(integration, null, 'failed', { error: message })
    return NextResponse.json({ success: false, error: message }, { status })
  }

  const { delivery, issues } = normalized

  if (delivery.departures.length > MAX_DEPARTURES_PER_DELIVERY) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many departures in one delivery (${delivery.departures.length}, max ${MAX_DEPARTURES_PER_DELIVERY}). Page your sync.`,
      },
      { status: 413 }
    )
  }

  // 5. Claim the delivery. The unique index on (integration_id,
  //    external_event_id) is the real guard — partners retry on timeout, and
  //    without this a retry mirrors everything twice. A duplicate is a SUCCESS
  //    from the partner's point of view: their delivery is already applied, and
  //    answering 4xx would make them retry forever.
  const eventInsert = await supabaseAdmin
    .from('integration_events')
    .insert({
      org_id: integration.org_id,
      integration_id: integration.id,
      direction: 'inbound',
      event_type: delivery.event_type,
      external_event_id: delivery.event_id,
      status: 'received',
      payload: parsed,
    })
    .select('id')
    .single()

  if (eventInsert.error) {
    if (eventInsert.error.code === '23505') {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'This delivery was already processed.',
        event_id: delivery.event_id,
      })
    }
    console.error('Could not record integration event:', eventInsert.error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  const eventRowId = eventInsert.data.id

  try {
    const externalIds = delivery.departures.map(d => d.external_id)

    // Fetch by external_id (not just by our integration) so a collision with a
    // LOCAL departure is caught by the planner and reported, instead of blowing
    // up as a unique-constraint error part-way through the write.
    let existing: ExistingDeparture[] = []
    if (externalIds.length) {
      const { data, error } = await supabaseAdmin
        .from('tour_departures')
        .select('id, external_id, source_integration_id, externally_managed, booked_pax, max_pax, status')
        .eq('org_id', integration.org_id)
        .in('external_id', externalIds)
      if (error) throw error
      existing = (data || []) as ExistingDeparture[]
    }

    const syncedAt = new Date().toISOString()
    const plan = planDepartureSync(delivery.departures, existing, {
      orgId: integration.org_id,
      integrationId: integration.id,
      syncedAt,
    })

    if (plan.inserts.length) {
      const { error } = await supabaseAdmin
        .from('tour_departures')
        .insert(plan.inserts.map(i => i.values))
      if (error) throw error
    }

    for (const update of plan.updates) {
      const { error } = await supabaseAdmin
        .from('tour_departures')
        .update(update.values)
        .eq('id', update.id!)
        // Belt and braces: only ever write a row this integration owns.
        .eq('source_integration_id', integration.id)
      if (error) throw error
    }

    // Refresh the sync stamp on rows that were already current, so "last seen"
    // reflects the partner still reporting them.
    if (plan.unchanged.length) {
      await supabaseAdmin
        .from('tour_departures')
        .update({ external_synced_at: syncedAt })
        .eq('source_integration_id', integration.id)
        .in('external_id', plan.unchanged)
    }

    const result = {
      created: plan.inserts.length,
      updated: plan.updates.length,
      unchanged: plan.unchanged.length,
      conflicts: plan.conflicts,
      rejected: issues,
      adapter: adapter.slug,
      adapter_fallback: fellBack,
    }

    await supabaseAdmin
      .from('integration_events')
      .update({ status: 'processed', result, processed_at: syncedAt })
      .eq('id', eventRowId)

    await supabaseAdmin
      .from('integrations')
      .update({ last_inbound_at: syncedAt })
      .eq('id', integration.id)

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error(`Departure sync failed for integration ${integration.id}:`, err)

    await supabaseAdmin
      .from('integration_events')
      .update({ status: 'failed', error: message, processed_at: new Date().toISOString() })
      .eq('id', eventRowId)

    // 500, so the partner retries. The event row keeps its external_event_id,
    // and a retry that arrives after a PARTIAL write is still safe: the plan is
    // recomputed against current rows, so already-written departures become
    // updates rather than duplicates.
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 })
  }
}

async function recordEvent(
  integration: { id: string; org_id: string },
  externalEventId: string | null,
  status: string,
  extra: Record<string, unknown>
) {
  await supabaseAdmin.from('integration_events').insert({
    org_id: integration.org_id,
    integration_id: integration.id,
    direction: 'inbound',
    event_type: 'departures.sync',
    external_event_id: externalEventId,
    status,
    error: typeof extra.error === 'string' ? extra.error : null,
    processed_at: new Date().toISOString(),
  })
}
