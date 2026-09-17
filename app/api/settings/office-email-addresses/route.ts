// ============================================
// Settings → Email → Office addresses
// ============================================
// GET  the organisation's listed addresses/domains, plus what the rule already
//      covers without being listed (the connected mailbox and its domain)
// PUT  { addresses: string[] } — replace the list, then re-classify stored mail
//      from those addresses as our replies (lib/email/office-addresses-server)
// Owner/admin/manager.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { normaliseOfficeEntry, officeRule } from '@/lib/email/office-addresses'
import { applyOfficeRule, loadOfficeRule } from '@/lib/email/office-addresses-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const forbidden = await requireRole(['admin', 'manager'])
  if (forbidden) return forbidden
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const db = createServerClient()
  const [{ data: org, error }, { data: tokens }] = await Promise.all([
    db.from('organizations').select('office_email_addresses').eq('id', orgId).maybeSingle(),
    db.from('gmail_tokens').select('email'),
  ])
  if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load office addresses') }, { status: 500 })
  const automatic = officeRule(((tokens ?? []) as { email: string | null }[]).map(t => t.email || '').filter(Boolean), [])
  return NextResponse.json({ success: true, addresses: org?.office_email_addresses ?? [], automatic })
}

export async function PUT(request: NextRequest) {
  const forbidden = await requireRole(['admin', 'manager'])
  if (forbidden) return forbidden
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const body = await request.json().catch(() => ({})) as { addresses?: unknown }
  if (!Array.isArray(body.addresses)) return NextResponse.json({ success: false, error: 'addresses must be a list' }, { status: 400 })
  const invalid: string[] = []
  const addresses: string[] = []
  for (const raw of body.addresses) {
    const n = normaliseOfficeEntry(String(raw ?? ''))
    if (n === null) { if (String(raw ?? '').trim()) invalid.push(String(raw)); continue }
    if (!addresses.includes(n)) addresses.push(n)
  }
  if (invalid.length) {
    return NextResponse.json({ success: false, error: `Not an email address or domain: ${invalid.join(', ')}` }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db.from('organizations').update({ office_email_addresses: addresses, updated_at: new Date().toISOString() }).eq('id', orgId)
  if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save office addresses') }, { status: 500 })

  try {
    const changed = await applyOfficeRule(db, await loadOfficeRule(db))
    return NextResponse.json({ success: true, addresses, reclassified: changed })
  } catch (e) {
    // Saved; the scheduled sync re-applies the rule on its next run.
    console.error('[office-email-addresses] re-classify failed:', e)
    return NextResponse.json({ success: true, addresses, reclassified: null })
  }
}
