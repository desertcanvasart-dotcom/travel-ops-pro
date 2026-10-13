import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { tourInOrg, foreignRateIds } from '@/lib/tours/org-scope'

/** The day when its tour is the caller's company's, else null (a day has no
 *  org_id of its own — 20261207 scopes it through tours). */
async function dayInOrg(supabase: ReturnType<typeof createServerClient>, orgId: string, id: string) {
  const { data } = await supabase.from('tour_days').select('id, tour_id, day_number').eq('id', id).maybeSingle()
  const day = data as { id: string; tour_id: string; day_number: number } | null
  if (!day || !(await tourInOrg(supabase, orgId, day.tour_id))) return null
  return day
}

// tour_days' rate columns reference the RATE tables (accommodation_rates,
// meal_rates ×2, guide_rates — 20260829's foreign keys), not hotel_contacts /
// restaurant_contacts / guides, which these embeds used to name: PostgREST
// found no relationship and every read failed (500). Each embed names its
// foreign key (meal_rates is referenced twice). There is no
// tour_day_activities relationship either — that table is the tour
// manager's, keyed by template_id; a legacy day has no activities, so
// `activities` is always [] (kept for the builder's shape).
const DAY_SELECT = `
  *,
  accommodation:accommodation_rates!tour_days_accommodation_id_fkey(id, property_name, city, room_type, board_basis),
  lunch_meal:meal_rates!tour_days_lunch_meal_id_fkey(id, restaurant_name, city, meal_type),
  dinner_meal:meal_rates!tour_days_dinner_meal_id_fkey(id, restaurant_name, city, meal_type),
  guide:guide_rates!tour_days_guide_id_fkey(id, guide_language, guide_type, city)
`

// ============================================
// TOUR DAYS - SINGLE OPERATIONS
// File: app/api/tours/days/[id]/route.ts
// ============================================

// GET - Get single day with activities
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params
    if (!(await dayInOrg(supabase, orgId, id))) {
      return NextResponse.json({ success: false, error: 'Day not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('tour_days')
      .select(DAY_SELECT)
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Day not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { ...data, activities: [] }
    })

  } catch (error) {
    console.error('Error in day GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update day
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params
    if (!(await dayInOrg(supabase, orgId, id))) {
      return NextResponse.json({ success: false, error: 'Day not found' }, { status: 404 })
    }
    const body = await request.json()

    const updateData: any = {}
    
    if (body.day_number !== undefined) updateData.day_number = body.day_number
    if (body.city !== undefined) updateData.city = body.city
    if (body.accommodation_id !== undefined) updateData.accommodation_id = body.accommodation_id
    if (body.breakfast_included !== undefined) updateData.breakfast_included = body.breakfast_included
    if (body.lunch_meal_id !== undefined) updateData.lunch_meal_id = body.lunch_meal_id
    if (body.dinner_meal_id !== undefined) updateData.dinner_meal_id = body.dinner_meal_id
    if (body.guide_required !== undefined) updateData.guide_required = body.guide_required
    if (body.guide_id !== undefined) updateData.guide_id = body.guide_id
    if (body.notes !== undefined) updateData.notes = body.notes

    const foreign = await foreignRateIds(supabase, orgId, [updateData.accommodation_id, updateData.lunch_meal_id, updateData.dinner_meal_id, updateData.guide_id])
    if (foreign.length) {
      return NextResponse.json({ success: false, error: "A rate on this day is not this company's", rate_ids: foreign }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tour_days')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating day:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update day' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Day updated successfully'
    })

  } catch (error) {
    console.error('Error in day PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete day
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params
    if (!(await dayInOrg(supabase, orgId, id))) {
      return NextResponse.json({ success: false, error: 'Day not found' }, { status: 404 })
    }

    // A legacy day has no activities to delete: tour_day_activities is the
    // tour manager's, keyed by template_id — deleting by template_id = this
    // day's tour_id matched nothing (a tour is no template).

    // Delete day
    const { error } = await supabase
      .from('tour_days')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting day:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete day' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Day deleted successfully'
    })

  } catch (error) {
    console.error('Error in day DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}