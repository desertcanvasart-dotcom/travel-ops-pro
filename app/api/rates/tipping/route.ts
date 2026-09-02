// app/api/rates/tipping/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { blankToNull } from '@/lib/blank-to-null'
import { validateRatePayload } from '@/lib/rate-validation'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('tipping_rates')
      .select('*')
      .order('role_type')
      .order('context')

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    // Same guard as /api/payments: this route spreads the body straight into
    // an update, so a blank form field must not reach a typed column as "".
    const body = blankToNull(await request.json())

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    // Check for existing rate with same natural key
    let existingQuery = supabase
      .from('tipping_rates')
      .select('id')
    if (body.role_type) {
      existingQuery = existingQuery.eq('role_type', body.role_type)
    } else {
      existingQuery = existingQuery.is('role_type', null)
    }
    if (body.context) {
      existingQuery = existingQuery.eq('context', body.context)
    } else {
      existingQuery = existingQuery.is('context', null)
    }
    // The city is part of the natural key. Without it a Cairo driver rate and
    // an Aswan driver rate collide on (role_type, context) and the second
    // silently OVERWRITES the first.
    if (body.city) {
      existingQuery = existingQuery.eq('city', body.city)
    } else {
      existingQuery = existingQuery.is('city', null)
    }
    const { data: existing } = await existingQuery.limit(1)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (existing?.length) {
      return NextResponse.json({
        success: false,
        error: 'A rate with these details already exists. Edit that rate, or change what makes this one different (supplier, period, class, city) before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabase
        .from('tipping_rates')
        .insert([body])
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}