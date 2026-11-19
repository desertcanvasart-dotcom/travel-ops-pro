// ============================================
// /api/settings/zones — the company's zones, city by city
// ============================================
// GET  — every zone, and whether the caller may change them. Staff read them
//        (the hotel and transport forms will).
// POST — add a zone { city, label, is_default? }. The first zone of a city
//        becomes its default.
//
// Writes are admin only (the owner clears every gate), checked in the active
// company. Every query is filtered by that company; the company never comes
// from the request. Migration 20270123, ported from autoura-saas #830.

import { NextRequest, NextResponse } from 'next/server'
import { zoneAuth } from '@/lib/rates/zone-auth'
import { ZONE_COLS, uniqueZoneKey, validateZone, zonesOfCity } from '@/lib/rates/city-zones'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await zoneAuth(false)
    if (auth instanceof NextResponse) return auth
    const { db, orgId, canWrite } = auth

    const { data, error } = await db.from('city_zones').select(ZONE_COLS).eq('org_id', orgId).order('city').order('rank')
    if (error) throw error
    return NextResponse.json({ success: true, data: { zones: data ?? [], canWrite } })
  } catch (error) {
    console.error('GET zones error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load your zones' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await zoneAuth(true)
    if (auth instanceof NextResponse) return auth
    const { db, orgId } = auth

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const { data: existing, error: readError } = await db.from('city_zones').select('id, city, key, label, is_default, rank').eq('org_id', orgId)
    if (readError) throw readError
    const all = existing ?? []
    const verdict = validateZone(body, all)
    if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })

    const siblings = zonesOfCity(all, verdict.city)
    // The first zone of a city is its default; asking for the default moves it.
    const makeDefault = siblings.length === 0 || body.is_default === true
    if (makeDefault && siblings.some(z => z.is_default)) {
      const { error } = await db.from('city_zones').update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('org_id', orgId).in('id', siblings.filter(z => z.is_default).map(z => z.id))
      if (error) throw error
    }

    const { data, error } = await db
      .from('city_zones')
      .insert({
        org_id: orgId,
        // A city already listed keeps its first spelling, so one city never shows twice.
        city: siblings[0]?.city ?? verdict.city,
        key: uniqueZoneKey(verdict.label, siblings.map(z => z.key)),
        label: verdict.label,
        is_default: makeDefault,
        rank: siblings.reduce((m, z) => Math.max(m, z.rank), 0) + 1,
      })
      .select(ZONE_COLS)
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, error: 'Someone added the same zone at the same moment. Reload the page.' }, { status: 409 })
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST zones error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the zone' }, { status: 500 })
  }
}
