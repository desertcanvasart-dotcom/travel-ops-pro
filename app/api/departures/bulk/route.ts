// ============================================
// BULK DEPARTURES API
// File: app/api/departures/bulk/route.ts
//
// Create many departures for one template in a single call. The grid's
// "Generate departures" modal computes a list of start dates from a rule (a
// weekly pattern, a fixed interval, or hand-picked days) and posts them here.
// Existing dates are skipped, not errored, via the
// (org_id, template_id, start_date) unique key — so re-running a slightly wider
// range only fills the gaps.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { normaliseDates, MAX_GENERATED_DATES } from '@/lib/departures/generate-dates'

const VALID_STATUSES = ['draft', 'open', 'limited', 'full', 'guaranteed', 'cancelled']

/**
 * POST /api/departures/bulk
 * Body: { template_id, dates: string[], max_pax?, min_pax?, status? }
 * Returns: { created, skipped, requested }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const body = await request.json()
    const templateId: string | undefined = body.template_id
    const dates = normaliseDates(Array.isArray(body.dates) ? body.dates : [])
    const maxPax = Number.isFinite(body.max_pax) ? Math.max(1, Math.floor(body.max_pax)) : 20
    const minPax = Number.isFinite(body.min_pax) ? Math.max(1, Math.floor(body.min_pax)) : 2
    const status = typeof body.status === 'string' && VALID_STATUSES.includes(body.status) ? body.status : 'open'

    if (!templateId) {
      return NextResponse.json({ success: false, error: 'template_id is required' }, { status: 400 })
    }
    if (dates.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid dates to create' }, { status: 400 })
    }
    if (dates.length > MAX_GENERATED_DATES) {
      return NextResponse.json(
        { success: false, error: `Too many dates (max ${MAX_GENERATED_DATES})` },
        { status: 400 },
      )
    }

    // The template supplies the name, code and length; end_date is derived so
    // every generated departure spans the tour's own duration.
    const { data: template, error: tErr } = await supabase
      .from('tour_templates')
      .select('template_name, template_code, duration_days')
      .eq('id', templateId)
      .eq('org_id', org_id)
      .maybeSingle()
    if (tErr) {
      return NextResponse.json({ success: false, error: clientMessage(tErr, 'Could not load template') }, { status: 500 })
    }
    if (!template) {
      return NextResponse.json({ success: false, error: 'Tour template not found' }, { status: 404 })
    }
    const durationDays = template.duration_days || 1

    const rows = dates.map(start_date => {
      const start = new Date(`${start_date}T00:00:00Z`)
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + durationDays - 1)
      return {
        org_id,
        template_id: templateId,
        tour_name: template.template_name,
        tour_code: template.template_code ?? null,
        duration_days: durationDays,
        start_date,
        end_date: end.toISOString().split('T')[0],
        max_pax: maxPax,
        min_pax: minPax,
        status,
      }
    })

    // Insert new dates, skip any that already exist for this template. With
    // ignoreDuplicates the conflict is DO NOTHING and only the rows actually
    // inserted come back, so their count is what we created.
    const { data: inserted, error: insErr } = await supabase
      .from('tour_departures')
      .upsert(rows, { onConflict: 'org_id,template_id,start_date', ignoreDuplicates: true })
      .select('id')
    if (insErr) {
      return NextResponse.json(
        { success: false, error: clientMessage(insErr, 'Could not create departures') },
        { status: 500 },
      )
    }

    const created = inserted?.length ?? 0
    return NextResponse.json({
      success: true,
      data: { created, skipped: rows.length - created, requested: rows.length },
    })
  } catch (error: any) {
    console.error('❌ Bulk departures error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to create departures') },
      { status: 500 },
    )
  }
}
