// ============================================
// Find-or-create the property behind a rate row
// ============================================
// The one invariant of the supplier-HAS-properties model: every rate saved
// with a supplier and a property name ends up LINKED to a
// supplier_properties row — whether it came from the form's picker, an older
// client that only sends the name, or a payload with no property_id at all.
// The rate keeps its denormalized name column (ship_name / property_name —
// engine, PDFs and CSV read it); this keeps the link true alongside it.

interface Db {
  from(table: string): any
}

export async function resolveRateProperty(
  db: Db,
  opts: {
    /** 'ship' for cruises, 'hotel' for accommodation, 'train' for phase 3. */
    propertyType: 'ship' | 'hotel' | 'train'
    supplierId: string | null | undefined
    name: string | null | undefined
    propertyId?: string | null
  }
): Promise<{ property_id: string | null; name?: string }> {
  // An explicit property wins; its canonical name overwrites whatever the
  // payload spelled, so the row and the property cannot disagree.
  if (opts.propertyId) {
    const { data } = await db
      .from('supplier_properties')
      .select('id, name, supplier_id')
      .eq('id', opts.propertyId)
      .maybeSingle()
    if (data) return { property_id: data.id, name: data.name }
    // A stale/foreign id falls through to name resolution rather than saving a
    // broken reference.
  }

  const name = String(opts.name ?? '').trim()
  if (!opts.supplierId || !name) return { property_id: null }

  const { data: existing } = await db
    .from('supplier_properties')
    .select('id, name')
    .eq('supplier_id', opts.supplierId)
    .eq('property_type', opts.propertyType)
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  if (existing) return { property_id: existing.id, name: existing.name }

  const { data: created, error } = await db
    .from('supplier_properties')
    .insert({ supplier_id: opts.supplierId, property_type: opts.propertyType, name })
    .select('id, name')
    .single()
  // Creation is best-effort: a failure (e.g. a concurrent insert losing the
  // unique race) must not block saving the rate itself.
  if (error || !created) return { property_id: null }
  return { property_id: created.id, name: created.name }
}
