// ============================================
// /api/settings/zones/[id] — rename, make default, move, or remove one zone
// ============================================
// PATCH  — { label?, is_default: true?, move?: 'up' | 'down' }. A rename keeps
//          the key, so whatever points at the zone keeps pointing at it.
// DELETE — remove it. The city's default goes last (another zone must be made
//          the default first).
//
// Admins only (the owner clears every gate). Migration 20270123, ported from
// autoura-saas #830.

import { NextRequest, NextResponse } from 'next/server'
import { zoneAuth } from '@/lib/rates/zone-auth'
import { ZONE_COLS, canDeleteZone, validateZone, zonesOfCity } from '@/lib/rates/city-zones'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await zoneAuth(true)
    if (auth instanceof NextResponse) return auth
    const { db: supabase, orgId } = auth

    const { id } = await params
    const { data: all, error: readError } = await supabase.from('city_zones').select('id, city, key, label, is_default, rank').eq('org_id', orgId)
    if (readError) throw readError
    const current = (all ?? []).find(z => z.id === id)
    if (!current) return NextResponse.json({ success: false, error: 'Zone not found' }, { status: 404 })
    const siblings = zonesOfCity(all ?? [], current.city)
    const now = new Date().toISOString()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    if ('label' in body) {
      const verdict = validateZone({ city: current.city, label: body.label }, all ?? [], id)
      if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })
      const { error } = await supabase.from('city_zones').update({ label: verdict.label, updated_at: now }).eq('id', id).eq('org_id', orgId)
      if (error) throw error
    }

    if (body.is_default === true && !current.is_default) {
      // Clear the old default first: the index allows one per city.
      const old = siblings.filter(z => z.is_default).map(z => z.id)
      if (old.length) {
        const { error } = await supabase.from('city_zones').update({ is_default: false, updated_at: now }).eq('org_id', orgId).in('id', old)
        if (error) throw error
      }
      const { error } = await supabase.from('city_zones').update({ is_default: true, updated_at: now }).eq('id', id).eq('org_id', orgId)
      if (error) throw error
    }

    if (body.move === 'up' || body.move === 'down') {
      // Swap ranks with the neighbour among the city's other (non-default) zones.
      const order = siblings.filter(z => !z.is_default).sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
      const at = order.findIndex(z => z.id === id)
      const other = at < 0 ? undefined : order[body.move === 'up' ? at - 1 : at + 1]
      if (other) {
        // Equal ranks would swap to the same order; spread them first.
        const ranks = order.map((_, i) => i + 1)
        const target = new Map(order.map((z, i) => [z.id, ranks[i]]))
        target.set(id, ranks[order.indexOf(other)])
        target.set(other.id, ranks[at])
        for (const z of order) {
          if (z.rank === target.get(z.id)) continue
          const { error } = await supabase.from('city_zones').update({ rank: target.get(z.id)!, updated_at: now }).eq('id', z.id).eq('org_id', orgId)
          if (error) throw error
        }
      }
    }

    const { data, error } = await supabase.from('city_zones').select(ZONE_COLS).eq('id', id).eq('org_id', orgId).single()
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PATCH zones error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update the zone' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const auth = await zoneAuth(true)
    if (auth instanceof NextResponse) return auth
    const { db: supabase, orgId } = auth

    const { id } = await params
    const { data: all, error: readError } = await supabase.from('city_zones').select('id, city, label, is_default').eq('org_id', orgId)
    if (readError) throw readError
    const current = (all ?? []).find(z => z.id === id)
    if (!current) return NextResponse.json({ success: false, error: 'Zone not found' }, { status: 404 })
    const verdict = canDeleteZone(current, all ?? [])
    if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })
    // Steps 2 and 3 add hotels and transport cards that point at a zone; from
    // then on a zone in use is refused here, naming where it is used.

    const { data, error } = await supabase.from('city_zones').delete().eq('id', id).eq('org_id', orgId).select('id')
    if (error) throw error
    if (!data || data.length === 0) return NextResponse.json({ success: false, error: 'Zone not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE zones error:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete the zone' }, { status: 500 })
  }
}
