// POST /api/vocabulary/reset — { kind } returns one kind to the preset for the
// caller's org: delete the org's entries of that kind, then re-run the SQL
// seed (seed_org_vocabulary) for that kind. Owner/admin only. The org_id comes
// from the server (getCurrentOrgId), never the client, so a caller can only
// reset their own org.

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

    const body = await request.json().catch(() => ({})) as { kind?: unknown }
    if (!isVocabularyKind(body.kind)) return NextResponse.json({ success: false, error: 'Unknown vocabulary kind' }, { status: 400 })

    const { error: delErr } = await supabase.from('org_vocabularies').delete().eq('org_id', orgId).eq('kind', body.kind)
    if (delErr) throw delErr
    const { data, error } = await supabase.rpc('seed_org_vocabulary', { p_org: orgId, p_kind: body.kind })
    if (error) throw error
    return NextResponse.json({ success: true, data: { seeded: data } })
  } catch (error) {
    console.error('reset vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
