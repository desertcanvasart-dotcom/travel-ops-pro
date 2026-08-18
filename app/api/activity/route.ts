// GET /api/activity — the audit trail, admin/owner only.
// Filters: user_email (substring), entity (substring), action, from/to dates.
// Page-walked by the UI; capped page size.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, requireRole, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireRole(['admin'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const p = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(p.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') || '50')))

    let query = admin
      .from('activity_log')
      .select('id, user_email, method, path, action, entity_type, entity_id, ip, created_at', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    const userEmail = p.get('user_email')
    if (userEmail) query = query.ilike('user_email', `%${userEmail.replace(/[%_]/g, '')}%`)
    const entity = p.get('entity')
    if (entity) query = query.ilike('entity_type', `%${entity.replace(/[%_]/g, '')}%`)
    const action = p.get('action')
    if (action && ['create', 'update', 'delete', 'action'].includes(action)) {
      query = query.eq('action', action)
    }
    const from = p.get('from')
    if (from) query = query.gte('created_at', `${from}T00:00:00Z`)
    const to = p.get('to')
    if (to) query = query.lte('created_at', `${to}T23:59:59Z`)

    const { data, count, error } = await query
    if (error) throw error
    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to load activity') },
      { status: 500 }
    )
  }
}
