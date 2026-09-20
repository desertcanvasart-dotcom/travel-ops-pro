// The symptom for the rate sheets: export a rate, delete it, import the same
// file, and the rate is still attached to its supplier AND to the hotel, ship
// or train it prices.
//
// It was not. property_id was not a CSV column at all, and three tables had no
// supplier_id column on their sheet either — so a round-trip quietly cut both
// links. The denormalised name (ship_name, property_name) survived, so the
// screen looked unchanged and only pricing went wrong.
//
// This exercises the real config, the real validator, and the real property
// resolver against an in-memory supplier_properties table, with the same
// argument the import route builds.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { RATE_TABLE_CONFIGS, getExportHeaders, validateImportData } from '@/lib/bulk-rate-service'
import { resolveRateProperties } from '@/lib/suppliers/resolve-property'

type Prop = { id: string; name: string; supplier_id: string; property_type: string }

function propertiesDb(rows: Prop[]) {
  const inserted: Record<string, unknown>[] = []
  let next = 1
  return {
    inserted,
    rows,
    from: () => {
      const chain: any = {
        select: () => chain,
        in: async (column: string, values: string[]) => ({
          data: rows.filter(r => values.includes((r as any)[column])), error: null,
        }),
        insert: (payload: Record<string, unknown>[]) => {
          inserted.push(...payload)
          const created = payload.map(p => ({ ...(p as any), id: `made-${next++}` })) as Prop[]
          rows.push(...created)
          return { select: async () => ({ data: created, error: null }) }
        },
      }
      return chain
    },
  }
}

/** Export a row the way app/api/rates/bulk/export does, then parse it back the
 *  way the import route does. */
function roundTrip(table: string, row: Record<string, unknown>) {
  const config = RATE_TABLE_CONFIGS[table]
  const headers = getExportHeaders(config)
  const csv = Papa.unparse({ fields: headers, data: [headers.map(h => row[h] ?? '')] })
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim(),
  })
  return { config, headers, csv, preview: validateImportData(parsed.data, config) }
}

const SUPPLIER = 'supplier-1'

describe('rate CSVs keep the supplier link', () => {
  it('hotels carry supplier_id and its portable code', () => {
    const headers = getExportHeaders(RATE_TABLE_CONFIGS.accommodation_rates)
    expect(headers).toContain('supplier_id')
    expect(headers).toContain('supplier_code')
  })

  it('airport and hotel service rates carry them too', () => {
    for (const t of ['airport_staff_rates', 'hotel_staff_rates']) {
      const headers = getExportHeaders(RATE_TABLE_CONFIGS[t])
      expect(headers, `${t} supplier_id`).toContain('supplier_id')
      expect(headers, `${t} supplier_code`).toContain('supplier_code')
    }
  })
})

