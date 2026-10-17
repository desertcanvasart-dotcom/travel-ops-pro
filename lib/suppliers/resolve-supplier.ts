import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { supplierOrgId } from './supplier-org'

export type SupplierMatch =
  | { match: 'exact'; supplier_id: string; canonical_name: string }
  | { match: 'none'; candidates?: never }
  | { match: 'ambiguous'; candidates: Array<{ id: string; name: string }> }

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().trim()

// Resolution is within ONE company's suppliers (suppliers.org_id, 20261205):
// a name or code never resolves to the other company's supplier. `orgId`
// omitted = the request's company (lib/suppliers/supplier-org.ts).
export async function resolveSupplierByName(
  name: string,
  supabase: SupabaseClient,
  orgId?: string | null
): Promise<SupplierMatch> {
  const key = norm(name)
  if (!key) return { match: 'none' }
  const org = await supplierOrgId(orgId)
  if (!org) return { match: 'none' }
  // The whole roster, not the first 1000 rows (lib/db/select-all-rows).
  const { data, error } = await selectAllRows<{ id: string; name: string }>(
    () => supabase.from('suppliers').select('id, name').eq('org_id', org),
  )
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
  /** supplier_code (normalised) → supplier_id, for cross-install linking.
   *  Codes are UNIQUE within a company, so this is 1:1 and never ambiguous. */
  resolvedIdByCode: Map<string, string>
  /** Codes on rows that match no supplier here — the import errors on these. */
  unknownCodes: Set<string>
}

export async function batchResolveSuppliers(
  rows: Array<Record<string, any>>,
  supabase: SupabaseClient,
  orgId?: string | null
): Promise<BatchResolution> {
  const result: BatchResolution = {
    resolvedIdByName: new Map(),
    ambiguousNames: new Map(),
    unknownIds: new Set(),
    noMatchNames: new Set(),
    resolvedIdByCode: new Map(),
    unknownCodes: new Set(),
  }

  // The company's whole roster: a supplier past PostgREST's 1000-row cap used
  // to read as "not found" and fail every rate row naming it. With no company,
  // an empty roster — every id, code and name below then reads as unknown.
  const org = await supplierOrgId(orgId)
  const { data: suppliers, error } = org
    ? await selectAllRows<{ id: string; name: string; supplier_code: string | null }>(
        () => supabase.from('suppliers').select('id, name, supplier_code').eq('org_id', org),
      )
    : { data: [] as { id: string; name: string; supplier_code: string | null }[], error: null }
  if (error || !suppliers) return result

  const canonicalById = new Map(suppliers.map((s) => [s.id, s]))
  const idByCode = new Map<string, string>()
  for (const s of suppliers) {
    const c = norm(s.supplier_code)
    if (c) idByCode.set(c, s.id)
  }
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
    const codeValue = typeof row.supplier_code === 'string' ? row.supplier_code : ''
    const normName = norm(nameValue)
    const normCode = norm(codeValue)

    // Code takes precedence — it is the portable cross-install key.
    if (normCode) {
      const id = idByCode.get(normCode)
      if (id) result.resolvedIdByCode.set(normCode, id)
      else result.unknownCodes.add(normCode)
      continue
    }

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
