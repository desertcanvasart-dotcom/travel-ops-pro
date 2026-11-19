// A transport rate's pickup area and the sights it covers (20270125, ported
// from autoura-saas #832).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isNonDefaultZone, resolveCardSights, zoneInUseError, type CityZone } from '@/lib/rates/city-zones'
import { RATE_TABLE_CONFIGS, validateImportData } from '@/lib/bulk-rate-service'
import { transportRateKey } from '@/lib/rates/transport-natural-key'
import { cardZoneWrite } from '@/lib/rates/transport-card-zone'

const zones: CityZone[] = [
  { id: '1', city: 'Luxor', key: 'east_bank', label: 'East Bank', is_default: true, rank: 1 },
  { id: '2', city: 'Luxor', key: 'west_bank', label: 'West Bank', is_default: false, rank: 2 },
]
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('isNonDefaultZone: which rates wait for step 4', () => {
  it('no area, or the city default, is the city rate as before', () => {
    expect(isNonDefaultZone(zones, 'Luxor', null)).toBe(false)
    expect(isNonDefaultZone(zones, 'luxor', 'east_bank')).toBe(false)
  })
  it('another area is not', () => {
    expect(isNonDefaultZone(zones, 'Luxor', 'west_bank')).toBe(true)
    expect(isNonDefaultZone(zones, 'Aswan', 'east_bank')).toBe(true)
  })
})

describe('resolveCardSights', () => {
  const fees = ['Karnak Temple', 'Luxor Temple', 'Valley Of Kings']
  it("takes fee-sheet names ignoring capitals, in the sheet's spelling, once each", () => {
    expect(resolveCardSights(['karnak temple', 'Luxor Temple', 'KARNAK TEMPLE'], fees)).toEqual({ ok: true, sights: ['Karnak Temple', 'Luxor Temple'] })
    expect(resolveCardSights('Karnak Temple; valley of kings', fees)).toEqual({ ok: true, sights: ['Karnak Temple', 'Valley Of Kings'] })
    expect(resolveCardSights('', fees)).toEqual({ ok: true, sights: [] })
  })
  it('refuses a name not on the sheet', () => {
    const v = resolveCardSights(['Karnak', 'Luxor Temple'], fees)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain('"Karnak"')
  })
})

describe('zoneInUseError with rates', () => {
  it('names hotels and rates', () => {
    expect(zoneInUseError({ label: 'West Bank', city: 'Luxor' }, [], ['LUXOR-AIRPORT-WEST'])).toBe('1 transport rate prices it (LUXOR-AIRPORT-WEST). Move it to another Luxor area under Rates → Transportation first.')
    expect(zoneInUseError({ label: 'West Bank', city: 'Luxor' }, ['Al Moudira'], ['A', 'B'])).toBe('1 hotel is in "West Bank" (Al Moudira); 2 transport rates price it (A, B). Move them to another Luxor area under Rates → Hotels and Rates → Transportation first.')
  })
})

// A stub service-role client for cardZoneWrite.
function stubDb(opts: { columns?: boolean; zones?: CityZone[]; fees?: string[] }) {
  return {
    from: (table: string) => ({
      select: () => {
        if (table === 'transportation_rates') {
          return { limit: async () => (opts.columns === false ? { data: null, error: { code: '42703', message: 'no column' } } : { data: [], error: null }) }
        }
        if (table === 'city_zones') return { eq: async () => ({ data: opts.zones ?? [], error: null }) }
        return { eq: async () => ({ data: (opts.fees ?? []).map(attraction_name => ({ attraction_name })), error: null }) }
      },
    }),
  } as never
}

