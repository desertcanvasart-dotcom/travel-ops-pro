// ============================================
// GET /api/intake/web-orders — the website's orders, as taken in
// ============================================
// What the scheduled intake (lib/intake/web-order-intake.ts) made of each
// website order email: a quote, a duplicate of one, or "needs attention" and
// why. The office's list on /intake/order.
//
//   ?messageId=<Gmail message id>  the one order that email became (the inbox
//                                  asks, so a taken-in order opens its quote
//                                  instead of being read a second time)
//   ?open=1                        only what still needs attention
import { NextRequest, NextResponse } from 'next/server'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabase = createActorAdminClient()

const COLUMNS = 'id, received_at, subject, outcome, reason, tour_code, travel_date, customer_email, customer_name, client_id, quote_id, departure_booking_id, resolved_at, created_at, quote:tour_quotes(id, quote_number, status), client:clients(id, first_name, last_name)'

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const params = request.nextUrl.searchParams

    const gmailId = params.get('messageId')
    if (gmailId) {
      const { data: msg } = await supabase.from('email_messages').select('id').eq('message_id', gmailId).limit(1).maybeSingle()
      if (!msg) return NextResponse.json({ success: true, intake: null })
      const { data, error } = await supabase.from('web_order_intakes').select(COLUMNS)
        .eq('org_id', orgId).eq('email_message_id', msg.id).maybeSingle()
      if (error) throw error
      return NextResponse.json({ success: true, intake: data ?? null })
    }

    let query = supabase.from('web_order_intakes').select(COLUMNS).eq('org_id', orgId)
    if (params.get('open') === '1') query = query.eq('outcome', 'needs_attention').is('resolved_at', null)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    return NextResponse.json({ success: true, intakes: data ?? [] })
  } catch (err) {
    console.error('[intake/web-orders]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
