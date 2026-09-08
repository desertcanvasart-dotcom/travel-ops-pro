// ============================================
// /api/vocabulary/[id] — one entry
// ============================================
// PATCH  — { label?, label_ja?, description?, behavior?, meta?, is_active?, rank? }
// DELETE — remove the entry (a kind never drops below its minimum)
// Owner/admin only; every query is scoped by org_id (service-role client).

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  isVocabularyKind,
  validateVocabularyItem,
  wouldBreakMinimum,
  VOCABULARY_KIND_INFO,
} from '@/lib/vocabulary'
import { COLS, vocabAuth } from '../route'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await vocabAuth(true)
    if (auth instanceof NextResponse) return auth
    const { supabase, orgId } = auth

    const { id } = await params
    const { data: current } = await supabase.from('org_vocabularies').select(COLS).eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!current || !isVocabularyKind(current.kind)) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('label' in body) patch.label = String(body.label ?? '').trim()
    if ('label_ja' in body) patch.label_ja = String(body.label_ja ?? '').trim() || null
    if ('description' in body) patch.description = String(body.description ?? '').trim() || null
    if ('behavior' in body) patch.behavior = body.behavior ? String(body.behavior) : null
    if ('meta' in body) patch.meta = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) ? body.meta : {}
    if ('rank' in body) patch.rank = Number(body.rank) || 0
    if ('is_active' in body) patch.is_active = Boolean(body.is_active)

    const merged = {
      kind: current.kind,
      key: current.key,
      label: (patch.label as string | undefined) ?? current.label,
      behavior: ('behavior' in patch ? patch.behavior : current.behavior) as string | null,
      meta: ('meta' in patch ? patch.meta : current.meta) as Record<string, unknown>,
    }
    const verdict = validateVocabularyItem(merged)
    if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })

    if (patch.is_active === false && current.is_active) {
      const { data: siblings } = await supabase.from('org_vocabularies').select('id, is_active').eq('org_id', orgId).eq('kind', current.kind)
      if (wouldBreakMinimum(current.kind, siblings ?? [], id)) {
        return NextResponse.json({ success: false, error: `${VOCABULARY_KIND_INFO[current.kind].title} need at least ${VOCABULARY_KIND_INFO[current.kind].minItems} active` }, { status: 409 })
      }
    }

    const { data, error } = await supabase.from('org_vocabularies').update(patch).eq('id', id).eq('org_id', orgId).select(COLS).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PATCH vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const auth = await vocabAuth(true)
    if (auth instanceof NextResponse) return auth
    const { supabase, orgId } = auth

    const { id } = await params
    const { data: current } = await supabase.from('org_vocabularies').select('id, kind').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!current || !isVocabularyKind(current.kind)) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 })

    const { data: siblings } = await supabase.from('org_vocabularies').select('id, is_active').eq('org_id', orgId).eq('kind', current.kind)
    if (wouldBreakMinimum(current.kind, siblings ?? [], id)) {
      return NextResponse.json({ success: false, error: `${VOCABULARY_KIND_INFO[current.kind].title} need at least ${VOCABULARY_KIND_INFO[current.kind].minItems} active — hide or add another first` }, { status: 409 })
    }

    const { error } = await supabase.from('org_vocabularies').delete().eq('id', id).eq('org_id', orgId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
