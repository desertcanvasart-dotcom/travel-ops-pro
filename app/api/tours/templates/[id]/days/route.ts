// ============================================
// TOUR DAY ACTIVITIES API
// File: app/api/tours/templates/[id]/days/route.ts
//
// CRUD for template day activities
// Links to Content Library for auto-pricing
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { templateInOrg } from '@/lib/tours/org-scope'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// Content library items are one company's too (content_library.org_id,
// migration 20261208). This route runs on the service role, so RLS filters
// nothing: an activity may only LINK the template's company's content, and an
// embedded content item of another company is never returned (an activity
// that points at one shows no content — it keeps its own name and city).
// ============================================

/** The content ids among `ids` that are NOT this company's (or do not exist). */
async function foreignContentIds(orgId: string, ids: Array<string | null | undefined>): Promise<string[]> {
  const wanted = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]
  if (wanted.length === 0) return []
  const { data } = await supabaseAdmin.from('content_library').select('id').in('id', wanted).eq('org_id', orgId)
  const own = new Set(((data ?? []) as Array<{ id: string }>).map(r => r.id))
  return wanted.filter(id => !own.has(id))
}

function contentNotFound(ids: string[]) {
  return NextResponse.json({ success: false, error: 'Content item not found', content_ids: ids }, { status: 404 })
}

// tour_day_activities.content_id has no foreign key (20261208), so PostgREST
// cannot embed content_library(...) from an activity — every select that
// tried failed (PGRST200): the day plan never loaded, and adding or editing
// an activity saved it and then answered 500. The content is read with its
// own query and attached as `content_library`: the company's own item, else
// null (an activity that points at another company's item, or a deleted
// one, shows no content — it keeps its own name and city).
const CONTENT_COLUMNS = `
  id, org_id, name, slug, short_description, location, duration, tags,
  content_categories ( id, name, slug, icon )
`

async function withContent<T extends Record<string, any>>(rows: T[], orgId: string): Promise<Array<T & { content_library: Record<string, any> | null }>> {
  const ids = [...new Set(rows.map(r => r.content_id).filter((x): x is string => typeof x === 'string' && x.length > 0))]
  const byId = new Map<string, Record<string, any>>()
  if (ids.length > 0) {
    const { data, error } = await supabaseAdmin.from('content_library').select(CONTENT_COLUMNS).in('id', ids).eq('org_id', orgId)
    if (error) throw error
    for (const c of (data ?? []) as Array<Record<string, any>>) byId.set(c.id, c)
  }
  return rows.map(r => ({ ...r, content_library: (r.content_id && byId.get(r.content_id)) || null }))
}

