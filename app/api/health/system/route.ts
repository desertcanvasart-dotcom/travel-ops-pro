// ============================================
// API: /api/health/system — DB reachability + automated RLS posture probe
// ============================================
// Automates the June 2026 RLS audit's manual method: for every table that
// must be invisible to the anonymous internet, count rows AS ANON (real anon
// key, no session). Any anon-visible row on a locked table = exposure = 503.
// The goal is to catch an RLS regression in hours (next health check / E2E
// run), not at the next hand-run audit.
//
// AUTH: deliberately NOT middleware-allowlisted — the response describes
// security posture, so it requires a logged-in operator session. The authed
// E2E smoke suite hits it on every run.
//
// Notes on semantics:
// - A table that is EMPTY passes trivially even if its RLS is missing; the
//   probe flips red exactly when real rows become exposed. (Same limitation
//   as the original audit — count probes can't distinguish locked from
//   empty-and-open.)
// - OPEN_BY_DESIGN lists rate/content tables that are currently anon-readable
//   on purpose (pending the tightening follow-up). Reported as counts so the
//   posture is visible; NOT a failure. When they get locked, move them into
//   MUST_BE_LOCKED.
// ============================================

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Tables the anonymous internet must never see rows from. Baseline verified
// against live posture 2026-07-14 (all showed anon=0).
const MUST_BE_LOCKED = [
  'itineraries',
  'itinerary_days',
  'itinerary_services',
  'itinerary_versions',
  'clients',
  'invoices',
  'payments',
  'bookings',
  'booking_payments',
  'expenses',
  'commissions',
  'suppliers',
  'supplier_invoices',
  'organizations',
  'organization_members',
  'user_profiles',
  'tour_quotes',
  'quote_versions',
  'b2b_partners',
  'communication_history',
  'client_notes',
  'client_followups',
  'entrance_fees',
  // Rate/content tables + the guides view — locked by the 20260714
  // rate-table tightening migration (authenticated-only + view
  // security_invoker). Previously listed as OPEN_BY_DESIGN.
  'transportation_rates',
  'accommodation_rates',
  'guide_rates',
  'meal_rates',
  'nile_cruises',
  'tour_templates',
  'airport_staff_rates',
  'hotel_staff_rates',
  'tipping_rates',
  'guides',
  // Audit trail of rate changes (full before/after records) — authenticated
  // read-only per 20260226_rate_audit_trail.sql (applied 2026-07-14).
  'rate_audit_log',
]

// Tables that are anon-readable on purpose. Empty since the 20260714
// tightening; keep the mechanism so a future deliberate exception is
// declared here instead of weakening MUST_BE_LOCKED.
const OPEN_BY_DESIGN: string[] = []

async function anonCount(
  // Loose generics on purpose: version-specific SupabaseClient generic
  // parameters churn, and this helper only needs .from().select().
  anon: SupabaseClient<any, any, any, any, any>,
  table: string
): Promise<{ table: string; count: number | null; error?: string }> {
  // head+count on '*' — some tables (organization_members) have no `id` column.
  const { count, error } = await anon.from(table).select('*', { count: 'exact', head: true })
  if (error) return { table, count: null, error: error.message }
  return { table, count: count ?? 0 }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // Plain anon client with NO session — deliberately simulates the anonymous
  // internet, which is the whole point of the probe.
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  // 1. Database reachability (service role) + latency
  const t0 = Date.now()
  const dbCheck = await service.from('organizations').select('id', { count: 'exact', head: true })
  const database = {
    ok: !dbCheck.error,
    latencyMs: Date.now() - t0,
    ...(dbCheck.error ? { error: dbCheck.error.message } : {}),
  }

  // 2. RLS posture: all probes in parallel
  const [lockedResults, openResults] = await Promise.all([
    Promise.all(MUST_BE_LOCKED.map((t) => anonCount(anon, t))),
    Promise.all(OPEN_BY_DESIGN.map((t) => anonCount(anon, t))),
  ])

  const exposed = lockedResults.filter((r) => (r.count ?? 0) > 0)
  const probeErrors = lockedResults.filter((r) => r.error)
  const openByDesign = Object.fromEntries(
    openResults.map((r) => [r.table, r.error ? `error: ${r.error}` : r.count])
  )

  const rls = {
    ok: exposed.length === 0,
    probedLocked: MUST_BE_LOCKED.length,
    exposed: exposed.map((r) => ({ table: r.table, anonVisibleRows: r.count })),
    // Errors mean "could not prove locked", not "exposed" — surfaced so an
    // operator investigates, but they don't fail the check on their own.
    probeErrors: probeErrors.map((r) => ({ table: r.table, error: r.error })),
    openByDesign,
  }

  const overall = database.ok && rls.ok ? 'ok' : 'fail'
  return NextResponse.json(
    { overall, database, rls, checkedAt: new Date().toISOString() },
    { status: overall === 'ok' ? 200 : 503 }
  )
}
