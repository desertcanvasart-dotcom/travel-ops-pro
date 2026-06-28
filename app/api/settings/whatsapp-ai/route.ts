// ============================================
// GET  /api/settings/whatsapp-ai — read the org's WhatsApp-AI flag
// PUT  /api/settings/whatsapp-ai — toggle it (admin/manager only)
// ============================================
// Draft-gated feature flag: when enabled, operators can generate AI-suggested
// WhatsApp reply drafts. Nothing is ever sent automatically.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_request: NextRequest) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const { data, error } = await admin()
    .from('organizations')
    .select('whatsapp_ai_enabled')
    .eq('id', orgId)
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, enabled: (data as any)?.whatsapp_ai_enabled ?? false })
}

export async function PUT(request: NextRequest) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  // Only admins/managers can flip an org-wide feature flag.
  const denied = await requireRole(['admin', 'manager'])
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ success: false, error: 'enabled must be a boolean' }, { status: 400 })
  }

  const { error } = await admin()
    .from('organizations')
    .update({ whatsapp_ai_enabled: body.enabled })
    .eq('id', orgId)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, enabled: body.enabled })
}
