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

type NumberReader = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function createDocumentNumberer(
  supabase: NumberReader,
  prefixFor: (docType: string) => string,
  year: number = new Date().getFullYear()
): (docType: string) => Promise<string> {
  const next: Record<string, number> = {}
  return async (docType: string) => {
    const prefix = prefixFor(docType)
    if (next[prefix] === undefined) {
      const { data } = await supabase
        .from('supplier_documents')
        .select('document_number')
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
