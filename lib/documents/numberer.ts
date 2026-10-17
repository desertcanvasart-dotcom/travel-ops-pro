// ============================================
// Supplier-document numbers for one generation batch
// ============================================
// The documents are inserted together at the end, so a batch counts on from
// each type's current highest number (PREFIX-YYYY-0001). This used to be a
// module-level offset map in the generate-documents route, "reset per
// request" — but the server is one long-running process, so two overlapping
// requests reset and advanced each other's counters: numbers were skipped, or
// repeated and the whole batch failed on the UNIQUE constraint. Each request
// now owns its numberer.

/** Document-number prefix per supplier-document type (SD for anything else). */
export const SUPPLIER_DOCUMENT_PREFIXES: Record<string, string> = {
  hotel_voucher: 'HV',
  service_order: 'SO',
  transport_voucher: 'TV',
  activity_voucher: 'AV',
  guide_assignment: 'GA',
  cruise_voucher: 'CV',
}

export const supplierDocumentPrefix = (docType: string): string => SUPPLIER_DOCUMENT_PREFIXES[docType] || 'SD'

type NumberReader = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
}

/** PostgREST / Postgres "no such function": the migration has not run yet. */
function functionMissing(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883'
}

/**
 * The next document numbers for ONE company. Numbers are per company
 * (migrations/20261216_surveys_and_voucher_numbers.sql): the read used to take
 * the highest number across every company, so ATS and Travel2Egypt drew
 * interleaved numbers from one sequence and could read each other's voucher
 * volume off the gaps.
 *
 * Each number comes from next_supplier_document_number(), which hands out the
 * company's next free number under a row lock — two requests never get the
 * same one. Until that migration has run, it counts on from the company's own
 * highest number, as before but filtered by org; the callers retry an insert
 * that still collides (23505) with fresh numbers.
 */
export function createDocumentNumberer(
  supabase: NumberReader,
  prefixFor: (docType: string) => string,
  orgId: string,
  year: number = new Date().getFullYear()
): (docType: string) => Promise<string> {
  const next: Record<string, number> = {}
  let counterMissing = false
  return async (docType: string) => {
    const prefix = prefixFor(docType)
    if (!counterMissing && typeof supabase.rpc === 'function') {
      const { data, error } = await supabase.rpc('next_supplier_document_number', { p_org: orgId, p_prefix: prefix, p_year: year })
      if (!error && typeof data === 'string' && data) return data
      if (error && !functionMissing(error)) throw new Error(error.message || 'Could not number the document')
      counterMissing = true
    }
    if (next[prefix] === undefined) {
      const { data } = await supabase
        .from('supplier_documents')
        .select('document_number')
        .eq('org_id', orgId)
        .like('document_number', `${prefix}-${year}-%`)
        .order('document_number', { ascending: false })
        .limit(1)
      const match = (data?.[0]?.document_number as string | undefined)?.match(/-(\d+)$/)
      next[prefix] = match ? parseInt(match[1], 10) + 1 : 1
    }
    const n = next[prefix]++
    return `${prefix}-${year}-${String(n).padStart(4, '0')}`
  }
}

/** A unique-key clash on insert (Postgres 23505). */
export const isDuplicateKey = (error: { code?: string } | null | undefined): boolean => error?.code === '23505'
