import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { parseDateOnly } from '@/lib/pricing/season-admin'

// One dated window on a season. Real dates, not month-day: Golden Week and
// Obon move each year, and the operator plans twelve months ahead.
//
// POST only — the list is read through /api/pricing/seasons, which embeds the
// windows with the season that owns them.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const seasonId = typeof body.season_id === 'string' ? body.season_id : ''
    const startDate = parseDateOnly(body.start_date)
    const endDate = parseDateOnly(body.end_date)

    if (!seasonId) return NextResponse.json({ success: false, error: 'Season is required' }, { status: 400 })
    if (!body.start_date || !body.end_date) {
      return NextResponse.json({ success: false, error: 'Both dates are required' }, { status: 400 })
    }
    // Present but unusable — 2027-02-31, or a timestamp where a date belongs.
    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 })
    }
    if (endDate < startDate) {
      return NextResponse.json({ success: false, error: 'The last day cannot come before the first' }, { status: 400 })
    }

    // The window's org is taken from the season, never from the request — and
    // the season is looked up inside the caller's org, so a window cannot be
    // hung on somebody else's season.
    const { data: season, error: seasonError } = await supabaseAdmin
      .from('pricing_seasons')
      .select('id')
      .eq('id', seasonId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (seasonError) {
      console.error('Error loading season for date window:', seasonError)
      return NextResponse.json({ success: false, error: 'Failed to add dates' }, { status: 500 })
    }
    if (!season) return NextResponse.json({ success: false, error: 'Season not found' }, { status: 404 })

    const { data, error } = await supabaseAdmin
      .from('pricing_season_dates')
      .insert({
        org_id: orgId,
        season_id: seasonId,
        start_date: startDate,
        end_date: endDate,
        label: typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null,
      })
      .select('id, season_id, start_date, end_date, label')
      .single()

    if (error) {
      console.error('Error creating season date window:', error)
      return NextResponse.json({ success: false, error: 'Failed to add dates' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in season-dates POST:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
