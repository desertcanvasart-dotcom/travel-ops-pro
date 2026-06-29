// ============================================
// GET /api/templates/analytics
// Template usage analytics: top templates, channel mix, 30-day send stats
// (from template_send_log, which /api/templates/send already populates),
// and pending scheduled-send count.
//
// Ported from the sibling app (autoura-saas). Adapted to ours: single-org
// service-role aggregation (template_send_log is unscoped here) and ordering
// by sent_at (ours' log timestamp).
// ============================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Top templates by usage
    const { data: topTemplates } = await supabaseAdmin
      .from('message_templates')
      .select('id, name, channel, usage_count, last_used_at')
      .eq('is_active', true)
      .order('usage_count', { ascending: false })
      .limit(5)

    // Total active templates
    const { count: totalTemplates } = await supabaseAdmin
      .from('message_templates')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    // Channel distribution
    const { data: allTemplates } = await supabaseAdmin
      .from('message_templates')
      .select('channel')
      .eq('is_active', true)

    const channelCounts = { email: 0, whatsapp: 0, sms: 0, both: 0 }
    allTemplates?.forEach((t: any) => {
      if (t.channel in channelCounts) channelCounts[t.channel as keyof typeof channelCounts]++
    })

    // Recent sends
    const { data: recentSends } = await supabaseAdmin
      .from('template_send_log')
      .select('id, channel, status, sent_at, template:message_templates(name)')
      .order('sent_at', { ascending: false })
      .limit(10)

    // Last-30-day send statistics
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: sendStats } = await supabaseAdmin
      .from('template_send_log')
      .select('status, channel')
      .gte('sent_at', thirtyDaysAgo.toISOString())

    const stats = {
      totalSent: 0,
      successful: 0,
      failed: 0,
      byChannel: { email: 0, whatsapp: 0, sms: 0 },
    }
    sendStats?.forEach((s: any) => {
      stats.totalSent++
      if (s.status === 'sent') stats.successful++
      if (s.status === 'failed') stats.failed++
      if (s.channel in stats.byChannel) stats.byChannel[s.channel as keyof typeof stats.byChannel]++
    })

    // Pending scheduled sends
    const { count: pendingScheduled } = await supabaseAdmin
      .from('scheduled_sends')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalTemplates: totalTemplates || 0,
          totalSentLast30Days: stats.totalSent,
          successRate: stats.totalSent > 0 ? Math.round((stats.successful / stats.totalSent) * 100) : 0,
          pendingScheduled: pendingScheduled || 0,
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
