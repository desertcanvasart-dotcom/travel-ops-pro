// Save Tour API Endpoint
// Location: /app/api/tours/save/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { foreignRateIds } from '@/lib/tours/org-scope'

// Service-role client (route is session-gated by middleware). Previously used
// the raw anon key inline — its WRITES to tours/tour_days/tour_pricing only
// worked because those tables were anon-writable.
const supabase = createServerClient()

export async function POST(request: NextRequest) {
  try {
    // A tour is one company's (20261207): stamped with the caller's, and its
    // days may only name that company's hotels, meals and guides.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { tour, pax, is_euro_passport, pricing } = await request.json()

    const days: any[] = Array.isArray(tour?.days) ? tour.days : []
    const foreign = await foreignRateIds(supabase, orgId, days.flatMap((day: any) => [
      day.accommodation?.id, day.lunch_meal?.id, day.dinner_meal?.id, day.guide?.id,
    ]))
    if (foreign.length) {
      return NextResponse.json(
        { success: false, error: "A rate on this tour is not this company's", rate_ids: foreign },
        { status: 400 }
      )
    }

    // 1. Save main tour
    const { data: tourData, error: tourError } = await supabase
      .from('tours')
      .insert({
        org_id: orgId,
        tour_code: tour.tour_code,
        tour_name: tour.tour_name,
        duration_days: tour.duration_days,
        cities: tour.cities,
        tour_type: tour.tour_type,
        is_template: tour.is_template || false,
        description: tour.description,
        created_by: 'system' // You can add user auth later
      })
      .select()
      .single()

    if (tourError) {
      console.error('Error saving tour:', tourError)
      return NextResponse.json(
        { success: false, error: clientMessage(tourError, 'Internal server error') },
        { status: 500 }
      )
    }

    const savedTourId = tourData.id
    let activitiesNotSaved = 0

    // 2. Save tour days
    if (tour.days && tour.days.length > 0) {
      const daysToInsert = tour.days.map((day: any) => ({
        tour_id: savedTourId,
        day_number: day.day_number,
        city: day.city,
        accommodation_id: day.accommodation?.id || null,
        breakfast_included: day.breakfast_included,
        lunch_meal_id: day.lunch_meal?.id || null,
        dinner_meal_id: day.dinner_meal?.id || null,
        guide_required: day.guide_required,
        guide_id: day.guide?.id || null,
        notes: day.notes || null
      }))

      const { error: daysError } = await supabase
        .from('tour_days')
        .insert(daysToInsert)
        .select()

      if (daysError) {
        console.error('Error saving tour days:', daysError)
        // Rollback: delete the tour
        await supabase.from('tours').delete().eq('id', savedTourId).eq('org_id', orgId)
        return NextResponse.json(
          { success: false, error: clientMessage(daysError, 'Internal server error') },
          { status: 500 }
        )
      }

      // 3. Activities are NOT saved. This used to insert { tour_day_id,
      //    activity_order, entrance_id, transportation_id, activity_notes }
      //    into tour_day_activities — none of those columns exist: that table
      //    is the TOUR MANAGER's day plan, keyed by template_id (NOT NULL,
      //    → tour_templates) and day_number, and a legacy tour is no
      //    template. Every insert failed and was only logged, so the
      //    builder's activities were always lost. There is no table for a
      //    legacy tour's activities; the response now says so instead of
      //    reporting a full save. (The legacy builder, /tour-builder, is in
      //    no menu — the tour manager, /tours/manage, replaced it.)
      activitiesNotSaved = tour.days.reduce(
        (n: number, day: any) => n + (Array.isArray(day.activities) ? day.activities.length : 0), 0)
    }

    // 4. Save pricing if provided
    if (pricing) {
      await supabase.from('tour_pricing').insert({
        tour_id: savedTourId,
        pax: pax,
        is_euro_passport: is_euro_passport,
        total_accommodation: pricing.totals.total_accommodation,
        total_meals: pricing.totals.total_meals,
        total_guides: pricing.totals.total_guides,
        total_transportation: pricing.totals.total_transportation,
        total_entrances: pricing.totals.total_entrances,
        grand_total: pricing.totals.grand_total,
        per_person_total: pricing.per_person
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        tour_id: savedTourId,
        tour_code: tour.tour_code,
        tour_name: tour.tour_name
      },
      message: 'Tour saved successfully!',
      ...(activitiesNotSaved > 0
        ? {
            activities_not_saved: activitiesNotSaved,
            warning: `The tour, its days and pricing were saved; its ${activitiesNotSaved} activit${activitiesNotSaved === 1 ? 'y was' : 'ies were'} not (the legacy builder has nowhere to keep them — build programmes in Tours › Manage).`,
          }
        : {}),
    })

  } catch (error) {
    console.error('Save tour error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to save tour' 
      },
      { status: 500 }
    )
  }
}