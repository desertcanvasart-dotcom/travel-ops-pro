// ============================================
// The office confirming a traveller's insurance
// ============================================
// GET    what each traveller asked for, and what it would cost
// POST   confirm one traveller's plan  { passenger_id }
// DELETE withdraw a confirmation       { passenger_id }
//
// A traveller choosing a plan in the portal is a REQUEST. Nothing reaches an
// invoice until somebody here confirms it — which is also what 領収金額合計
// means on the paper form: the office's figure, not the applicant's.
//
// The premium is resolved HERE, from the rate table, and never taken from the
// request body. The portal shows a price so the customer can choose; what gets
// billed is computed again on the server against the trip's own length and the
// traveller's own age.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { quotePremium, tripDays, ageOn, type PremiumBand } from '@/lib/insurance'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Loaded {
  booking: { id: string; start_date: string | null; end_date: string | null }
  passengers: Array<Record<string, unknown>>
  bands: PremiumBand[]
}

async function load(bookingId: string, orgId: string): Promise<Loaded | null> {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, start_date, end_date')
    .eq('id', bookingId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!booking) return null

  const { data: passengers } = await supabaseAdmin
    .from('booking_passengers')
    .select(
      'id, first_name, last_name, family_name_kanji, given_name_kanji, date_of_birth, ' +
        'insurance_requested, insurance_plan_code, insurance_premium_jpy, insurance_premium_id, insurance_confirmed_at'
    )
    .eq('booking_id', bookingId)
    .order('is_lead_passenger', { ascending: false })

  // Newest rate year the operator has loaded.
  const { data: rows } = await supabaseAdmin
    .from('insurance_premiums')
    .select('id, rate_year, max_days, band_label, premium_jpy, max_age, insurance_plans!inner(plan_code)')
    .eq('org_id', orgId)

  let bands: PremiumBand[] = []
  if (rows?.length) {
    const newest = Math.max(...rows.map(r => Number(r.rate_year) || 0))
    bands = rows
      .filter(r => Number(r.rate_year) === newest)
      .map(r => ({
        id: String(r.id),
        planCode: String((r.insurance_plans as unknown as { plan_code: string })?.plan_code ?? ''),
        maxDays: Number(r.max_days),
        bandLabel: String(r.band_label),
        premiumJpy: Number(r.premium_jpy),
        maxAge: r.max_age == null ? null : Number(r.max_age),
      }))
      .filter(b => b.planCode)
  }

  return {
    booking,
    // The select above can come back as an error shape rather than rows; treat
    // anything that is not an array of objects as "no passengers".
    passengers: Array.isArray(passengers) ? (passengers as unknown as Array<Record<string, unknown>>) : [],
    bands,
  }
}

const displayName = (p: Record<string, unknown>) =>
  [p.family_name_kanji, p.given_name_kanji].filter(Boolean).join(' ') ||
  [p.last_name, p.first_name].filter(Boolean).join(' ') ||
  '—'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params

  const loaded = await load(id, orgId)
  if (!loaded) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const days = tripDays(loaded.booking.start_date, loaded.booking.end_date)

  const travellers = loaded.passengers
    .filter(p => p.insurance_requested === true)
    .map(p => {
      const planCode = typeof p.insurance_plan_code === 'string' ? p.insurance_plan_code : null
      const age = ageOn(
        typeof p.date_of_birth === 'string' ? p.date_of_birth : null,
        loaded.booking.start_date
      )
      const quoted = planCode && days ? quotePremium({ bands: loaded.bands, planCode, days, age }) : null
      return {
        id: String(p.id),
        name: displayName(p),
        planCode,
        age,
        confirmedAt: p.insurance_confirmed_at ?? null,
        // What was billed, once confirmed — the stored figure, not a fresh
        // quote, so a reissued rate table cannot silently restate it.
        confirmedPremiumJpy: p.insurance_premium_jpy ?? null,
        quote: quoted?.ok ? quoted.quote : null,
        ineligible: quoted && !quoted.ok ? quoted.reason : null,
      }
    })

  return NextResponse.json({ tripDays: days, travellers, ratesLoaded: loaded.bands.length > 0 })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const passengerId = typeof body?.passenger_id === 'string' ? body.passenger_id : null
  if (!passengerId) return NextResponse.json({ error: 'passenger_id is required' }, { status: 400 })

  const loaded = await load(id, orgId)
  if (!loaded) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const passenger = loaded.passengers.find(p => String(p.id) === passengerId)
  if (!passenger) return NextResponse.json({ error: 'Traveller not on this booking' }, { status: 404 })

  const planCode = typeof passenger.insurance_plan_code === 'string' ? passenger.insurance_plan_code : null
  if (passenger.insurance_requested !== true || !planCode) {
    return NextResponse.json({ error: 'This traveller has not chosen a plan yet' }, { status: 400 })
  }

  const days = tripDays(loaded.booking.start_date, loaded.booking.end_date)
  if (!days) {
    return NextResponse.json({ error: 'The booking has no usable travel dates' }, { status: 400 })
  }

  const age = ageOn(
    typeof passenger.date_of_birth === 'string' ? passenger.date_of_birth : null,
    loaded.booking.start_date
  )
  const quoted = quotePremium({ bands: loaded.bands, planCode, days, age })
  if (!quoted.ok) {
    return NextResponse.json({ error: 'ineligible', reason: quoted.reason }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('booking_passengers')
    .update({
      insurance_premium_jpy: quoted.quote.premiumJpy,
      insurance_premium_id: quoted.quote.premiumId ?? null,
      insurance_confirmed_at: new Date().toISOString(),
    })
    .eq('id', passengerId)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Could not confirm') }, { status: 500 })
  }
  return NextResponse.json({ confirmed: true, premium_jpy: quoted.quote.premiumJpy })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const passengerId = typeof body?.passenger_id === 'string' ? body.passenger_id : null
  if (!passengerId) return NextResponse.json({ error: 'passenger_id is required' }, { status: 400 })

  // Scoped by booking as well as id: a passenger id alone must not be enough
  // to clear a confirmation on somebody else's booking.
  const { data: booking } = await supabaseAdmin
    .from('bookings').select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('booking_passengers')
    .update({ insurance_confirmed_at: null, insurance_premium_jpy: null, insurance_premium_id: null })
    .eq('id', passengerId)
    .eq('booking_id', id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Could not withdraw') }, { status: 500 })
  }
  return NextResponse.json({ confirmed: false })
}
