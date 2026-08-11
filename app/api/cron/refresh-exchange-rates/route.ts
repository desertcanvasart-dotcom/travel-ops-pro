// ============================================
// CRON: /api/cron/refresh-exchange-rates — daily FX rate capture
// ============================================
// Writes today's market rates to the live table AND appends them to the
// append-only history that money reports convert against.
//
// The history is the reason this runs on a schedule rather than on demand: a
// rate that was never captured on 3 March can never be recovered, so every
// cost paid that day is stuck being converted at an approximation forever.
// One missed day is a permanent hole in the P&L.
//
// Bearer-auth like the other crons (CRON_SECRET; open when unset, matching
// convention). Schedule daily on the deploy host, e.g.:
//   0 1 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://autoura.net/api/cron/refresh-exchange-rates
//
// Note pg_cron runs in UTC and does not follow Cairo DST — 01:00 UTC is chosen
// because it is quiet in every season, and the exact minute does not matter as
// long as one capture lands per day.
//
// Response: 200 with the result body; ok:false + 500 only when nothing was
// written, so a monitor can distinguish "no new rates" from "endpoint broken".
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshExchangeRates } from '@/lib/exchange-rate-refresh'

export const dynamic = 'force-dynamic'

async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // force: the daily run must capture a snapshot even if a manual refresh
  // happened within the freshness window — a skipped run is a missing day of
  // history, which is exactly what this job exists to prevent.
  const result = await refreshExchangeRates(supabaseAdmin, {
    force: true,
    apiKey: process.env.EXCHANGE_RATE_API_KEY,
  })

  if (!result.success) {
    console.error('Exchange rate refresh cron failed:', result.error)
    return NextResponse.json(result, { status: 500 })
  }

  if (result.snapshotError) {
    // Live rates updated but history did not — report it loudly: the reports
    // silently lose accuracy otherwise.
    console.error('Exchange rate history NOT written:', result.snapshotError)
  }

  return NextResponse.json(result)
}

/** POST is the real verb; GET is accepted so a plain curl/uptime check works. */
export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
