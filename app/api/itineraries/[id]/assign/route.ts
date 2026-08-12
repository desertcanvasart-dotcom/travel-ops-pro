// ============================================
// API: /api/itineraries/[id]/assign — the trip's named internal owner
// ============================================
// itineraries already had assigned_guide_id, assigned_vehicle_id and friends,
// but every one of those is a RESOURCE BOOKED FOR THE CLIENT. None of them says
// who inside the company is responsible for the trip. That is what this sets.
//
// Assigning notifies the new owner in-app (and by email, best-effort), because
// an ownership change nobody is told about is just a database column.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createNotification } from '@/lib/notifications'
import { clientMessage } from '@/lib/api-errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

const ITINERARY_FIELDS =
  'id, itinerary_code, trip_name, client_name, start_date, end_date, status, assigned_to, assigned_at'

/** GET — who owns this trip right now. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('itineraries')
      .select(`${ITINERARY_FIELDS}, assignee:team_members!itineraries_assigned_to_fkey(id, name, email, role)`)
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching trip assignee:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch assignee' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: unknown) {
    console.error('Trip assignee GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT — assign the trip to a team member, or clear the assignment with
 * `{ "assigned_to": null }`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    // Distinguish "clear it" (null) from "you forgot the field" (undefined).
    // Silently treating a missing key as an unassign would wipe ownership on a
    // malformed request.
    if (!('assigned_to' in body)) {
      return NextResponse.json(
        { success: false, error: 'assigned_to is required (pass null to unassign)' },
        { status: 400 }
      )
    }

    const assignedTo: string | null = body.assigned_to ?? null

    // Org gate on the trip itself — this is the tenancy boundary for the write.
    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select(ITINERARY_FIELDS)
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (itinError) {
      console.error('Error loading itinerary for assignment:', itinError)
      return NextResponse.json({ success: false, error: 'Failed to load itinerary' }, { status: 500 })
    }
    if (!itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // Validate the assignee BEFORE writing: the FK would catch a bogus id, but
    // it would not catch assigning work to someone who has left (is_active
    // false) — a trip owned by a deactivated account is an invisible orphan.
    let assignee: { id: string; name: string; email: string | null } | null = null
    if (assignedTo) {
      const { data: member } = await supabaseAdmin
        .from('team_members')
        .select('id, name, email, is_active')
        .eq('id', assignedTo)
        .maybeSingle()

      if (!member) {
        return NextResponse.json({ success: false, error: 'Team member not found' }, { status: 404 })
      }
      if (member.is_active === false) {
        return NextResponse.json(
          {
            success: false,
            error: `${member.name} is deactivated and cannot own a trip. Reactivate them, or pick someone else.`,
          },
          { status: 422 }
        )
      }
      assignee = { id: member.id, name: member.name, email: member.email }
    }

    const previousAssignee = (itinerary as { assigned_to?: string | null }).assigned_to ?? null
    const unchanged = previousAssignee === assignedTo

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('itineraries')
      .update({
        assigned_to: assignedTo,
        // Cleared alongside the assignee so a stale timestamp can't imply an
        // ownership that no longer exists.
        assigned_at: assignedTo ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select(`${ITINERARY_FIELDS}, assignee:team_members!itineraries_assigned_to_fkey(id, name, email, role)`)
      .single()

    if (updateError) {
      console.error('Error assigning itinerary:', updateError)
      return NextResponse.json(
        { success: false, error: clientMessage(updateError, 'Failed to assign the trip') },
        { status: 500 }
      )
    }

    // Notify only on a real change of owner. Re-saving the same assignee (a
    // double click, an unrelated edit) must not fire a fresh alert.
    let notified = false
    if (assignee && !unchanged) {
      const trip = itinerary as Record<string, unknown>
      const label = (trip.trip_name as string) || (trip.itinerary_code as string) || 'a trip'
      const dates = trip.start_date
        ? ` (${trip.start_date}${trip.end_date ? ` → ${trip.end_date}` : ''})`
        : ''

      const result = await createNotification({
        team_member_id: assignee.id,
        type: 'trip_assigned',
        title: `You now own ${trip.itinerary_code || label}`,
        message: `${label}${dates} for ${trip.client_name || 'a client'} has been assigned to you. You are the point of contact for this trip end to end.`,
        link: `/itineraries/${id}`,
        related_itinerary_id: id,
      })
      notified = result.success
    }

    return NextResponse.json({
      success: true,
      data: updated,
      // The caller should know whether the person was actually told, not just
      // whether the column changed.
      notified,
      unchanged,
    })
  } catch (error: unknown) {
    console.error('Trip assign PUT error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
