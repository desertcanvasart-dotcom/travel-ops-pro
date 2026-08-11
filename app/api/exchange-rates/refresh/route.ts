// ============================================
// API: /api/exchange-rates/refresh — manual FX rate refresh
// ============================================
// The operator-triggered twin of /api/cron/refresh-exchange-rates. Session
// authenticated (the middleware gate covers this path), and role-gated to
// admin/manager because it writes rate history that every money report reads.
//
// Unlike the cron this respects the freshness window by default: repeatedly
// clicking Refresh should not burn the upstream API quota. Pass { force: true }
// to override.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshExchangeRates } from '@/lib/exchange-rate-refresh'
import { requireRole } from '@/lib/auth/current-org'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const denied = await requireRole(['owner', 'admin', 'manager'])
  if (denied) return denied

  let force = false
  try {
    const body = await request.json()
    force = body?.force === true
  } catch {
    // No body is fine — default to respecting the freshness window.
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const result = await refreshExchangeRates(supabaseAdmin, {
    force,
    apiKey: process.env.EXCHANGE_RATE_API_KEY,
  })

  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
