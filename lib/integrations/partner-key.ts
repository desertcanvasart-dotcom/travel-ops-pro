// ============================================
// Which partner connection a Bearer key belongs to
// ============================================
// Shared by the outbound partner API (/api/public/v1/*): the availability
// calendar and the seasons feed. The key we issued is matched against its
// stored SHA-256 hash (we never hold the plaintext). Unknown, disabled and
// inbound-only keys get one and the same answer, so a probe cannot tell
// whether a key exists.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearerToken, hashApiKey } from '@/lib/integrations/credentials'

export interface PartnerConnection {
  id: string
  org_id: string
}

export function partnerUnauthorized(message: string) {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="travel-ops-pro"' } }
  )
}

/** The connection the request's key opens, or the response to send instead. */
export async function partnerFromRequest(
  db: SupabaseClient,
  authorization: string | null,
  label: string,
): Promise<{ ok: true; integration: PartnerConnection } | { ok: false; response: NextResponse }> {
  const key = bearerToken(authorization)
  if (!key) return { ok: false, response: partnerUnauthorized('Missing API key. Send: Authorization: Bearer <key>') }

  const { data: integration, error } = await db
    .from('integrations')
    .select('id, org_id, direction, is_active')
    .eq('outbound_key_hash', hashApiKey(key))
    .maybeSingle()

  if (error) {
    // PGRST205 / 42P01 = no integrations table yet (an install before
    // 20260812_integrations_and_capacity): no key can be valid, so 401 — a
    // partner backs off a 401, where a 500 makes them retry.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      console.warn(`Partner ${label} API called before the integrations migration was applied`)
      return { ok: false, response: partnerUnauthorized('Invalid API key') }
    }
    console.error('Integration key lookup failed:', error)
    return { ok: false, response: NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 }) }
  }

  if (!integration || !integration.is_active || integration.direction === 'inbound') {
    return { ok: false, response: partnerUnauthorized('Invalid API key') }
  }
  return { ok: true, integration: { id: String(integration.id), org_id: String(integration.org_id) } }
}

/** Fire-and-forget: a failed bookkeeping write must not fail the partner's read. */
export function stampOutbound(db: SupabaseClient, integrationId: string): void {
  db.from('integrations')
    .update({ last_outbound_at: new Date().toISOString() })
    .eq('id', integrationId)
    .then(undefined, err => console.error('Could not stamp last_outbound_at:', err))
}
