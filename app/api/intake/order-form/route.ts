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
// dryRun answers what WOULD happen and writes nothing.
import { NextRequest, NextResponse } from 'next/server'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { parseTourUpOrder } from '@/lib/intake/tour-up-order'
import { processTourUpOrder } from '@/lib/intake/process-order'

const supabase = createActorAdminClient()

export async function POST(request: NextRequest) {
  try {
    const { text, dryRun = false } = await request.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 })
    }
    const order = parseTourUpOrder(text)
    if (!order) {
      return NextResponse.json({ success: false, error: 'This does not read as the order form (tour code and departure date not found).' }, { status: 422 })
    }
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const result = await processTourUpOrder(supabase, {
      orgId,
      userId: await getCurrentUserId(),
      order,
      dryRun: dryRun === true,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('[intake/order-form]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
