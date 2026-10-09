// ============================================
// GET /api/templates/analytics
// Template usage analytics: top templates, channel mix, 30-day send stats
// (from template_send_log, which /api/templates/send already populates),
// and pending scheduled-send count.
//
// Ported from the sibling app (autoura-saas). Service-role reads, every one
// scoped to the caller's org (message_templates / template_send_log org_id,
// migration 20261117); ordered by sent_at (ours' log timestamp).
// ============================================

import { NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { visibleToOrg, withOrgCopies } from '@/lib/templates/template-scope'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Send analytics is operational reporting, not something a read-only viewer
    // needs — manager and above, matching the other analytics surfaces.
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // The templates this org sees: its own, and the shared defaults it has
    // not replaced with a copy (lib/templates/template-scope).
    const { data: visibleRows } = await supabaseAdmin
      .from('message_templates')
      .select('id, name, channel, org_id, source_template_id')
      .eq('is_active', true)
      .or(visibleToOrg(orgId))
    const visible = withOrgCopies((visibleRows ?? []) as Array<{ id: string; name: string; channel: string; org_id: string | null; source_template_id: string | null }>, orgId)
    const totalTemplates = visible.length
    const allTemplates = visible

    // Top templates by THIS org's sends. usage_count / last_used_at sit on the
    // template row, which a shared default shares with every org — each org's
    // "top templates" counted the others' sends too.
    // Every sent row, paged (PostgREST returns at most 1000 per request, so one
    // read silently undercounted a busy org); failures are not usage.
    const orgSends: Array<{ template_id: string; sent_at: string | null }> = []
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabaseAdmin
        .from('template_send_log')
        .select('template_id, sent_at')
        .eq('org_id', orgId)
        .eq('status', 'sent')
        .not('template_id', 'is', null)
        .order('sent_at', { ascending: true })
        .range(from, from + 999)
      orgSends.push(...((page ?? []) as Array<{ template_id: string; sent_at: string | null }>))
      if (!page || page.length < 1000) break
    }
    // Sends of a shared default this org later copied count for the copy —
    // they were the org's own sends of that message.
    const copyOf = new Map<string, string>()
    for (const r of (visibleRows ?? []) as Array<{ id: string; org_id: string | null; source_template_id: string | null }>) {
      if (r.org_id === orgId && r.source_template_id) copyOf.set(r.source_template_id, r.id)
    }
    const usage = new Map<string, { count: number; last: string | null }>()
    for (const r of orgSends) {
      const id = copyOf.get(r.template_id) ?? r.template_id
      const u = usage.get(id) ?? { count: 0, last: null }
      u.count++
      if (r.sent_at && (!u.last || r.sent_at > u.last)) u.last = r.sent_at
      usage.set(id, u)
    }
    const topTemplates = visible
      .map(t => ({ id: t.id, name: t.name, channel: t.channel, usage_count: usage.get(t.id)?.count ?? 0, last_used_at: usage.get(t.id)?.last ?? null }))
      .filter(t => t.usage_count > 0)
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 5)

    const channelCounts = { email: 0, whatsapp: 0, sms: 0, both: 0 }
    allTemplates?.forEach((t: any) => {
      if (t.channel in channelCounts) channelCounts[t.channel as keyof typeof channelCounts]++
    })

    // Recent sends
    const { data: recentSends } = await supabaseAdmin
      .from('template_send_log')
      .select('id, channel, status, sent_at, template:message_templates(name)')
      // This org's sends only (template_send_log.org_id, migration 20261117).
      .eq('org_id', orgId)
      .order('sent_at', { ascending: false })
      .limit(10)

    // Last-30-day send statistics
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Counted by the database, not by fetching rows (a fetch stops at 1000).
    const since = thirtyDaysAgo.toISOString()
    const countSends = async (filter: { status?: string; channel?: string }) => {
      let q = supabaseAdmin
        .from('template_send_log')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('sent_at', since)
      if (filter.status) q = q.eq('status', filter.status)
      if (filter.channel) q = q.eq('channel', filter.channel)
      const { count } = await q
      return count ?? 0
    }
    const [totalSent, successful, failed, email, whatsapp, sms] = await Promise.all([
      countSends({}), countSends({ status: 'sent' }), countSends({ status: 'failed' }),
      countSends({ channel: 'email' }), countSends({ channel: 'whatsapp' }), countSends({ channel: 'sms' }),
    ])
    const stats = { totalSent, successful, failed, byChannel: { email, whatsapp, sms } }

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalTemplates: totalTemplates || 0,
          totalSentLast30Days: stats.totalSent,
          successRate: stats.totalSent > 0 ? Math.round((stats.successful / stats.totalSent) * 100) : 0,
        },
        topTemplates: topTemplates || [],
        channelDistribution: channelCounts,
        sendStats: stats,
        recentSends: recentSends || [],
      },
    })
  } catch (error) {
    console.error('Template analytics error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
