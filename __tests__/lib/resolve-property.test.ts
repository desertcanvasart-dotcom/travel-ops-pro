// The one invariant of supplier-HAS-properties: a rate saved
// with a supplier and a ship name always ends up linked to a
// supplier_properties row — found case-insensitively, or created — and the
// property's canonical name wins over the payload spelling.
//
// The stub below is a tiny in-memory supplier_properties table rather than a
// scripted call sequence, so these tests pin the RULE and not the shape of
// the query. That matters now that one implementation serves two callers: the
// rate forms resolve a row at a time, the CSV importer resolves a whole sheet
// in one pass (resolveRateProperties), and a sheet must never place a rate on
// a different property than the form would.
import { describe, it, expect } from 'vitest'
import { resolveRateProperty, resolveRateProperties } from '@/lib/suppliers/resolve-property'

type Row = { id: string; name: string; supplier_id: string; property_type: string }

/** A stand-in supplier_properties table supporting the two queries the
 *  resolver makes: .in('id', ids) and .in('supplier_id', ids). */
function db(rows: Row[], opts: { insertError?: unknown } = {}) {
  const inserted: Record<string, unknown>[] = []
  let nextId = rows.length + 1
  const from = (table: string) => {
    if (table !== 'supplier_properties') throw new Error(`unexpected table ${table}`)
    const chain: any = {
      select: () => chain,
      in: async (column: string, values: string[]) => ({
        data: rows.filter(r => values.includes((r as any)[column])),
        error: null,
      }),
      insert: (payload: Record<string, unknown>[]) => {
        inserted.push(...payload)
        if (opts.insertError) return { select: async () => ({ data: null, error: opts.insertError }) }
        const created = payload.map(p => ({ ...(p as any), id: `new-${nextId++}` })) as Row[]
        rows.push(...created)
        return { select: async () => ({ data: created, error: null }) }
      },
    }
    return chain
  }
  return { from, inserted }
}

const SHIPS: Row[] = [
  { id: 'p1', name: 'MS Mayfair', supplier_id: 's1', property_type: 'ship' },
  { id: 'p2', name: 'MS Nile Style', supplier_id: 's1', property_type: 'ship' },
]

describe('resolveRateProperty', () => {
  it('an explicit property wins, and its canonical name is returned', async () => {
    const d = db([...SHIPS])
    const out = await resolveRateProperty(d, { propertyType: 'ship', supplierId: 's1', name: 'ms mayfair', propertyId: 'p1' })
    expect(out).toEqual({ property_id: 'p1', name: 'MS Mayfair' })
    expect(d.inserted).toHaveLength(0)
  })

  it('a stale property id falls back to name resolution instead of saving a broken link', async () => {
    const d = db([...SHIPS])
    const out = await resolveRateProperty(d, { propertyType: 'ship', supplierId: 's1', name: 'MS NILE STYLE', propertyId: 'gone' })
    expect(out).toEqual({ property_id: 'p2', name: 'MS Nile Style' })
    expect(d.inserted).toHaveLength(0)
  })

  it('creates the ship under the supplier when the name is new', async () => {
    const d = db([...SHIPS])
    const out = await resolveRateProperty(d, { propertyType: 'ship', supplierId: 's1', name: '  MS Farah  ' })
    expect(out.property_id).toBeTruthy()
    expect(out.name).toBe('MS Farah')
    expect(d.inserted[0]).toMatchObject({ supplier_id: 's1', property_type: 'ship', name: 'MS Farah' })
  })

  it('no supplier or no name → no property, and no writes', async () => {
    for (const opts of [
      { supplierId: null, name: 'MS Farah' },
      { supplierId: 's1', name: '   ' },
    ]) {
      const d = db([...SHIPS])
      expect(await resolveRateProperty(d, { propertyType: 'ship', ...opts } as Parameters<typeof resolveRateProperty>[1])).toEqual({ property_id: null })
      expect(d.inserted).toHaveLength(0)
    }
  })

  it('a name that exists under ANOTHER supplier is not reused', async () => {
    const d = db([...SHIPS])
    const out = await resolveRateProperty(d, { propertyType: 'ship', supplierId: 's2', name: 'MS Mayfair' })
    expect(out.property_id).not.toBe('p1')
    expect(d.inserted[0]).toMatchObject({ supplier_id: 's2', name: 'MS Mayfair' })
  })

  it('hotel resolution creates a hotel property, not a ship', async () => {
    // Same supplier, same name, different KIND of asset: the ship must not be
    // handed back for the hotel.
    const d = db([{ id: 'x1', name: 'Kempinski Nile', supplier_id: 's1', property_type: 'ship' }])
    const out = await resolveRateProperty(d, { propertyType: 'hotel', supplierId: 's1', name: 'Kempinski Nile' })
    expect(out.property_id).not.toBe('x1')
    expect(d.inserted[0]).toMatchObject({ property_type: 'hotel' })
  })

  it('a failed create never blocks the rate: null link, rate saves anyway', async () => {
    const d = db([...SHIPS], { insertError: { code: '23505' } })
    const out = await resolveRateProperty(d, { propertyType: 'ship', supplierId: 's1', name: 'MS Farah' })
    expect(out).toEqual({ property_id: null })
  })
})

describe('resolveRateProperties — a whole sheet at once', () => {
  it('answers positionally, one resolution per request', async () => {
    const d = db([...SHIPS])
    const out = await resolveRateProperties(d, [
      { propertyType: 'ship', supplierId: 's1', name: 'MS Mayfair' },
      { propertyType: 'ship', supplierId: null, name: 'MS Mayfair' },
      { propertyType: 'ship', supplierId: 's1', name: 'ms nile style' },
    ])
    expect(out.map(r => r.property_id)).toEqual(['p1', null, 'p2'])
  })

  it('creates a new property ONCE for a name repeated down the sheet', async () => {
    // 200 sleeper rates naming the same train must not create 200 trains.
    const d = db([])
    const requests = Array.from({ length: 5 }, () => ({
      propertyType: 'train' as const, supplierId: 's1', name: 'Watania 82',
    }))
    const out = await resolveRateProperties(d, requests)
    expect(d.inserted).toHaveLength(1)
    expect(new Set(out.map(r => r.property_id)).size).toBe(1)
    expect(out.every(r => r.property_id)).toBe(true)
  })

  it('resolves a mixed sheet in one pass: found, created, and skipped', async () => {
    const d = db([...SHIPS])
    const out = await resolveRateProperties(d, [
      { propertyType: 'ship', supplierId: 's1', name: 'MS Mayfair' },   // found
      { propertyType: 'ship', supplierId: 's1', name: 'MS Farah' },     // created
      { propertyType: 'ship', supplierId: 's1', name: '' },             // skipped
    ])
    expect(out[0].property_id).toBe('p1')
    expect(out[1].property_id).toBeTruthy()
    expect(out[2].property_id).toBeNull()
    expect(d.inserted).toHaveLength(1)
  })
})
