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
import { bearerToken, hashApiKey } from '@/lib/integrations/credentials'
import type { AvailabilityDay } from '@/lib/integrations/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/** A partner asking for five years of calendar is a mistake or an abuse. */
const MAX_RANGE_DAYS = 400

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const key = bearerToken(request.headers.get('authorization'))
  if (!key) {
    return unauthorized('Missing API key. Send: Authorization: Bearer <key>')
  }

  // Look the key up BY HASH. The plaintext is never stored, so a dump of this
  // table yields nothing that can be replayed against this endpoint.
  const { data: integration, error } = await supabaseAdmin
    .from('integrations')
    .select('id, org_id, direction, is_active')
    .eq('outbound_key_hash', hashApiKey(key))
    .maybeSingle()

  if (error) {
    // PGRST205 / 42P01 = the integrations table is not there, i.e. this deploy
    // landed before migration 20260812_integrations_and_capacity. No table
    // means no key can be valid, so the honest answer is 401 — and a partner
    // retrying against a 401 backs off, where a 500 makes them hammer us.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      console.warn('Partner availability API called before the integrations migration was applied')
      return unauthorized('Invalid API key')
    }
    console.error('Integration key lookup failed:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  // One answer for unknown / disabled / inbound-only. Distinguishing them would
  // tell a probe whether a key exists at all.
  if (!integration || !integration.is_active || integration.direction === 'inbound') {
    return unauthorized('Invalid API key')
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || todayIso()
  const to = searchParams.get('to') || addDays(from, 90)

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
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
    // Note the omissions: no internal_notes, no booked_guides/vehicles.
    .select('date, status, max_groups, booked_groups, reason')
    .eq('org_id', integration.org_id)
    .gte('date', from)
    .lte('date', to)
    .order('date')

  if (capacityError) {
    console.error('Availability read failed:', capacityError)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }

  const days: AvailabilityDay[] = (rows || []).map(row => {
    const max = numberOrNull(row.max_groups)
    const booked = numberOrNull(row.booked_groups) ?? 0
    return {
      date: row.date,
      status: row.status,
      // Never negative: an over-booked day reports zero slots, not "-1 slots".
      available_slots: max === null ? null : Math.max(0, max - booked),
      reason: row.status === 'blackout' || row.status === 'busy' ? row.reason ?? null : null,
    }
  })

  // Fire-and-forget: a failed bookkeeping write must not fail the partner's read.
  supabaseAdmin
    .from('integrations')
    .update({ last_outbound_at: new Date().toISOString() })
    .eq('id', integration.id)
    .then(undefined, err => console.error('Could not stamp last_outbound_at:', err))

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

function unauthorized(message: string) {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="travel-ops-pro"' } }
  )
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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
