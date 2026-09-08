// ============================================
// /api/vocabulary — the agency's own words (white-label)
// ============================================
// GET  — every entry of every kind for the caller's org (hidden included; the
//        hook filters). Feeds all dropdowns, one fetch per session.
// POST — add an entry { kind, label, label_ja?, key?, description?, behavior?, meta? }
//
// Reads are for any signed-in user; writes are owner/admin only. The server
// client is service-role, so every query is explicitly scoped by org_id.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { createServerClient } from '@/lib/supabase-server'
import { roleAllows } from '@/lib/auth/roles'
import {
  isVocabularyKind,
  nextRank,
  slugifyKey,
  uniqueKey,
  validateVocabularyItem,
  KEY_PATTERN,
} from '@/lib/vocabulary'

export const dynamic = 'force-dynamic'

export const WRITE_DENIED = 'Only the agency owner or an admin can change the vocabulary. Ask one of them to make the change, or to make you an admin under Settings → User Management.'
export const COLS = 'id, org_id, kind, key, label, label_ja, description, behavior, rank, meta, is_active, created_at, updated_at'

/** Shared auth for the vocabulary routes. Returns a deny response, or the
 *  service-role client + the caller's org id. `write` also gates on owner/admin. */
export async function vocabAuth(write: boolean): Promise<NextResponse | { supabase: SupabaseClient; orgId: string }> {
  const { user, error } = await getAuthenticatedUser()
  if (error || !user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  if (write && !roleAllows(user.role, ['admin'])) {
    return NextResponse.json({ success: false, error: WRITE_DENIED }, { status: 403 })
  }
  const orgId = await getCurrentOrgId()
  if (!orgId) return NextResponse.json({ success: false, error: 'No organization for the current user' }, { status: 403 })
  return { supabase: createServerClient(), orgId }
}

export async function GET() {
  try {
    const auth = await vocabAuth(false)
    if (auth instanceof NextResponse) return auth
    const { supabase, orgId } = auth

    const { data, error } = await supabase
      .from('org_vocabularies')
      .select(COLS)
      .eq('org_id', orgId)
      .order('kind')
      .order('rank')
      .order('label')
    if (error) {
      // 42P01 = migration not applied: empty, and every form keeps its built-in list.
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [] })
      throw error
    }
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    console.error('GET vocabulary error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load vocabulary' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await vocabAuth(true)
    if (auth instanceof NextResponse) return auth
    const { supabase, orgId } = auth

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const kind = String(body.kind ?? '')
    if (!isVocabularyKind(kind)) return NextResponse.json({ success: false, error: 'Unknown vocabulary kind' }, { status: 400 })
    const label = String(body.label ?? '').trim()

    const { data: existing, error: readError } = await supabase
      .from('org_vocabularies')
      .select('id, key, rank, is_active')
      .eq('org_id', orgId)
      .eq('kind', kind)
    if (readError) throw readError

    const requested = String(body.key ?? '').trim()
    const base = requested ? requested : slugifyKey(label)
    if (requested && !KEY_PATTERN.test(requested)) {
      return NextResponse.json({ success: false, error: 'The key must be lowercase letters, digits and underscores' }, { status: 400 })
    }
    const key = requested ? requested : uniqueKey(base, (existing ?? []).map(e => e.key))
    if (requested && (existing ?? []).some(e => e.key === requested)) {
      return NextResponse.json({ success: false, error: `"${requested}" is already used in this list` }, { status: 409 })
    }

    const behavior = kind === 'supplier_type' ? String(body.behavior ?? '') || null : null
    const meta = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) ? body.meta as Record<string, unknown> : {}
    const verdict = validateVocabularyItem({ kind, key, label, behavior, meta })
    if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })

    const { data, error } = await supabase
      .from('org_vocabularies')
      .insert({
        org_id: orgId,
        kind,
        key,
        label,
        label_ja: String(body.label_ja ?? '').trim() || null,
        description: String(body.description ?? '').trim() || null,
        behavior,
        meta,
        rank: nextRank(existing ?? []),
        is_active: true,
      })
      .select(COLS)
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, error: `"${key}" is already used in this list` }, { status: 409 })
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
