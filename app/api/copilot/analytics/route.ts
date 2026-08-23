// ============================================
// GET /api/copilot/analytics?period=30d
// Copilot performance: volume, accept rate, edit rate, RAG hit rate,
// top-retrieved knowledge, per-user breakdown. Admin / manager only.
//
// Ported from the sibling app (autoura-saas). Adapted to ours: single-org
// (communication_drafts has no org_id), service-role aggregation like our
// other copilot routes, and per-user emails resolved from user_profiles.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Period = '7d' | '30d' | '90d' | 'all'

function periodStartISO(period: Period): string | null {
  const now = Date.now()
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : null
  if (days === null) return null
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function GET(request: NextRequest) {
  const denied = await requireRole(['admin', 'manager', 'owner'])
  if (denied) return denied

  const period = (request.nextUrl.searchParams.get('period') || '30d') as Period
  const startIso = periodStartISO(period)

  // ---------- Pull all drafts for the period ----------
  let draftsQuery = supabaseAdmin
    .from('communication_drafts')
    .select('id, status, send_channel, ai_flags, ai_confidence, context_used, was_edited, reviewed_by, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(5000)

  if (startIso) draftsQuery = draftsQuery.gte('created_at', startIso)

  const { data: drafts, error: draftsErr } = await draftsQuery
  if (draftsErr) return NextResponse.json({ success: false, error: clientMessage(draftsErr, 'Internal server error') }, { status: 500 })

  const rows = (drafts || []) as any[]
  const total = rows.length

  // ---------- Totals by status ----------
  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1

  const sentCount = byStatus['sent'] || 0
  const approvedCount = (byStatus['approved'] || 0) + sentCount
  const rejectedCount = byStatus['rejected'] || 0
  const pendingCount = byStatus['pending'] || 0

  // Accept rate: approved OR sent, out of all reviewed (approved + rejected + sent)
  const reviewed = approvedCount + rejectedCount
  const acceptRate = reviewed > 0 ? approvedCount / reviewed : 0

  // ---------- By channel ----------
  const byChannel: Record<string, { generated: number; sent: number }> = { whatsapp: { generated: 0, sent: 0 }, email: { generated: 0, sent: 0 } }
  for (const r of rows) {
    const ch = r.send_channel || 'whatsapp'
    if (!byChannel[ch]) byChannel[ch] = { generated: 0, sent: 0 }
    byChannel[ch].generated += 1
    if (r.status === 'sent') byChannel[ch].sent += 1
  }

  // ---------- Instrumented rows ----------
  // Tone, RAG usage and pre-generation are only knowable for drafts written
  // after the app started recording them. Rows from before that are not
  // "tone unknown, no retrieval" — they are unmeasured, and averaging them in
  // would understate all three for months. Rates below use this denominator.
  const instrumented = rows.filter((r) => typeof (r.ai_flags as any)?.pregenerated === 'boolean')

  // ---------- By tone ----------
  const byTone: Record<string, number> = {}
  for (const r of instrumented) {
    const tone = (r.ai_flags as any)?.tone || 'unknown'
    byTone[tone] = (byTone[tone] || 0) + 1
  }

  // ---------- By day (bucket into YYYY-MM-DD) ----------
  const byDayMap = new Map<string, { generated: number; sent: number }>()
  for (const r of rows) {
    const day = (r.created_at || '').slice(0, 10)
    if (!day) continue
    if (!byDayMap.has(day)) byDayMap.set(day, { generated: 0, sent: 0 })
    const bucket = byDayMap.get(day)!
    bucket.generated += 1
    if (r.status === 'sent') bucket.sent += 1
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  // ---------- Confidence distribution ----------
  const confidence = { high: 0, medium: 0, low: 0, unknown: 0 }
  for (const r of rows) {
    const c = (r.ai_confidence || 'unknown') as keyof typeof confidence
    confidence[c] = (confidence[c] || 0) + 1
  }

  // ---------- Edit rate (fraction of SENT drafts that were edited) ----------
  const sentRows = rows.filter((r) => r.status === 'sent')
  const editedCount = sentRows.filter((r) => r.was_edited).length
  const editRate = sentRows.length > 0 ? editedCount / sentRows.length : 0

  // ---------- RAG hit rate (fraction with at least one retrieval match) ----------
  let withRetrieval = 0
  const knowledgeUsage = new Map<string, number>()
  for (const r of instrumented) {
    const retrieved = (r.context_used as any)?.retrieved
    if (Array.isArray(retrieved) && retrieved.length > 0) {
      withRetrieval += 1
      for (const item of retrieved) {
        if (item?.id) knowledgeUsage.set(item.id, (knowledgeUsage.get(item.id) || 0) + 1)
      }
    }
  }
  const ragHitRate = instrumented.length > 0 ? withRetrieval / instrumented.length : 0

  // ---------- Pre-generated ratio ----------
  let pregenerated = 0
  for (const r of instrumented) {
    if ((r.ai_flags as any)?.pregenerated) pregenerated += 1
  }
  const pregeneratedRate = instrumented.length > 0 ? pregenerated / instrumented.length : 0

  // ---------- Top-retrieved knowledge entries ----------
  let topKnowledge: Array<{ id: string; title: string | null; source_type: string; times_used: number }> = []
  if (knowledgeUsage.size > 0) {
    const topIds = Array.from(knowledgeUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id)

    const { data: entries } = await supabaseAdmin
      .from('copilot_knowledge')
      .select('id, title, source_type, query_text')
      .in('id', topIds)

    topKnowledge = topIds.map((id) => {
      const e = (entries || []).find((x: any) => x.id === id)
      const fallbackTitle = e?.query_text ? e.query_text.slice(0, 80) : null
      return {
        id,
        title: (e?.title as string | null) ?? fallbackTitle,
        source_type: (e?.source_type as string) || 'unknown',
        times_used: knowledgeUsage.get(id) || 0,
      }
    })
  }

  // ---------- Per-user breakdown (reviewed_by) ----------
  const perUserMap = new Map<string, { generated: number; sent: number; approved: number; rejected: number }>()
  for (const r of rows) {
    if (!r.reviewed_by) continue
    const key = r.reviewed_by
    if (!perUserMap.has(key)) perUserMap.set(key, { generated: 0, sent: 0, approved: 0, rejected: 0 })
    const entry = perUserMap.get(key)!
    entry.generated += 1
    if (r.status === 'sent') entry.sent += 1
    if (r.status === 'approved') entry.approved += 1
    if (r.status === 'rejected') entry.rejected += 1
  }

  let perUser: Array<{ user_id: string; email: string | null; generated: number; sent: number; accept_rate: number }> = []
  if (perUserMap.size > 0) {
    const userIds = Array.from(perUserMap.keys())
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, full_name')
      .in('id', userIds)

    perUser = userIds.map((id) => {
      const stats = perUserMap.get(id)!
      const p = (profiles || []).find((x: any) => x.id === id)
      const reviewedU = stats.sent + stats.approved + stats.rejected
      const approvedU = stats.sent + stats.approved
      const acceptRate = reviewedU > 0 ? approvedU / reviewedU : 0
      return {
        user_id: id,
        email: (p?.email as string) || (p?.full_name as string) || null,
        generated: stats.generated,
        sent: stats.sent,
        accept_rate: acceptRate,
      }
    }).sort((a, b) => b.generated - a.generated)
  }

  // ---------- Knowledge base volume ----------
  const { count: kbTotal } = await supabaseAdmin
    .from('copilot_knowledge')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('parent_id', null)

  return NextResponse.json({
    success: true,
    period,
    summary: {
      total_generated: total,
      total_sent: sentCount,
      total_dismissed: rejectedCount,
      total_pending: pendingCount,
      accept_rate: acceptRate,
      edit_rate: editRate,
      rag_hit_rate: ragHitRate,
      pregenerated_rate: pregeneratedRate,
      // How many drafts the three rates above could be measured on.
      measured_drafts: instrumented.length,
      kb_entries: kbTotal || 0,
    },
    confidence,
    by_channel: byChannel,
    by_tone: byTone,
    by_day: byDay,
    top_knowledge: topKnowledge,
    per_user: perUser,
  })
}
