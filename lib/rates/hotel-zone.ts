// ============================================
// A hotel's area (zone): read and kept in step on save
// ============================================
// Migration 20270124 (ported from autoura-saas #831), step 2 of the transport
// zones plan. The hotel routes check the zone against the city's zones
// (lib/rates/city-zones.ts) and keep every rate row of the same hotel in the
// same area.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveZoneChoice, type CityZone, type ZoneChoice } from '@/lib/rates/city-zones'

/** Postgres / PostgREST "no such table" and "no such column". */
const NOT_THERE = new Set(['42P01', 'PGRST205', '42703', 'PGRST204'])

/**
 * The company's zones (every city). Before migration 20270123 there is no
 * table: that reads as no zones, so every hotel saves as before.
 */
export async function loadCityZones(db: SupabaseClient, orgId: string): Promise<CityZone[]> {
  const { data, error } = await db.from('city_zones').select('id, city, key, label, is_default, rank').eq('org_id', orgId)
  if (error) {
    if (error.code && NOT_THERE.has(error.code)) return []
    throw error
  }
  return (data ?? []) as CityZone[]
}

export interface HotelZoneCheck {
  choice: ZoneChoice
  /**
   * Whether to write the `zone` column at all. Only once the company has
   * zones: before that the column may not exist yet (migration 20270124),
   * and a hotel with no area is what every hotel is today.
   */
  write: boolean
}

/** A hotel saved from the form: its city's zones decide, and one is required if any exist. */
export async function checkHotelZone(db: SupabaseClient, orgId: string, city: unknown, zone: unknown): Promise<HotelZoneCheck> {
  const zones = await loadCityZones(db, orgId)
  return { choice: resolveZoneChoice(zones, city, zone, { required: true }), write: zones.length > 0 }
}

/**
 * One hotel, one area: the other rate rows of the same hotel in the same city
 * take the zone just saved, so the engine never sees the hotel in two places.
 */
export async function syncHotelZone(db: SupabaseClient, opts: { orgId: string; rowId: string; propertyId: string | null | undefined; city: string | null | undefined; zone: string | null }) {
  if (!opts.propertyId || !opts.city) return
  const { error } = await db.from('accommodation_rates').update({ zone: opts.zone })
    .eq('org_id', opts.orgId)
    .eq('property_id', opts.propertyId)
    .neq('id', opts.rowId)
    .ilike('city', opts.city.trim())
  // Best effort: the row the user saved is saved; a sibling left behind shows
  // in the hotel list's area.
  if (error) console.error('sync hotel zone error:', error)
}
