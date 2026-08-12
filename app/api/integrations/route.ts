// ============================================
// API: /api/integrations — manage partner connections
// ============================================
// Operator-facing CRUD for the connections themselves. Secrets are write-only
// through this surface: the outbound key is returned exactly once, at creation,
// and the inbound signing secret is never echoed back in a list.

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { requireRole } from '@/lib/auth/current-org'
import { generateEndpointToken, generateInboundSecret, issueApiKey } from '@/lib/integrations/credentials'
import { getAdapter, listAdapters } from '@/lib/integrations/registry'
import { clientMessage } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'

// Never includes inbound_secret or outbound_key_hash — only the non-reversible
// prefix, so the UI can say WHICH key is installed.
const SAFE_COLUMNS =
  'id, provider, name, direction, is_active, settings, endpoint_token, outbound_key_prefix, outbound_key_issued_at, last_inbound_at, last_outbound_at, created_at, updated_at'

export async function GET() {
  try {
    const auth = await orgAuth()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, org_id } = auth
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('integrations')
      .select(SAFE_COLUMNS)
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error listing integrations:', error)
      return NextResponse.json({ success: false, error: 'Failed to list integrations' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      // The provider picker is driven by the adapter registry, so a newly added
      // adapter appears in the UI without a second place to update.
      providers: listAdapters(),
    })
  } catch (error) {
    console.error('Integrations GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST — create a connection and mint its credentials.
 *
 * The outbound key is returned ONCE here and never again. That is the point of
 * storing only a hash, so the response says so explicitly rather than leaving
 * an operator to discover it when they come back for it.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, org_id, user } = auth
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    // Creating a connection mints credentials that read this org's calendar and
    // write its departures. That is an admin action, and the middleware's
    // prefix-based role gate does not cover this path.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const body = await request.json().catch(() => ({}))
    const provider = String(body.provider || '').trim().toLowerCase()
    const name = String(body.name || '').trim()
    const direction = String(body.direction || 'both')

    if (!provider) {
      return NextResponse.json({ success: false, error: 'provider is required' }, { status: 400 })
    }
    if (!getAdapter(provider)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown provider "${provider}". Available: ${listAdapters().map(a => a.slug).join(', ')}`,
        },
        { status: 400 }
      )
    }
    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
    }
    if (!['inbound', 'outbound', 'both'].includes(direction)) {
      return NextResponse.json(
        { success: false, error: 'direction must be inbound, outbound or both' },
        { status: 400 }
      )
    }

    const needsInbound = direction !== 'outbound'
    const needsOutbound = direction !== 'inbound'

    const apiKey = needsOutbound ? issueApiKey() : null
    const inboundSecret = needsInbound ? generateInboundSecret() : null
    // Routes this partner's deliveries. Safe to show and to re-show — it is an
    // identifier, not a credential; the signature is what authenticates.
    const endpointToken = needsInbound ? generateEndpointToken() : null

    const { data, error } = await supabase
      .from('integrations')
      .insert({
        org_id,
        provider,
        name,
        direction,
        settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
        inbound_secret: inboundSecret,
        endpoint_token: endpointToken,
        outbound_key_hash: apiKey?.hash ?? null,
        outbound_key_prefix: apiKey?.prefix ?? null,
        outbound_key_issued_at: apiKey ? new Date().toISOString() : null,
        created_by: user?.id ?? null,
      })
      .select(SAFE_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: `A "${provider}" connection already exists for this organization.` },
          { status: 409 }
        )
      }
      console.error('Error creating integration:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Failed to create the integration') },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data,
        // Both secrets, shown once. The key genuinely cannot be recovered; the
        // inbound secret could be, but is treated the same way so an operator
        // learns one habit rather than two.
        credentials: {
          api_key: apiKey?.plaintext ?? null,
          inbound_secret: inboundSecret,
          notice:
            'Copy these now — the API key is stored only as a hash and cannot be shown again. Losing it means rotating.',
        },
        // The FULL url, not just the token: handing a partner a path to
        // assemble themselves is how an integration ends up pointed at the
        // wrong host. Safe to show again later — it routes, it does not
        // authenticate.
        webhook_url: endpointToken
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'}/api/webhooks/integrations/${endpointToken}`
          : null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Integrations POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