describe('cardZoneWrite: what the save routes write', () => {
  const fees = ['Karnak Temple', 'Luxor Temple']
  it('stores the area key and the sights in the sheet spelling', async () => {
    const r = await cardZoneWrite(stubDb({ zones, fees }), 'o1', { city: 'Luxor', zone: 'West Bank', covers_sights: ['karnak temple'] }, null)
    expect(r).toEqual({ ok: true, patch: { zone: 'west_bank', covers_sights: ['Karnak Temple'] } })
  })
  it("refuses another city's area and an unknown sight", async () => {
    expect(await cardZoneWrite(stubDb({ zones, fees }), 'o1', { city: 'Cairo', zone: 'west_bank' }, null)).toMatchObject({ ok: false, status: 400 })
    expect(await cardZoneWrite(stubDb({ zones, fees }), 'o1', { city: 'Luxor', covers_sights: ['Karnak'] }, null)).toMatchObject({ ok: false, status: 400 })
  })
  it('blank area = the default; not sent = the stored one, unless the city changed', async () => {
    expect(await cardZoneWrite(stubDb({ zones }), 'o1', { city: 'Luxor', zone: '' }, null)).toEqual({ ok: true, patch: { zone: null } })
    expect(await cardZoneWrite(stubDb({ zones }), 'o1', { city: 'Luxor' }, { zone: 'west_bank' })).toEqual({ ok: true, patch: { zone: 'west_bank' } })
    expect(await cardZoneWrite(stubDb({ zones }), 'o1', { city: 'Cairo' }, { zone: 'west_bank' })).toEqual({ ok: true, patch: { zone: null } })
  })
  it('before the migration: nothing written, and asking for an area or sights is refused with the reason', async () => {
    expect(await cardZoneWrite(stubDb({ columns: false }), 'o1', { city: 'Luxor' }, null)).toEqual({ ok: true, patch: {} })
    expect(await cardZoneWrite(stubDb({ columns: false }), 'o1', { city: 'Luxor', zone: '', covers_sights: [] }, null)).toEqual({ ok: true, patch: {} })
    expect(await cardZoneWrite(stubDb({ columns: false }), 'o1', { city: 'Luxor', zone: 'west_bank' }, null)).toMatchObject({ ok: false, status: 503 })
  })
})

describe('sheet, same-rate rule and engine wiring', () => {
  it('the transport sheet carries Zone and Covers Sights (a list)', () => {
    const cfg = RATE_TABLE_CONFIGS.transportation_rates
    expect(cfg.columns.map(c => c.name)).toEqual(expect.arrayContaining(['zone', 'covers_sights']))
    const out = validateImportData([{ service_code: 'X', service_type: 'day_tour', city: 'Luxor', covers_sights: 'Karnak Temple; Luxor Temple' }], cfg)
    expect(out.parsedValidRows?.[0]?.covers_sights).toEqual(['Karnak Temple', 'Luxor Temple'])
    expect(read('app/api/rates/bulk/import/route.ts')).toContain('resolveCardSights(row.covers_sights, feeNames)')
  })
  it('the same route in two areas is two rates', () => {
    const base = { service_type: 'airport_transfer', city: 'Luxor', route_name: 'Airport' }
    expect(transportRateKey({ ...base, zone: 'west_bank' })).not.toBe(transportRateKey({ ...base, zone: null }))
  })
  it('both form save routes write the area and sights through cardZoneWrite', () => {
    for (const f of ['app/api/resources/transportation/route.ts', 'app/api/resources/transportation/[id]/route.ts']) {
      const src = read(f)
      expect(src).toContain('cardZoneWrite(supabaseAdmin, orgId, body,')
      expect(src).toContain('...zoneWrite.patch,')
    }
  })
  it('the engine reads each rate as its area (the default area = none), and drops area rates if zones cannot be read', () => {
    const src = read('lib/auto-pricing-service.ts')
    expect(src).toContain('.filter(r => zones || !r.zone)')
    expect(src).toContain('zone: zones && isNonDefaultZone(zones, r.city, r.zone) ? r.zone : null')
    expect(src).toMatch(/if \(error\) \{ console\.error\('city zones read error:', error\.message\); return null \}/)
  })
  it('deleting a zone transport rates price is refused', () => {
    expect(read('app/api/settings/zones/[id]/route.ts')).toContain("from('transportation_rates')")
  })
})
