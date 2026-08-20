import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { SEASON_COLOURS, isHexColour, parseUpliftPercent } from '@/lib/pricing/season-admin'

// ============================================
// THE OPERATOR'S OWN HIGH DATES
// File: app/api/pricing/seasons/route.ts
// ============================================
// The calendar the pricing engine reads (lib/pricing/season-uplift.ts). A
// season is a name and a percentage; its dates are a separate list, because
// one season holds several windows — Obon is one period, New Year another.
//
// Every read and write is scoped to the caller's org. These rows decide what a
// customer is charged, so they are never global.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('pricing_seasons')
      .select('id, name, uplift_percent, colour, display_order, is_active, pricing_season_dates(id, start_date, end_date, label)')
      .eq('org_id', orgId)
      .order('display_order')
      .order('name')

    if (error) {
      console.error('Error fetching pricing seasons:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch seasons' }, { status: 500 })
    }

    // Windows come back in insertion order from the embed; the operator reads
    // this as a calendar, so sort them by date.
    const seasons = (data || []).map((s: any) => ({
      ...s,
      pricing_season_dates: [...(s.pricing_season_dates || [])].sort(
        (a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date))
      ),
    }))

    return NextResponse.json({ success: true, data: seasons })
  } catch (error) {
    console.error('Error in seasons GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }

    // Zero is legitimate — a season worth naming and watching before deciding
    // to charge for it — so an absent percentage means zero, not an error.
    const uplift = parseUpliftPercent(body.uplift_percent ?? 0)
    if (uplift === null) {
      return NextResponse.json({ success: false, error: 'Premium must be between 0 and 200' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('pricing_seasons')
      .insert({
        org_id: orgId,
        name,
        uplift_percent: uplift,
        colour: isHexColour(body.colour) ? body.colour : SEASON_COLOURS[0],
        display_order: Number.isFinite(Number(body.display_order)) ? Number(body.display_order) : 0,
        is_active: body.is_active ?? true,
      })
      .select('id, name, uplift_percent, colour, display_order, is_active')
      .single()

    if (error) {
      // UNIQUE (org_id, name) — the operator already has this season.
      if ((error as any).code === '23505') {
        return NextResponse.json({ success: false, error: 'A season with that name already exists' }, { status: 400 })
      }
      console.error('Error creating pricing season:', error)
      return NextResponse.json({ success: false, error: 'Failed to create season' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: { ...data, pricing_season_dates: [] } })
  } catch (error) {
    console.error('Error in seasons POST:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
