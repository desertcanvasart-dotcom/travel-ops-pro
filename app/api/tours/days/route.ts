import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { tourInOrg, foreignRateIds } from '@/lib/tours/org-scope'

// tour_days belong to the legacy builder's tours (tour_days.tour_id → tours),
// and a tour to one company (20261207). A day carries no org_id of its own:
// it is the caller's when its tour is.

// GET - List the company's tours' days (optionally filter by tour_id)
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()

    const { searchParams } = new URL(request.url)
    const tourId = searchParams.get('tour_id')

    let tourIds: string[]
    if (tourId) {
      if (!(await tourInOrg(supabase, orgId, tourId))) {
        return NextResponse.json({ success: false, error: 'Tour not found' }, { status: 404 })
      }
      tourIds = [tourId]
    } else {
      const { data: tours } = await supabase.from('tours').select('id').eq('org_id', orgId)
      tourIds = ((tours ?? []) as Array<{ id: string }>).map(t => t.id)
      if (tourIds.length === 0) return NextResponse.json({ success: true, data: [], count: 0 })
    }

    const query = supabase
      .from('tour_days')
      .select(`
        *,
        activities:tour_day_activities(*),
        accommodation:hotel_contacts(id, name, city),
        lunch_meal:restaurant_contacts!lunch_meal_id(id, name, city),
        dinner_meal:restaurant_contacts!dinner_meal_id(id, name, city),
        guide:guides(id, name, languages)
      `)
      .in('tour_id', tourIds)
      .order('day_number', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching days:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch days' },
        { status: 500 }
      )
    }

    // Sort activities by activity_order
    const daysWithSortedActivities = data?.map((day: any) => ({
      ...day,
      activities: day.activities?.sort((a: any, b: any) => 
        (a.activity_order || 0) - (b.activity_order || 0)
      ) || []
    }))

    return NextResponse.json({
      success: true,
      data: daysWithSortedActivities || [],
      count: daysWithSortedActivities?.length || 0
    })

  } catch (error) {
    console.error('Error in days GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new day
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const body = await request.json()

    if (!body.tour_id || !body.day_number || !body.city) {
      return NextResponse.json(
        { success: false, error: 'Tour ID, day number, and city are required' },
        { status: 400 }
      )
    }

    if (!(await tourInOrg(supabase, orgId, body.tour_id))) {
      return NextResponse.json({ success: false, error: 'Tour not found' }, { status: 404 })
    }
    const foreign = await foreignRateIds(supabase, orgId, [body.accommodation_id, body.lunch_meal_id, body.dinner_meal_id, body.guide_id])
    if (foreign.length) {
      return NextResponse.json({ success: false, error: "A rate on this day is not this company's", rate_ids: foreign }, { status: 400 })
    }

    const dayData = {
      tour_id: body.tour_id,
      day_number: body.day_number,
      city: body.city,
      accommodation_id: body.accommodation_id || null,
      breakfast_included: body.breakfast_included || false,
      lunch_meal_id: body.lunch_meal_id || null,
      dinner_meal_id: body.dinner_meal_id || null,
      guide_required: body.guide_required || false,
      guide_id: body.guide_id || null,
      notes: body.notes || null
    }

    const { data, error } = await supabase
      .from('tour_days')
      .insert([dayData])
      .select()
      .single()

    if (error) {
      console.error('Error creating day:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create day' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Day created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in days POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}