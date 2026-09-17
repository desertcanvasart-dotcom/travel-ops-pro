// ============================================
// POST /api/email/leads/dismiss — "Not a lead"
// ============================================
// { conversationId } — the email made a Lead automatically
// (lib/email/email-leads) is not someone asking to travel. The lead is removed
// from Clients, the conversation is unlinked, and the sender is remembered so
// their next email is not made a lead again.
//
// Only a lead this feature created (status 'lead', lead_source 'email') and
// only while nothing hangs off it: an itinerary, a quote, an invoice or a
// WhatsApp conversation means somebody has worked with it — that is refused,
// and the operator changes it in Clients instead.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { bareAddress } from '@/lib/email/office-addresses'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const forbidden = await requireRole(['admin', 'manager', 'agent'])
  if (forbidden) return forbidden
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const { conversationId } = await request.json().catch(() => ({})) as { conversationId?: string }
  if (!conversationId) return NextResponse.json({ success: false, error: 'conversationId is required' }, { status: 400 })

  const db = createServerClient()
  try {
    const { data: conv } = await db.from('email_conversations').select('id, client_id').eq('id', conversationId).maybeSingle()
    if (!conv?.client_id) return NextResponse.json({ success: false, error: 'This conversation has no lead' }, { status: 404 })

    const { data: client } = await db.from('clients').select('id, email, status, lead_source').eq('id', conv.client_id).eq('org_id', orgId).maybeSingle()
    if (!client) return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    if (client.status !== 'lead' || client.lead_source !== 'email') {
      return NextResponse.json({ success: false, error: 'Only a lead created from an email can be dismissed here. Change this client in Clients.' }, { status: 409 })
    }

    const inUse = await Promise.all([
      db.from('itineraries').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
      db.from('b2c_quotes').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
      db.from('invoices').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
      db.from('whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
    ])
    if (inUse.some(r => (r.count ?? 0) > 0)) {
      return NextResponse.json({ success: false, error: 'This lead already has an itinerary, quote, invoice or WhatsApp conversation. Change it in Clients instead.' }, { status: 409 })
    }

    const email = bareAddress(client.email)
    if (email) {
      await db.from('email_lead_dismissals').upsert({ org_id: orgId, email, dismissed_by: await getCurrentUserId() }, { onConflict: 'org_id,email' })
    }
    const { error: unlinkErr } = await db.from('email_conversations')
      .update({ client_id: null, client_name: null, lead_check: 'dismissed' })
      .eq('client_id', client.id)
    if (unlinkErr) throw unlinkErr
    const { error: delErr } = await db.from('clients').delete().eq('id', client.id).eq('org_id', orgId)
    if (delErr) throw delErr

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[email-leads] dismiss failed:', e)
    return NextResponse.json({ success: false, error: clientMessage(e, 'Could not dismiss the lead') }, { status: 500 })
  }
}
