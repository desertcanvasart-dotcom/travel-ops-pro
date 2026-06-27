import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSupplierByName } from './resolve-supplier'
import { tServer } from '@/lib/i18n/server-messages'
import { NO_SUPPLIER_SENTINEL } from './supplier-field-constants'

// Re-exported for back-compat: server-side callers (API routes) keep importing
// NO_SUPPLIER_SENTINEL from here. Client components must import it from
// './supplier-field-constants' directly to avoid pulling this server-only module
// (and its next/headers dependency) into the browser bundle.
export { NO_SUPPLIER_SENTINEL }

export type SupplierFieldsResult =
  | { ok: true; supplier_id: string | null; supplier_name: string | null }
  | { ok: false; status: number; error: string }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function validateAndResolveSupplierFields(
  body: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<SupplierFieldsResult> {
  const rawId = str(body.supplier_id)
  const rawName = str(body.supplier_name)
  const passthroughName = typeof body.supplier_name === 'string' ? body.supplier_name : null

  if (rawId === NO_SUPPLIER_SENTINEL) {
    return { ok: true, supplier_id: null, supplier_name: passthroughName }
  }

  if (rawId) {
    const { data, error } = await supabase.from('suppliers').select('id, name').eq('id', rawId).maybeSingle()
    if (error || !data) {
      const msg = await tServer('rates.common.errors.supplierIdNotFound', { id: rawId })
      return { ok: false, status: 400, error: msg }
    }
    return { ok: true, supplier_id: data.id, supplier_name: passthroughName ?? data.name }
  }

  if (rawName) {
    const result = await resolveSupplierByName(rawName, supabase)
    if (result.match === 'exact') {
      return { ok: true, supplier_id: result.supplier_id, supplier_name: passthroughName ?? result.canonical_name }
    }
    if (result.match === 'ambiguous') {
      const candList = result.candidates.map((c) => `${c.id} (${c.name})`).join(', ')
      const msg = await tServer('rates.common.errors.supplierNameAmbiguous', { name: rawName, count: result.candidates.length, candidates: candList })
      return { ok: false, status: 400, error: msg }
    }
    const msg = await tServer('rates.common.errors.supplierNameNoMatchForm', { name: rawName })
    return { ok: false, status: 400, error: msg }
  }

  return { ok: true, supplier_id: null, supplier_name: passthroughName }
}
