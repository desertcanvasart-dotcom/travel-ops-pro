import type { SupabaseClient } from '@supabase/supabase-js'

export type SupplierMatch =
  | { match: 'exact'; supplier_id: string; canonical_name: string }
  | { match: 'none'; candidates?: never }
  | { match: 'ambiguous'; candidates: Array<{ id: string; name: string }> }

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().trim()

export async function resolveSupplierByName(
  name: string,
  supabase: SupabaseClient
): Promise<SupplierMatch> {
  const key = norm(name)
  if (!key) return { match: 'none' }
  const { data, error } = await supabase.from('suppliers').select('id, name')
  if (error || !data) return { match: 'none' }
  const matches = data.filter((r) => norm(r.name) === key)
  if (matches.length === 0) return { match: 'none' }
  if (matches.length === 1) return { match: 'exact', supplier_id: matches[0].id, canonical_name: matches[0].name }
  return { match: 'ambiguous', candidates: matches.map((m) => ({ id: m.id, name: m.name })) }
}

export type BatchResolution = {
  resolvedIdByName: Map<string, string>
  ambiguousNames: Map<string, Array<{ id: string; name: string }>>
  unknownIds: Set<string>
  noMatchNames: Set<string>
}

export async function batchResolveSuppliers(
  rows: Array<Record<string, any>>,
  supabase: SupabaseClient
): Promise<BatchResolution> {
  const result: BatchResolution = {
    resolvedIdByName: new Map(),
    ambiguousNames: new Map(),
    unknownIds: new Set(),
    noMatchNames: new Set(),
  }

  const { data: suppliers, error } = await supabase.from('suppliers').select('id, name')
  if (error || !suppliers) return result

  const canonicalById = new Map(suppliers.map((s) => [s.id, s]))
  const byNormName = new Map<string, Array<{ id: string; name: string }>>()
  for (const s of suppliers) {
    const k = norm(s.name)
    if (!k) continue
    if (!byNormName.has(k)) byNormName.set(k, [])
    byNormName.get(k)!.push({ id: s.id, name: s.name })
  }

  for (const row of rows) {
    const idValue = typeof row.supplier_id === 'string' ? row.supplier_id.trim() : ''
    const nameValue = typeof row.supplier_name === 'string' ? row.supplier_name : ''
    const normName = norm(nameValue)

    if (idValue) {
      if (!canonicalById.has(idValue)) result.unknownIds.add(idValue)
      continue
    }

    if (!normName) continue

    if (result.resolvedIdByName.has(normName) || result.ambiguousNames.has(normName) || result.noMatchNames.has(normName)) {
      continue
    }

    const candidates = byNormName.get(normName)
    if (!candidates || candidates.length === 0) {
      result.noMatchNames.add(normName)
    } else if (candidates.length === 1) {
      result.resolvedIdByName.set(normName, candidates[0].id)
    } else {
      result.ambiguousNames.set(normName, candidates)
    }
  }

  return result
}
