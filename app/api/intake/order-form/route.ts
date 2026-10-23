// ============================================
// POST /api/intake/order-form  { text, dryRun? }
// ============================================
// The operator's door into the order intake: the tour-up.jp order email (or
// anything in that label-and-value shape) pasted on /intake/order → the
// programme it names, priced for that party on that date, as ONE draft quote
// plus the client, found by email or created. The conversational parser is
// for conversations; this is a form, read label by label
// (lib/intake/tour-up-order.ts). The writes — and the customer's own door,
// /api/public/order-form — live in lib/intake/process-order.ts.
//
// dryRun answers what WOULD happen and writes nothing. `intakeId` names the
// website order (web_order_intakes) this finishes by hand: its quote is
// recorded there and it leaves the "needs attention" list.
import { NextRequest, NextResponse } from 'next/server'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { parseTourUpOrder } from '@/lib/intake/tour-up-order'
import { processTourUpOrder } from '@/lib/intake/process-order'

const supabase = createActorAdminClient()

export async function POST(request: NextRequest) {
  try {
    const { text, dryRun = false, intakeId } = await request.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 })
    }
    const order = parseTourUpOrder(text)
    if (!order) {
      return NextResponse.json({ success: false, error: 'This does not read as the order form (tour code and departure date not found).' }, { status: 422 })
    }
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const userId = await getCurrentUserId()
    // Finishing a website order: only one that is still open. Opening an
    // already-quoted order's link again and confirming made a SECOND quote,
    // client hold and seat hold, and repointed the order at the new quote —
    // the first one dropped out of the list. Open means: needing attention
    // and not dismissed, or quoted once but its quote since deleted (the
    // order was stuck as finished with nothing behind it).
    const finishing = dryRun !== true && typeof intakeId === 'string' && intakeId ? intakeId : null
    let finishingOutcome: string | null = null
    if (finishing) {
      const { data: row } = await supabase.from('web_order_intakes').select('id, outcome, resolved_at, quote_id')
        .eq('org_id', orgId).eq('id', finishing).maybeSingle()
      const open = row && intakeIsOpen(row)
      finishingOutcome = open ? row.outcome : null
      if (!open) {
        return NextResponse.json({ success: false, error: 'This website order is already finished (a quote was made from it, or it was dismissed). Open it from the list to see its quote.' }, { status: 409 })
      }
    }
    const result = await processTourUpOrder(supabase, {
      orgId,
      userId,
      order,
      dryRun: dryRun === true,
    })
    const quote = result.body.quote
    if (finishing && quote) {
      const { error } = await supabase.from('web_order_intakes').update({
        outcome: 'quote_created',
        reason: null,
        quote_id: quote.id,
        client_id: (result.body.client as { id?: string } | null | undefined)?.id ?? null,
        departure_booking_id: result.body.departureBooking?.id ?? null,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      }).eq('org_id', orgId).eq('id', finishing).eq('outcome', finishingOutcome).is('quote_id', null)
      if (error) console.error('[intake/order-form] intake not updated:', error)
    }
    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('[intake/order-form]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/** Can this website order still be finished by hand? (see the guard above) */
function intakeIsOpen(row: { outcome: string; resolved_at: string | null; quote_id: string | null }): boolean {
  if (row.quote_id) return false
  if (row.outcome === 'needs_attention') return !row.resolved_at
  return row.outcome === 'quote_created'
}
