// ============================================
// /api/bookings/[id]/extras/[eid] — pricing, confirming, withdrawing
// ============================================
// PATCH   edit the extra, act on it, or both  { action?, ...fields }
// DELETE  remove one that never became money
//
// CONFIRM IS THE ONLY THING THAT MOVES MONEY, and it does so through the single
// recompute in ../recompute.ts. Withdrawing a confirmed extra runs the same
// recompute and takes the money back out.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { nextStatus, isPriced, lineAmount, type ExtraAction, type BookingExtraLine } from '@/lib/booking-extras'
import { recomputeBookingExtras } from '../recompute'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const ACTIONS = new Set<ExtraAction>(['price', 'accept', 'decline', 'confirm', 'withdraw'])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> }
) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id, eid } = await params

  const { data: extra } = await admin
    .from('booking_extras')
    .select('*')
    .eq('id', eid)
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!extra) return NextResponse.json({ error: 'Extra not found' }, { status: 404 })

  if (extra.invoiced_at) {
    // Once it is on a customer's invoice it is a document, not a draft.
    return NextResponse.json(
      { error: 'This extra has already been invoiced. Issue a credit or a new invoice instead.' },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  // ---------- the editable fields ----------
  if (typeof body?.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
    updates.title = title
  }
  if (body?.description !== undefined) {
    updates.description = typeof body.description === 'string' ? body.description.slice(0, 2000) : null
  }
  if (body?.quantity !== undefined) {
    const q = Math.floor(Number(body.quantity))
    if (!Number.isFinite(q) || q < 1) {
      return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 })
    }
    updates.quantity = q
  }
  if (body?.unit_price !== undefined) {
    if (body.unit_price === null || body.unit_price === '') {
      updates.unit_price = null
      updates.currency = null
      updates.priced_at = null
    } else {
      const price = Number(body.unit_price)
      const currency =
        typeof body?.currency === 'string' && body.currency.trim()
          ? body.currency.trim().toUpperCase()
          : extra.currency || null
      if (!isPriced({ unit_price: price, currency })) {
        return NextResponse.json({ error: 'That price is not a usable amount' }, { status: 400 })
      }
      updates.unit_price = price
      updates.currency = currency
      updates.priced_at = new Date().toISOString()
    }
  } else if (typeof body?.currency === 'string' && body.currency.trim()) {
    updates.currency = body.currency.trim().toUpperCase()
  }
  if (body?.supplier_cost !== undefined) {
    if (body.supplier_cost === null || body.supplier_cost === '') {
      updates.supplier_cost = null
      updates.supplier_currency = null
    } else {
      const cost = Number(body.supplier_cost)
      if (!Number.isFinite(cost) || cost < 0) {
        return NextResponse.json({ error: 'That supplier cost is not a usable amount' }, { status: 400 })
      }
      updates.supplier_cost = cost
      updates.supplier_currency =
        (typeof body?.supplier_currency === 'string' && body.supplier_currency.trim()
          ? body.supplier_currency.trim().toUpperCase()
          : extra.supplier_currency) || updates.currency || extra.currency || null
    }
  }
  if (body?.supplier_id !== undefined) {
    updates.supplier_id = typeof body.supplier_id === 'string' && body.supplier_id ? body.supplier_id : null
  }

  // ---------- the action ----------
  let moneyMoves = false
  const action = body?.action
  if (action !== undefined) {
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ error: `Unknown action: ${String(action)}` }, { status: 400 })
    }
    // Judged against the extra AS IT WILL BE — pricing and confirming in one
    // request has to see the new price, not the old blank.
    const after = {
      unit_price: (updates.unit_price !== undefined ? updates.unit_price : extra.unit_price) as number | null,
      currency: (updates.currency !== undefined ? updates.currency : extra.currency) as string | null,
    }
    const decision = nextStatus(extra.status, action, after)
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 409 })

    updates.status = decision.status
    moneyMoves = decision.moneyMoves

    if (decision.status === 'confirmed') {
      updates.confirmed_at = new Date().toISOString()
      updates.confirmed_by = await getCurrentUserId()
    }
    if (decision.status === 'declined' || decision.status === 'withdrawn') {
      updates.resolved_at = new Date().toISOString()
      // Withdrawing a confirmed extra un-sells it; the stamp would otherwise
      // read as though it were still sold.
      updates.confirmed_at = null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data: saved, error } = await admin
    .from('booking_extras')
    .update(updates)
    .eq('id', eid)
    .eq('org_id', orgId)
    .select('*')
    .single()
  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Could not update the extra') }, { status: 500 })
  }

  // A priced change to an already-confirmed extra moves money too, not just a
  // status change — recompute whenever the extra is or was confirmed.
  const totalsChanged = moneyMoves || extra.status === 'confirmed' || saved.status === 'confirmed'

  let totals = null
  if (totalsChanged) {
    const result = await recomputeBookingExtras(admin, id, orgId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    totals = result
  }

  if (saved.status === 'confirmed' && extra.status !== 'confirmed') {
    await addToSupplierManifest(id, saved)
  }

  return NextResponse.json({
    success: true,
    extra: { ...saved, line_amount: lineAmount(saved as BookingExtraLine) },
    totals,
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> }
) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id, eid } = await params

  const { data: extra } = await admin
    .from('booking_extras')
    .select('id, status, invoiced_at, confirmed_at')
    .eq('id', eid)
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!extra) return NextResponse.json({ error: 'Extra not found' }, { status: 404 })

  // Anything that ever became money stays on the record. Withdraw it instead —
  // that reverses the total and leaves the history intact.
  if (extra.status === 'confirmed' || extra.confirmed_at || extra.invoiced_at) {
    return NextResponse.json(
      { error: 'This extra was sold. Withdraw it rather than deleting it, so the change is on the record.' },
      { status: 409 }
    )
  }

  const { error } = await admin.from('booking_extras').delete().eq('id', eid).eq('org_id', orgId)
  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Could not delete the extra') }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

/**
 * Put a confirmed extra on the booking's supplier manifest, so operations
 * confirm it like every other service rather than discovering it on an invoice.
 *
 * Best-effort: the sale is the valuable record, and the manifest can be rebuilt
 * from /api/bookings/[id]/sync-suppliers.
 */
async function addToSupplierManifest(bookingId: string, extra: Record<string, unknown>) {
  if (!extra.supplier_id && !extra.supplier_cost) return
  const { data: supplier } = extra.supplier_id
    ? await admin.from('suppliers').select('name').eq('id', extra.supplier_id).maybeSingle()
    : { data: null }

  const { error } = await admin.from('booking_supplier_status').insert({
    booking_id: bookingId,
    supplier_type: 'other',
    supplier_name: supplier?.name || String(extra.title),
    service_description: `Extra: ${String(extra.title)}`,
    quoted_cost: extra.supplier_cost ?? null,
    status: 'pending',
  })
  if (error) console.error('extras: could not add to supplier manifest', error)
}
