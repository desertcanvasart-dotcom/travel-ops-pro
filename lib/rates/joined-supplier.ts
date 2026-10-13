// ============================================
// A rate list's joined supplier, this company's only
// ============================================
// The rate lists embed `supplier:suppliers(…)` for the contact phone and
// email the screens show. The rate rows are filtered by org_id; the embed was
// not — so a rate carrying another company's supplier_id (written before the
// write paths checked it, or through the old /api/resources/hotels) showed
// that company's supplier name, phone and email. The embed now selects the
// supplier's org_id and anything not ours is read as no supplier at all.

type Row = Record<string, unknown>

/** `rows` with every joined `supplier` of another company replaced by null,
 *  and the org_id the check needed taken back off. */
export function ownJoinedSupplier<T extends Row>(rows: T[] | null | undefined, orgId: string, key = 'supplier'): T[] {
  return (rows ?? []).map(row => {
    if (!row || typeof row !== 'object') return row
    const s = row[key] as Row | null | undefined
    if (!s || typeof s !== 'object') return row
    if (s.org_id !== orgId) return { ...row, [key]: null }
    const { org_id: _org, ...rest } = s
    void _org
    return { ...row, [key]: rest }
  })
}
