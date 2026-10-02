// ============================================
// /api/intake/web-orders/[id] — one website order as taken in
// ============================================
// GET   the order, with the email's text — /intake/order?intake=<id> loads it
//       to finish by hand what the scheduled intake could not.
// PATCH { action: 'dismiss' } — the office dealt with it another way (not a
//       real order, a test, handled by phone): it leaves the open list.
//       Finishing it as a quote happens through /api/intake/order-form with
//       this id, which records the quote here.
import { NextRequest, NextResponse } from 'next/server'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'

const supabase = createActorAdminClient()

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const { data, error } = await supabase.from('web_order_intakes')
      .select('id, received_at, subject, outcome, reason, tour_code, travel_date, customer_email, customer_name, order_text, client_id, quote_id, resolved_at')
      .eq('org_id', orgId).eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, intake: data })
  } catch (err) {
    console.error('[intake/web-orders/:id]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    if (body?.action !== 'dismiss') {
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
    }
    const { data, error } = await supabase.from('web_order_intakes')
      .update({ resolved_at: new Date().toISOString(), resolved_by: await getCurrentUserId(), reason: 'Dismissed by the office' })
      .eq('org_id', orgId).eq('id', id).eq('outcome', 'needs_attention')
      .select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Not found or not open' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[intake/web-orders/:id]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
