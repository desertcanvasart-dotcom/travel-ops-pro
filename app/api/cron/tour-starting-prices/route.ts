// ============================================
// Nightly: refresh every tour's "Starting from" price
// ============================================
// Rates change during the day; the Tours page card should not show
// yesterday's price for long. Same rule as the Refresh prices button and the
// save-time refresh (lib/tours/starting-price).
//
// Bearer-auth like the other crons (CRON_SECRET), invoked in-process by
// lib/cron/scheduler.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { installOrgId, refreshStartingPrices } from '@/lib/tours/starting-price'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const results = await refreshStartingPrices(db, await installOrgId(db))
  const errors = results.filter(r => r.error).length
  return NextResponse.json({ success: errors === 0, refreshed: results.length - errors, errors })
}
