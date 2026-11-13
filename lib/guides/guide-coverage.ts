// ============================================
// Reading and writing the cities a guide works in (server side)
// ============================================
// supplier_cities (migration 20270118): one row per (supplier, city). See
// lib/guides/guide-cities for the model and the pure helpers.
//
// An install that has not applied 20270118 yet has no table: every read
// degrades to "no cities on file" (every guide works in every city) instead
// of failing the page or the quote.

import { cleanCityList, withGuideCities } from '@/lib/guides/guide-cities'
import { isMissingRelation } from '@/lib/suppliers/delete-guard'

// Any client that can read and write tables (service-role, actor, or a test mock).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** supplier id → its cities, for one company. Missing table = empty map. */
export async function fetchGuideCityMap(db: Db, orgId: string | null | undefined): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (!orgId) return map
  const { data, error } = await db
    .from('supplier_cities')
    .select('supplier_id, city')
    .eq('org_id', orgId)
    .order('city')
  if (error) {
    if (!isMissingRelation(error)) console.error('supplier_cities read failed:', error.message)
    return map
  }
  for (const row of (data ?? []) as { supplier_id: string; city: string }[]) {
    const list = map.get(row.supplier_id) ?? []
    list.push(row.city)
    map.set(row.supplier_id, list)
  }
  return map
}

/** Guide rate rows with `guide_cities` attached (one extra query). */
export async function attachGuideCities<T extends { supplier_id?: string | null }>(
  db: Db,
  orgId: string | null | undefined,
  rows: readonly T[],
): Promise<(T & { guide_cities: string[] })[]> {
  if (!rows.length) return []
  return withGuideCities(rows, await fetchGuideCityMap(db, orgId))
}

/** One supplier's cities. */
export async function fetchSupplierCities(db: Db, orgId: string, supplierId: string): Promise<string[]> {
  return (await fetchGuideCityMap(db, orgId)).get(supplierId) ?? []
}

/**
 * Replace one supplier's cities with `cities` (cleaned, de-duplicated). The
 * caller has already checked the supplier belongs to `orgId`. Returns the
 * saved list, or an error message.
 */
export async function replaceSupplierCities(
  db: Db,
  orgId: string,
  supplierId: string,
  cities: unknown,
): Promise<{ cities: string[] } | { error: string }> {
  const list = cleanCityList(cities)
  const { data: current, error: readError } = await db
    .from('supplier_cities')
    .select('id, city')
    .eq('org_id', orgId)
    .eq('supplier_id', supplierId)
  if (readError) return { error: readError.message }

  const want = new Set(list.map(c => c.toLowerCase()))
  const have = new Map(((current ?? []) as { id: string; city: string }[]).map(r => [r.city.trim().toLowerCase(), r]))

  const removeIds = [...have.entries()].filter(([k]) => !want.has(k)).map(([, r]) => r.id)
  const add = list.filter(c => !have.has(c.toLowerCase()))

  if (removeIds.length) {
    const { error } = await db.from('supplier_cities').delete().in('id', removeIds).eq('org_id', orgId)
    if (error) return { error: error.message }
  }
  if (add.length) {
    const { error } = await db
      .from('supplier_cities')
      .insert(add.map(city => ({ org_id: orgId, supplier_id: supplierId, city })))
    if (error) return { error: error.message }
  }
  return { cities: list }
}
