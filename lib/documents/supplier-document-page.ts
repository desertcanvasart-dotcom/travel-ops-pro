// ============================================
// The supplier voucher list, a page at a time
// ============================================
// GET /api/supplier-documents returned every voucher of the company in one
// read, which the server's row cap silently cut short, and the list page
// rendered all of them. It now returns one page (newest first) with an exact
// count, the way the guest-surveys list does (app/api/surveys).

export const SUPPLIER_DOCUMENT_PAGE_SIZE = 50

/** ?page= as a page number from 1; anything else is page 1. */
export function supplierDocumentPage(value: string | null): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** The inclusive row range of a page, for .range(). */
export function pageRange(page: number, size: number = SUPPLIER_DOCUMENT_PAGE_SIZE): [number, number] {
  const from = (page - 1) * size
  return [from, from + size - 1]
}
