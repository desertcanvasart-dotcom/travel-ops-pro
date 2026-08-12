// ============================================
// API: /api/integrations/[id] — update, rotate, disconnect
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { requireRole } from '@/lib/auth/current-org'
import { generateInboundSecret, issueApiKey } from '@/lib/integrations/credentials'
import { clientMessage } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'

const SAFE_COLUMNS =
  'id, provider, name, direction, is_active, settings, outbound_key_prefix, outbound_key_issued_at, last_inbound_at, last_outbound_at, created_at, updated_at'

/**
 * PATCH — edit a connection, and optionally rotate its credentials.
 *
 * `provider` is intentionally NOT editable: it decides which adapter parses a
 * partner's payloads, and changing it under a live connection would silently
 * start misreading their data. Disconnect and create a new one instead.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await orgAuth()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, org_id } = auth
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const updates: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
    if (body.settings && typeof body.settings === 'object') updates.settings = body.settings
    if (typeof body.direction === 'string') {
      if (!['inbound', 'outbound', 'both'].includes(body.direction)) {
        return NextResponse.json(
          { success: false, error: 'direction must be inbound, outbound or both' },
          { status: 400 }
        )
      }
      updates.direction = body.direction
    }

    // Rotation mints a new credential and invalidates the old one immediately.
    // There is no grace period on purpose: the reason to rotate is usually that
    // the old key leaked, and a key that keeps working for an hour after you
    // revoked it is not revoked.
    const credentials: Record<string, string | null> = {}
    if (body.rotate_api_key === true) {
      const key = issueApiKey()
      updates.outbound_key_hash = key.hash
      updates.outbound_key_prefix = key.prefix
      updates.outbound_key_issued_at = new Date().toISOString()
      credentials.api_key = key.plaintext
    }
    if (body.rotate_inbound_secret === true) {
      const secret = generateInboundSecret()
      updates.inbound_secret = secret
      credentials.inbound_secret = secret
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('integrations')
      .update(updates)
      .eq('id', id)
      .eq('org_id', org_id)
      .select(SAFE_COLUMNS)
      .single()

    if (error) {
      console.error('Error updating integration:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Failed to update the integration') },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'Integration not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data,
      ...(Object.keys(credentials).length
        ? {
            credentials: {
              ...credentials,
              notice:
                'The previous credential stopped working the moment this was issued. Copy this now — it cannot be shown again.',
            },
          }
        : {}),
    })
  } catch (error) {
    console.error('Integration PATCH error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE — disconnect.
 *
 * Mirrored departures are NOT deleted. They are real trips that may already
 * have bookings against them; the FK is ON DELETE SET NULL so they survive as
 * orphaned rows, and they keep externally_managed=true so nothing starts
 * silently treating a stale mirror as a locally-maintained departure.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await orgAuth()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, org_id } = auth
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params

    const { count } = await supabase
      .from('tour_departures')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('source_integration_id', id)

    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('id', id)
      .eq('org_id', org_id)

    if (error) {
      console.error('Error deleting integration:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Failed to disconnect') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      orphaned_departures: count ?? 0,
      message:
        count
          ? `Disconnected. ${count} mirrored departure${count === 1 ? '' : 's'} were kept — they may already have bookings — and will no longer receive updates.`
          : 'Disconnected.',
    })
  } catch (error) {
    console.error('Integration DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
