// ============================================
// Find-or-create the property behind a rate row
// ============================================
// The one invariant of the supplier-HAS-properties model: every rate saved
// with a supplier and a property name ends up LINKED to a
// supplier_properties row — whether it came from the form's picker, an older
// client that only sends the name, or a payload with no property_id at all.
// The rate keeps its denormalized name column (ship_name / property_name —
// engine, PDFs and CSV read it); this keeps the link true alongside it.
//
// Two entry points, ONE rule. resolveRateProperty() is the per-row form path;
// resolveRateProperties() is the bulk-CSV path, which resolves a whole sheet
// with a single SELECT instead of two round-trips per row. The per-row
// function delegates to the batch one, so a sheet and a form can never place
// the same rate on different properties.

interface Db {
  from(table: string): any
}

export type PropertyType = 'ship' | 'hotel' | 'train'

export interface PropertyRequest {
  propertyType: PropertyType
  supplierId: string | null | undefined
  name: string | null | undefined
  propertyId?: string | null
}

export interface PropertyResolution {
  property_id: string | null
  /** The property's canonical name, when one was found or created. The caller
   *  writes it back so the row and the property cannot disagree on spelling. */
  name?: string
}

const norm = (v: unknown) => String(v ?? '').trim()

/** The supplier_properties unique key — (supplier, type, name) — as a string.
 *  Case-insensitive on the name, like the form's own lookup. The separator is
 *  one that cannot appear in a UUID or a property_type. */
const propertyKey = (supplierId: string, propertyType: string, name: string) =>
  [supplierId, propertyType, name.toLowerCase()].join('␟')

/**
 * Resolve a batch of (supplier, property type, name) requests to property ids,
 * creating the properties that do not exist yet.
 *
 * Returns one resolution per request, positionally. A request with no supplier
 * or no name resolves to null — that is a legitimate property-less rate, not
 * an error.
 */
export async function resolveRateProperties(
  db: Db,
  requests: readonly PropertyRequest[],
): Promise<PropertyResolution[]> {
  const out: PropertyResolution[] = requests.map(() => ({ property_id: null }))

  // An explicit property id wins, and its canonical name overwrites whatever
  // the payload spelled. Looked up in one query for the whole batch.
  const explicitIds = Array.from(
    new Set(requests.map(r => norm(r.propertyId)).filter(Boolean)),
  )
  const byId = new Map<string, { id: string; name: string }>()
  if (explicitIds.length > 0) {
    const { data } = await db
      .from('supplier_properties')
      .select('id, name, supplier_id')
      .in('id', explicitIds)
    for (const p of data ?? []) byId.set(p.id, { id: p.id, name: p.name })
  }

  // Everything that still needs resolving by name, deduplicated: a sheet of
  // 200 sleeper rates names a handful of trains.
  const pending = new Map<string, { req: PropertyRequest; indices: number[]; supplierId: string; name: string }>()
  requests.forEach((req, i) => {
    const explicit = norm(req.propertyId)
    if (explicit && byId.has(explicit)) {
      const p = byId.get(explicit)!
      out[i] = { property_id: p.id, name: p.name }
      return
    }
    // A stale or foreign id falls through to name resolution rather than
    // saving a broken reference.
    const supplierId = norm(req.supplierId)
    const name = norm(req.name)
    if (!supplierId || !name) return
    const k = propertyKey(supplierId, req.propertyType, name)
    const seen = pending.get(k)
    if (seen) seen.indices.push(i)
    else pending.set(k, { req, indices: [i], supplierId, name })
  })
  if (pending.size === 0) return out

  // One SELECT for every supplier named in the batch, matched in memory.
  const supplierIds = Array.from(new Set(Array.from(pending.values()).map(p => p.supplierId)))
  const { data: existing } = await db
    .from('supplier_properties')
    .select('id, name, supplier_id, property_type')
    .in('supplier_id', supplierIds)
  const found = new Map<string, { id: string; name: string }>()
  for (const p of existing ?? []) {
    const k = propertyKey(p.supplier_id, p.property_type, String(p.name ?? ''))
    if (!found.has(k)) found.set(k, { id: p.id, name: p.name })
  }

  const toCreate: { k: string; supplier_id: string; property_type: PropertyType; name: string }[] = []
  for (const [k, p] of pending) {
    const hit = found.get(k)
    if (hit) for (const i of p.indices) out[i] = { property_id: hit.id, name: hit.name }
    else toCreate.push({ k, supplier_id: p.supplierId, property_type: p.req.propertyType, name: p.name })
  }
  if (toCreate.length === 0) return out

  const { data: created, error } = await db
    .from('supplier_properties')
    .insert(toCreate.map(({ supplier_id, property_type, name }) => ({ supplier_id, property_type, name })))
    .select('id, name, supplier_id, property_type')
  // Creation is best-effort: a failure (e.g. a concurrent insert losing the
  // unique race) must not block saving the rates themselves. The affected rows
  // keep property_id null, which is what they had before.
  if (error || !created) return out
  const createdByKey = new Map<string, { id: string; name: string }>()
  for (const p of created) {
    createdByKey.set(propertyKey(p.supplier_id, p.property_type, String(p.name ?? '')), { id: p.id, name: p.name })
  }
  for (const { k } of toCreate) {
    const hit = createdByKey.get(k)
    if (!hit) continue
    for (const i of pending.get(k)!.indices) out[i] = { property_id: hit.id, name: hit.name }
  }
  return out
}

export async function resolveRateProperty(
  db: Db,
  opts: {
    /** 'ship' for cruises, 'hotel' for accommodation, 'train' for phase 3. */
    propertyType: PropertyType
    supplierId: string | null | undefined
    name: string | null | undefined
    propertyId?: string | null
  }
): Promise<PropertyResolution> {
  const [one] = await resolveRateProperties(db, [opts])
  return one
}
