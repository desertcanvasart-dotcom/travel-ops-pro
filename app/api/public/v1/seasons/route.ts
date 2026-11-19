// ============================================
// API: GET /api/public/v1/seasons — the operator's peak calendar
// ============================================
// Beside /api/public/v1/availability, with the same partner key (Bearer). A
// partner or a website reads which departure dates carry the operator's
// seasonal premium (Settings → Seasonal Premiums) and how much, to price a
// peak date the way our quotes do. Rules: lib/pricing/season-feed.ts.
//
//   GET /api/public/v1/seasons               every season with a window today or later
//   GET /api/public/v1/seasons?date=YYYY-MM-DD   …and the season that departure falls in
//
// Returns season names, premiums and date ranges only: no prices, costs,
// margins or bookings. Ported from autoura-saas #823 (its Publish feed).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { businessToday } from '@/lib/today'
import { partnerFromRequest, stampOutbound } from '@/lib/integrations/partner-key'
import { seasonsFeed, type FeedWindow } from '@/lib/pricing/season-feed'

export const dynamic = 'force-dynamic'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export async function GET(request: NextRequest) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const auth = await partnerFromRequest(db, request.headers.get('authorization'), 'seasons')
  if (!auth.ok) return auth.response
  const { integration } = auth

  const date = new URL(request.url).searchParams.get('date')
  if (date !== null && !isRealDate(date)) {
    return NextResponse.json({ success: false, error: 'date must be a YYYY-MM-DD date' }, { status: 400 })
  }

  const today = businessToday()
  const { data, error } = await db
    .from('pricing_season_dates')
    .select('season_id, start_date, end_date, label, pricing_seasons!inner(name, uplift_percent, is_active)')
    .eq('org_id', integration.org_id)
    .eq('pricing_seasons.is_active', true)
    .gte('end_date', today)
  if (error) {
    console.error('Seasons read failed:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  const windows: FeedWindow[] = (data ?? []).map(row => {
    const season = row.pricing_seasons as unknown as { name: string; uplift_percent: number }
    return {
      seasonId: String(row.season_id),
      name: String(season?.name ?? ''),
      upliftPercent: Number(season?.uplift_percent) || 0,
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      label: (row as { label?: string | null }).label ?? null,
    }
  })

  stampOutbound(db, integration.id)
  return NextResponse.json(
    { success: true, ...seasonsFeed(windows, today, date) },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  )
}