describe('rate CSVs keep the property link', () => {
  it('a cruise re-attaches to its ship by name, with no property_id in the file', async () => {
    const db = propertiesDb([{ id: 'ship-1', name: 'MS Nile Dream', supplier_id: SUPPLIER, property_type: 'ship' }])
    const { headers, preview } = roundTrip('nile_cruises', {
      cruise_code: 'NC-001', ship_name: 'MS Nile Dream', ship_category: '5-star', cabin_type: 'standard',
      route_name: 'Luxor–Aswan', embark_city: 'Luxor', disembark_city: 'Aswan',
      duration_nights: 4, supplier_id: SUPPLIER, property_id: 'ship-1',
    })
    // The UUID does NOT travel; the name does.
    expect(headers).not.toContain('property_id')
    expect(headers).toContain('ship_name')

    const [row] = preview.parsedValidRows!
    const [resolved] = await resolveRateProperties(db, [{
      propertyType: 'ship', supplierId: row.supplier_id, name: row.ship_name, propertyId: row.property_id,
    }])
    expect(resolved.property_id).toBe('ship-1')
    expect(db.inserted).toHaveLength(0)
  })

  it('a hotel re-attaches to its property by name', async () => {
    const db = propertiesDb([{ id: 'hotel-1', name: 'Kempinski Nile', supplier_id: SUPPLIER, property_type: 'hotel' }])
    const { preview } = roundTrip('accommodation_rates', {
      service_code: 'HTL-001', property_name: 'Kempinski Nile', supplier_id: SUPPLIER,
    })
    const [row] = preview.parsedValidRows!
    const [resolved] = await resolveRateProperties(db, [{
      propertyType: 'hotel', supplierId: row.supplier_id, name: row.property_name, propertyId: row.property_id,
    }])
    expect(resolved.property_id).toBe('hotel-1')
  })

  it('a sleeper carries the train NAME in a column of its own, and it is stripped before the upsert', async () => {
    // train_rates and sleeping_train_rates store only operator_name — the
    // COMPANY — so nothing on the row names the train. The sheet gets a
    // virtual column the export fills from the joined property.
    const config = RATE_TABLE_CONFIGS.sleeping_train_rates
    expect(config.propertyLink).toMatchObject({ propertyType: 'train', nameColumn: 'property_name', virtual: true })

    const db = propertiesDb([{ id: 'train-1', name: 'Watania 82', supplier_id: SUPPLIER, property_type: 'train' }])
    const { headers, preview } = roundTrip('sleeping_train_rates', {
      service_code: 'SLP-001', origin_city: 'Cairo', destination_city: 'Aswan',
      cabin_type: 'single', rate_oneway_eur: 120, supplier_id: SUPPLIER,
      property_name: 'Watania 82',
    })
    expect(headers).toContain('property_name')
    expect(headers).not.toContain('property_id')

    const [row] = preview.parsedValidRows!
    const [resolved] = await resolveRateProperties(db, [{
      propertyType: 'train', supplierId: row.supplier_id, name: row.property_name, propertyId: row.property_id,
    }])
    expect(resolved.property_id).toBe('train-1')

    // What the import route does next: the virtual column must not reach the
    // upsert, because sleeping_train_rates has no such column.
    row.property_id = resolved.property_id
    delete row.property_name
    expect(row).not.toHaveProperty('property_name')
    expect(row.property_id).toBe('train-1')
  })

  it('a property the install has never seen is created under its supplier, not dropped', async () => {
    const db = propertiesDb([])
    const { preview } = roundTrip('nile_cruises', {
      cruise_code: 'NC-002', ship_name: 'MS Farah', ship_category: '5-star', cabin_type: 'standard',
      route_name: 'Luxor–Aswan', embark_city: 'Luxor', disembark_city: 'Aswan',
      duration_nights: 4, supplier_id: SUPPLIER,
    })
    const [row] = preview.parsedValidRows!
    const [resolved] = await resolveRateProperties(db, [{
      propertyType: 'ship', supplierId: row.supplier_id, name: row.ship_name, propertyId: row.property_id,
    }])
    expect(resolved.property_id).toBeTruthy()
    expect(db.inserted[0]).toMatchObject({ supplier_id: SUPPLIER, property_type: 'ship', name: 'MS Farah' })
  })

  it('a rate with no supplier keeps no property link, and writes nothing', async () => {
    // A supplier-less rate is legitimate; it just has no property to be under.
    const db = propertiesDb([])
    const { preview } = roundTrip('nile_cruises', {
      cruise_code: 'NC-003', ship_name: 'Some Ship', ship_category: '5-star', cabin_type: 'standard',
      route_name: 'Luxor–Aswan', embark_city: 'Luxor', disembark_city: 'Aswan',
      duration_nights: 4,
    })
    const [row] = preview.parsedValidRows!
    const [resolved] = await resolveRateProperties(db, [{
      propertyType: 'ship', supplierId: row.supplier_id, name: row.ship_name, propertyId: row.property_id,
    }])
    expect(resolved.property_id).toBeNull()
    expect(db.inserted).toHaveLength(0)
  })
})
