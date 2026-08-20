import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { parseDateOnly } from '@/lib/pricing/season-admin'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH — move a window (next year's Golden Week is not this year's dates).
// DELETE — drop it. The season survives with its other windows.

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()
    const update: Record<string, unknown> = {}

    if ('start_date' in body) {
      const startDate = parseDateOnly(body.start_date)
      if (!startDate) return NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 })
      update.start_date = startDate
    }
    if ('end_date' in body) {
      const endDate = parseDateOnly(body.end_date)
      if (!endDate) return NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 })
      update.end_date = endDate
    }
    if ('label' in body) {
      update.label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    // One end may be moved without the other, so the pair is checked against
    // what the row will actually hold — not against what arrived.
    const { data: existing, error: readError } = await supabaseAdmin
      .from('pricing_season_dates')
      .select('id, start_date, end_date')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (readError) {
      console.error('Error loading season date window:', readError)
      return NextResponse.json({ success: false, error: 'Failed to update dates' }, { status: 500 })
    }
    if (!existing) return NextResponse.json({ success: false, error: 'Dates not found' }, { status: 404 })

    const nextStart = String(update.start_date ?? (existing as any).start_date).slice(0, 10)
    const nextEnd = String(update.end_date ?? (existing as any).end_date).slice(0, 10)
    if (nextEnd < nextStart) {
      return NextResponse.json({ success: false, error: 'The last day cannot come before the first' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('pricing_season_dates')
      .update(update)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, season_id, start_date, end_date, label')
      .maybeSingle()

    if (error) {
      console.error('Error updating season date window:', error)
      return NextResponse.json({ success: false, error: 'Failed to update dates' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ success: false, error: 'Dates not found' }, { status: 404 })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in season-date PATCH:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const { data, error } = await supabaseAdmin
      .from('pricing_season_dates')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Error deleting season date window:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete dates' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ success: false, error: 'Dates not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in season-date DELETE:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
