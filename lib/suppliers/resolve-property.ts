// ============================================
// Find-or-create the property behind a rate row
// ============================================
// The one invariant of the supplier-HAS-properties model (Phase 1, cruises):
// every cruise rate saved with a supplier and a ship name ends up LINKED to a
// supplier_properties row — whether it came from the form's ship picker, an
// older client that only sends ship_name, or a payload with no property_id at
// all. The rate keeps its denormalized ship_name (engine, PDFs and CSV read
// it); this keeps the link true alongside it.

interface Db {
  from(table: string): any
}

export async function resolveShipProperty(
  db: Db,
  opts: { supplierId: string | null | undefined; shipName: string | null | undefined; propertyId?: string | null }
): Promise<{ property_id: string | null; ship_name?: string }> {
  // An explicit property wins; its canonical name overwrites whatever the
  // payload spelled, so the row and the property cannot disagree.
  if (opts.propertyId) {
    const { data } = await db
      .from('supplier_properties')
      .select('id, name, supplier_id')
      .eq('id', opts.propertyId)
      .maybeSingle()
    if (data) return { property_id: data.id, ship_name: data.name }
    // A stale/foreign id falls through to name resolution rather than saving a
    // broken reference.
  }

  const name = String(opts.shipName ?? '').trim()
  if (!opts.supplierId || !name) return { property_id: null }

  const { data: existing } = await db
    .from('supplier_properties')
    .select('id, name')
    .eq('supplier_id', opts.supplierId)
    .eq('property_type', 'ship')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  if (existing) return { property_id: existing.id, ship_name: existing.name }

  const { data: created, error } = await db
    .from('supplier_properties')
    .insert({ supplier_id: opts.supplierId, property_type: 'ship', name })
    .select('id, name')
    .single()
  // Creation is best-effort: a failure (e.g. a concurrent insert losing the
  // unique race) must not block saving the rate itself.
  if (error || !created) return { property_id: null }
  return { property_id: created.id, ship_name: created.name }
}
