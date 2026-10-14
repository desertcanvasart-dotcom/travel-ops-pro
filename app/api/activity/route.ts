// GET /api/activity — the audit trail, manager and above (a read; the
// /activity page is open to managers and a blocked API under an open page
// is theatre in the other direction).
// Filters: user_email (substring), entity (substring), action, from/to dates.
// The dates are the VIEWER's days: the page sends its time zone (`tz`) and the
// bounds are that zone's midnights (lib/activity-day-range), because the
// table shows local times. Page-walked by the UI; capped page size.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, requireRole, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { dayRangeIn } from '@/lib/activity-day-range'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const p = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(p.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') || '50')))

    let query = admin
      .from('activity_log')
      .select('id, user_id, user_email, method, path, action, entity_type, entity_id, ip, detail, created_at', { count: 'exact' })
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
    const { gte, lt } = dayRangeIn(p.get('from'), p.get('to'), p.get('tz'))
    if (gte) query = query.gte('created_at', gte)
    if (lt) query = query.lt('created_at', lt)

    const { data, count, error } = await query
    if (error) throw error

    // "Who" for a row with no email: the person's profile name or email, so
    // the column never falls back to the log row's own id.
    const rows = (data ?? []) as Array<{ user_id: string; user_email: string | null }>
    const missing = [...new Set(rows.filter(r => !r.user_email && r.user_id).map(r => r.user_id))]
    const names = new Map<string, string>()
    if (missing.length > 0) {
      const { data: profiles } = await admin.from('user_profiles').select('id, email, full_name').in('id', missing)
      for (const pr of (profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) {
        const label = pr.email || pr.full_name
        if (label) names.set(pr.id, label)
      }
    }
    return NextResponse.json({
      success: true,
      data: rows.map(r => ({ ...r, user_label: r.user_email || names.get(r.user_id) || null })),
      pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to load activity') },
      { status: 500 }
    )
  }
}
