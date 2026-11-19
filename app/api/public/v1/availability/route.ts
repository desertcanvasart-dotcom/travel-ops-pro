// ============================================
// API: GET /api/public/v1/availability — the outbound blackout calendar
// ============================================
// What a partner platform reads to know when we can and cannot take groups.
// Authenticated by an API key we issued (Bearer), matched against a stored
// SHA-256 hash — we never hold the plaintext.
//
// VERSIONED PATH ON PURPOSE. Partners integrate once and then do not touch it
// for years; /v1/ means a future breaking change can ship as /v2/ instead of
// silently changing what an existing integration receives.
//
// WHAT THIS DELIBERATELY DOES NOT RETURN: internal_notes, booked counts, client
// names, prices, or anything about who filled the capacity. A partner needs to
// know WHETHER we can take a group on a date — not how our business is doing.
// `reason` is included only because "closed for Eid" is useful to a partner and
// the operator typed it knowing it is customer-facing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { partnerFromRequest, stampOutbound } from '@/lib/integrations/partner-key'
import type { AvailabilityDay } from '@/lib/integrations/types'
import { businessToday } from '@/lib/today'
import { loadDayLoads } from '@/lib/capacity-load'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/** A partner asking for five years of calendar is a mistake or an abuse. */
const MAX_RANGE_DAYS = 400

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  // The key we issued, matched by its hash; unknown, disabled and
  // inbound-only keys get one answer (lib/integrations/partner-key).
  const auth = await partnerFromRequest(supabaseAdmin, request.headers.get('authorization'), 'availability')
  if (!auth.ok) return auth.response
  const { integration } = auth

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || businessToday()
  // Checked before addDays: a malformed `from` made it throw (a 500, not a 400).
  if (!isRealDate(from)) {
    return NextResponse.json(
      { success: false, error: 'from and to must be YYYY-MM-DD dates' },
      { status: 400 }
    )
  }
  const to = searchParams.get('to') || addDays(from, 90)

  if (!isRealDate(from) || !isRealDate(to)) {
    return NextResponse.json(
      { success: false, error: 'from and to must be YYYY-MM-DD dates' },
      { status: 400 }
    )
  }
  if (to < from) {
    return NextResponse.json({ success: false, error: '`to` is before `from`' }, { status: 400 })
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { success: false, error: `Range too wide; request at most ${MAX_RANGE_DAYS} days` },
      { status: 400 }
    )
  }

  const { data: rows, error: capacityError } = await supabaseAdmin
    .from('operator_capacity')
    // Note the omissions: no internal_notes, no booked counts.
    .select('date, status, max_groups, reason')
    .eq('org_id', integration.org_id)
    .gte('date', from)
    .lte('date', to)
    .order('date')

  if (capacityError) {
    console.error('Availability read failed:', capacityError)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  // The groups already out on each day, counted from sold trips and running
  // departures (lib/capacity-load), as the Capacity page and the availability
  // check count them — booked_groups was never written. Only the slots LEFT
  // reach the partner.
  let loads: Awaited<ReturnType<typeof loadDayLoads>> = new Map()
  try {
    loads = await loadDayLoads(supabaseAdmin, integration.org_id, from, to)
  } catch (e) {
    console.error('Availability load read failed:', e)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  const days: AvailabilityDay[] = (rows || []).map(row => {
    const max = numberOrNull(row.max_groups)
    const booked = loads.get(row.date)?.groups ?? 0
    return {
      date: row.date,
      status: row.status,
      // Never negative: an over-booked day reports zero slots, not "-1 slots".
      available_slots: max === null ? null : Math.max(0, max - booked),
      reason: row.status === 'blackout' || row.status === 'busy' ? row.reason ?? null : null,
    }
  })

  // Fire-and-forget: a failed bookkeeping write must not fail the partner's read.
  stampOutbound(supabaseAdmin, integration.id)

  return NextResponse.json(
    {
      success: true,
      from,
      to,
      // A date absent from `days` has no capacity row. That is NOT the same as
      // "closed" — say so explicitly, because a partner guessing either way
      // gets it wrong half the time.
      default_when_absent: 'available',
      days,
    },
    {
      headers: {
        // Short cache: partners poll, and a minute-stale blackout is harmless
        // while a hammered endpoint is not.
        'Cache-Control': 'private, max-age=60',
      },
    }
  )
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** YYYY-MM-DD and an actual calendar day (2026-02-30 is not one). */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}
