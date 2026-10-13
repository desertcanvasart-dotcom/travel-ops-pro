import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import {
  deleteDepartment, findServiceTypeConflict, sanitizeServiceTypes, departmentNameTaken, DUPLICATE_DEPARTMENT_NAME,
} from '@/lib/department-admin'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PUT — rename, redescribe, re-route service types, activate/deactivate.
// Admins and managers may write (the menu shows the page to both).
// DELETE — removes the department. One that members or tasks still point at
// needs ?reassign_to=<department id | none>: they move there first, so past
// work keeps pointing at a real department (see deleteDepartment).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()
    const update: Record<string, unknown> = {}

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
      if (await departmentNameTaken(name, id, orgId)) {
        return NextResponse.json({ success: false, error: DUPLICATE_DEPARTMENT_NAME }, { status: 409 })
      }
      update.name = name
    }
    if ('description' in body) {
      update.description = typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if ('is_active' in body) update.is_active = body.is_active === true
    if ('service_types' in body) {
      const serviceTypes = sanitizeServiceTypes(body.service_types)
      const stillActive = update.is_active !== false
      if (stillActive) {
        const conflict = await findServiceTypeConflict(serviceTypes, id, orgId)
        if (conflict) {
          return NextResponse.json(
            { success: false, error: `Service type already routed to ${conflict}` },
            { status: 400 }
          )
        }
      }
      update.service_types = serviceTypes
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('departments')
      .update(update)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, name, description, service_types, is_active')
      .maybeSingle()

    if (error?.code === '23505') {
      return NextResponse.json({ success: false, error: DUPLICATE_DEPARTMENT_NAME }, { status: 409 })
    }
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Department not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in department PUT:', error)
    return NextResponse.json({ success: false, error: 'Failed to update department' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    // Where the department's members and tasks go: another department's id,
    // or 'none' to leave them without one. Omitted, a referenced department
    // is still refused — nothing is reassigned without the caller saying so.
    const reassign = request.nextUrl.searchParams.get('reassign_to')

    if (!reassign) {
      const [{ count: memberCount }, { count: taskCount }] = await Promise.all([
        // Active members only: a department whose people have all been
        // deactivated needs no target for them (they are cleared with it).
        supabaseAdmin.from('team_members').select('id', { count: 'exact', head: true }).eq('department_id', id).eq('org_id', orgId).eq('is_active', true),
        supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).eq('department_id', id).eq('org_id', orgId),
      ])
      if ((memberCount ?? 0) > 0 || (taskCount ?? 0) > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Department is referenced (${memberCount ?? 0} members, ${taskCount ?? 0} tasks) — choose where they move (reassign_to)`,
            members: memberCount ?? 0,
            tasks: taskCount ?? 0,
          },
          { status: 409 }
        )
      }
    }

    const result = await deleteDepartment(supabaseAdmin, id, reassign && reassign !== 'none' ? reassign : null, orgId)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true, moved: result.moved, unrouted: result.unrouted })
  } catch (error) {
    console.error('Error in department DELETE:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete department' }, { status: 500 })
  }
}
