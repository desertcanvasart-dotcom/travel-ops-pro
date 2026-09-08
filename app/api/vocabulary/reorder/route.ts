// POST /api/vocabulary/reorder — { kind, ids: [...] } sets rank 1..n in the
// given order. Owner/admin only; the org_id + kind filters keep a stray id
// from another list untouched.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isVocabularyKind } from '@/lib/vocabulary'
import { vocabAuth } from '../route'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await vocabAuth(true)
    if (auth instanceof NextResponse) return auth
    const { supabase, orgId } = auth

    const body = await request.json().catch(() => ({})) as { kind?: unknown; ids?: unknown }
    if (!isVocabularyKind(body.kind)) return NextResponse.json({ success: false, error: 'Unknown vocabulary kind' }, { status: 400 })
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (ids.length === 0) return NextResponse.json({ success: false, error: 'ids are required' }, { status: 400 })

    const now = new Date().toISOString()
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from('org_vocabularies')
        .update({ rank: i + 1, updated_at: now })
        .eq('id', ids[i])
        .eq('org_id', orgId)
        .eq('kind', body.kind)
      if (error) throw error
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('reorder vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