// ============================================
// GET - List all days/activities for a template
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await templateInOrg(supabaseAdmin, orgId, templateId))) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    // Fetch template info
    const { data: template, error: templateError } = await supabaseAdmin
      .from('tour_templates')
      .select('id, template_name, template_code, duration_days')
      .eq('org_id', orgId)
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      )
    }

    // Fetch all activities with content library data
    const { data: activities, error: activitiesError } = await supabaseAdmin
      .from('tour_day_activities')
      .select(`
        id,
        day_number,
        sequence_order,
        content_id,
        activity_type,
        activity_name,
        city,
        duration_hours,
        start_time,
        is_optional,
        is_included,
        requires_guide,
        notes,
        internal_notes,
        created_at
      `)
      .eq('template_id', templateId)
      .order('day_number')
      .order('sequence_order')

    if (activitiesError) {
      console.error('Error fetching activities:', activitiesError)
      return NextResponse.json(
        { success: false, error: clientMessage(activitiesError, 'Internal server error') },
        { status: 500 }
      )
    }

    // Group activities by day
    const dayMap = new Map<number, any[]>()
    for (let d = 1; d <= template.duration_days; d++) {
      dayMap.set(d, [])
    }

    for (const activity of await withContent((activities || []) as Array<Record<string, any>>, orgId)) {
      const dayNum = activity.day_number
      if (!dayMap.has(dayNum)) {
        dayMap.set(dayNum, [])
      }
      dayMap.get(dayNum)!.push(activity)
    }

    // Convert to array format
    const days = Array.from(dayMap.entries()).map(([dayNumber, activities]) => ({
      day_number: dayNumber,
      activities
    }))

    return NextResponse.json({
      success: true,
      data: {
        template_id: templateId,
        template_name: template.template_name,
        duration_days: template.duration_days,
        days,
        total_activities: activities?.length || 0
      }
    })

  } catch (error: any) {
    console.error('❌ Error fetching days:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// ============================================
// POST - Add activity to a day
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await templateInOrg(supabaseAdmin, orgId, templateId))) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }
    const body = await request.json()

    const {
      day_number,
      content_id,
      activity_type,
      activity_name,
      city,
      duration_hours,
      start_time,
      is_optional = false,
      is_included = true,
      requires_guide = true,
      notes,
      internal_notes,
      // Batch mode
      activities // Array of activities to add
    } = body

    // Batch insert mode
    if (activities && Array.isArray(activities)) {
      const foreignBatch = await foreignContentIds(orgId, activities.map((a: { content_id?: string | null }) => a?.content_id))
      if (foreignBatch.length) return contentNotFound(foreignBatch)
      const activitiesToInsert = activities.map((act, index) => ({
        template_id: templateId,
        day_number: act.day_number,
        sequence_order: act.sequence_order || index + 1,
        content_id: act.content_id || null,
        activity_type: act.activity_type,
        activity_name: act.activity_name,
        city: act.city || null,
        duration_hours: act.duration_hours || null,
        start_time: act.start_time || null,
        is_optional: act.is_optional ?? false,
        is_included: act.is_included ?? true,
        requires_guide: act.requires_guide ?? true,
        notes: act.notes || null,
        internal_notes: act.internal_notes || null
      }))

      const { data: inserted, error } = await supabaseAdmin
        .from('tour_day_activities')
        .insert(activitiesToInsert)
        .select()

      if (error) {
        console.error('Error batch inserting activities:', error)
        return NextResponse.json(
          { success: false, error: clientMessage(error, 'Internal server error') },
          { status: 500 }
        )
      }

      // Mark template as using day builder
      await supabaseAdmin
        .from('tour_templates')
        .update({ uses_day_builder: true })
        .eq('org_id', orgId)
        .eq('id', templateId)

      return NextResponse.json({
        success: true,
        data: inserted,
        message: `Added ${inserted?.length || 0} activities`
      }, { status: 201 })
    }

    // Single insert mode
    if (!day_number || !activity_type || !activity_name) {
      return NextResponse.json(
        { success: false, error: 'day_number, activity_type, and activity_name are required' },
        { status: 400 }
      )
    }

    // Get next sequence order for this day
    const { data: existing } = await supabaseAdmin
      .from('tour_day_activities')
      .select('sequence_order')
      .eq('template_id', templateId)
      .eq('day_number', day_number)
      .order('sequence_order', { ascending: false })
      .limit(1)

    const nextSequence = (existing?.[0]?.sequence_order || 0) + 1

    // If content_id provided, fetch content info to auto-fill fields
    let contentData = null
    if (content_id) {
      const { data } = await supabaseAdmin
        .from('content_library')
        .select('name, location, duration')
        .eq('id', content_id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!data) return contentNotFound([content_id])
      contentData = data
    }

    const { data: activity, error } = await supabaseAdmin
      .from('tour_day_activities')
      .insert({
        template_id: templateId,
        day_number,
        sequence_order: nextSequence,
        content_id: content_id || null,
        activity_type,
        activity_name: activity_name || contentData?.name,
        city: city || contentData?.location || null,
        duration_hours: duration_hours || null,
        start_time: start_time || null,
        is_optional,
        is_included,
        requires_guide,
        notes,
        internal_notes
      })
      .select('*')
      .single()

    if (error) {
      console.error('Error inserting activity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    // Mark template as using day builder
    await supabaseAdmin
      .from('tour_templates')
      .update({ uses_day_builder: true })
      .eq('org_id', orgId)
      .eq('id', templateId)

    return NextResponse.json({
      success: true,
      data: (await withContent([activity], orgId))[0]
    }, { status: 201 })

  } catch (error: any) {
    console.error('❌ Error adding activity:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// ============================================
// PATCH - Update activity or reorder
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await templateInOrg(supabaseAdmin, orgId, templateId))) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }
    const body = await request.json()

    const { activity_id, ...updates } = body

    // Reorder mode: update multiple activities' sequence
    if (body.reorder && Array.isArray(body.reorder)) {
      const updates = body.reorder.map((item: { id: string; sequence_order: number; day_number?: number }) => 
        supabaseAdmin
          .from('tour_day_activities')
          .update({ 
            sequence_order: item.sequence_order,
            ...(item.day_number ? { day_number: item.day_number } : {})
          })
          .eq('id', item.id)
          .eq('template_id', templateId)
      )

      await Promise.all(updates)

      return NextResponse.json({
        success: true,
        message: `Reordered ${body.reorder.length} activities`
      })
    }

    // Single update mode
    if (!activity_id) {
      return NextResponse.json(
        { success: false, error: 'activity_id is required' },
        { status: 400 }
      )
    }

    // Remove fields that shouldn't be updated directly
    delete updates.id
    delete updates.template_id
    delete updates.created_at
    if (updates.content_id) {
      const foreignPatch = await foreignContentIds(orgId, [updates.content_id])
      if (foreignPatch.length) return contentNotFound(foreignPatch)
    }

    const { data: activity, error } = await supabaseAdmin
      .from('tour_day_activities')
      .update(updates)
      .eq('id', activity_id)
      .eq('template_id', templateId)
      .select('*')
      .single()

    if (error) {
      console.error('Error updating activity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: (await withContent([activity], orgId))[0]
    })

  } catch (error: any) {
    console.error('❌ Error updating activity:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// ============================================
// DELETE - Remove activity
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await templateInOrg(supabaseAdmin, orgId, templateId))) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }
    const { searchParams } = new URL(request.url)
    
    const activityId = searchParams.get('activity_id')
    const dayNumber = searchParams.get('day_number')
    const clearAll = searchParams.get('clear_all') === 'true'

    // Clear all activities for template
    if (clearAll) {
      const { error } = await supabaseAdmin
        .from('tour_day_activities')
        .delete()
        .eq('template_id', templateId)

      if (error) {
        return NextResponse.json(
          { success: false, error: clientMessage(error, 'Internal server error') },
          { status: 500 }
        )
      }

      // Reset uses_day_builder flag
      await supabaseAdmin
        .from('tour_templates')
        .update({ uses_day_builder: false })
        .eq('org_id', orgId)
        .eq('id', templateId)

      return NextResponse.json({
        success: true,
        message: 'Cleared all activities'
      })
    }

    // Clear all activities for a specific day
    if (dayNumber && !activityId) {
      const { error } = await supabaseAdmin
        .from('tour_day_activities')
        .delete()
        .eq('template_id', templateId)
        .eq('day_number', parseInt(dayNumber))

      if (error) {
        return NextResponse.json(
          { success: false, error: clientMessage(error, 'Internal server error') },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `Cleared activities for day ${dayNumber}`
      })
    }

    // Delete single activity
    if (!activityId) {
      return NextResponse.json(
        { success: false, error: 'activity_id is required' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('tour_day_activities')
      .delete()
      .eq('id', activityId)
      .eq('template_id', templateId)

    if (error) {
      console.error('Error deleting activity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    // Check if any activities remain
    const { count } = await supabaseAdmin
      .from('tour_day_activities')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', templateId)

    // If no activities, reset flag
    if (count === 0) {
      await supabaseAdmin
        .from('tour_templates')
        .update({ uses_day_builder: false })
        .eq('org_id', orgId)
        .eq('id', templateId)
    }

    return NextResponse.json({
      success: true,
      message: 'Activity deleted'
    })

  } catch (error: any) {
    console.error('❌ Error deleting activity:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
