// ============================================
// Which supplier documents a trip needs — one per supplier, per real reason
// ============================================
// "Generate documents" writes the vouchers and orders sent to suppliers. The
// rule is: every party that delivers something gets ONE document listing all
// of it, and a second one only for a genuine operational reason:
//
//   hotel      one voucher per STAY — the same property on consecutive nights.
//              Three nights at one hotel is one voucher (check-in, check-out
//              the morning after the last night); the same hotel again after a
//              cruise is a second stay, so a second voucher.
//   cruise     one voucher per SAILING — the same ship on consecutive nights:
//              embarkation, disembarkation, the ports day by day, the cabin.
//   transport  one voucher per supplier per PLACE: every route, date and
//              pickup that supplier drives in Cairo on one voucher; its Luxor
//              work on another (a different local team).
//   guide      one assignment per GUIDE for the whole booking — the guide on
//              the trip's resource assignments, or the supplier on the line —
//              with every date, place and the languages required. Guiding
//              with nobody assigned yet is grouped per place, since different
//              cities are normally different guides.
//   entrance   one order for the whole booking (per supplier when one is on
//              the line): every site, day by day.
//   meals      per supplier; unassigned meals per place (local restaurants).
//   assist     airport and hotel meet & assist: per supplier; unassigned per
//              place ("Cairo Meet & Assist").
//
// Before, a supplier's services all went on one document whatever they were
// (a Cairo and an Aswan stay on one voucher, dated from the first night to the
// LAST night, so three nights printed as two), cruise nights split by the
// port they were moored at, unassigned hotels were "Cairo Hotel" whichever
// hotel it was, and guides ignored the guide actually assigned.
//
// Pure: the route and the tests share it.

import { docMappingFor, serviceCity, PlaceNames, entranceLineName, type ServiceMapping } from './group-services'
import { propertyFromService } from '@/lib/itineraries/overnight-property'

export interface PlanService {
  id?: string | null
  service_type?: string | null
  service_name?: string | null
  service_code?: string | null
  description?: string | null
  notes?: string | null
  quantity?: number | null
  total_cost?: number | string | null
  supplier_id?: string | null
  supplier_name?: string | null
  city?: string | null
}

export interface PlanDay {
  id?: string | null
  day_number: number
  date: string | null
  city?: string | null
  overnight_city?: string | null
  attractions?: unknown[] | null
  services: PlanService[]
}

export interface PlanSupplier {
  id: string
  name: string
  type?: string | null
}

/** A guide on the trip's resource assignments (itinerary_resources, type guide). */
export interface PlanGuide {
  guide_id: string
  name: string
  languages?: string[] | null
  phone?: string | null
  email?: string | null
  whatsapp?: string | null
  itinerary_day_id?: string | null
  start_date: string
  end_date?: string | null
  status?: string | null
}

export interface PlannedService {
  service_id: string | null
  service_type: string | null
  service_name: string
  quantity: number | null
  date: string | null
  day_number: number
  city: string
  notes: string | null
  total_cost: number | string | null
}

export interface PlannedDocument {
  /** Stable for the same grouping: docType, who, and the split. */
  key: string
  docType: string
  supplierId: string | null
  guide: PlanGuide | null
  supplierName: string
  city: string
  services: PlannedService[]
  /** First and last service date. */
  firstDate: string | null
  lastDate: string | null
  /** Hotel and cruise: the first night, and the morning after the last. */
  checkIn: string | null
  checkOut: string | null
  /** What the supplier needs beyond the lines: the cruise's days, the guide's languages. */
  details: string | null
}

/** Supplier type → the document its services go on (one document per supplier). */
export const SUPPLIER_TO_DOC_TYPE: Record<string, string> = {
  hotel: 'hotel_voucher',
  hotel_chain: 'hotel_voucher',
  transport: 'transport_voucher',
  local_operator: 'transport_voucher',
  driver: 'transport_voucher',
  guide: 'guide_assignment',
  cruise: 'cruise_voucher',
  cruise_line: 'cruise_voucher',
  restaurant: 'service_order',
  activity_provider: 'service_order',
  attraction: 'service_order',
  tour_operator: 'service_order',
  ground_handler: 'service_order',
  dmc: 'service_order',
}

const DEFAULT_NAMES: Record<string, string> = {
  hotel_voucher: 'Hotel',
  transport_voucher: 'Transportation',
  guide_assignment: 'Guide Services',
  cruise_voucher: 'Nile Cruise',
  activity_voucher: 'Entrance Fees',
  meals: 'Restaurant & Meals',
  assistance: 'Meet & Assist',
  service_order: 'Ground Services',
}

const clean = (s: unknown): string => String(s ?? '').trim()
const day10 = (d: string | null | undefined): string | null => (d ? String(d).slice(0, 10) : null)

/** The morning after a night: YYYY-MM-DD + 1 day, in UTC so no timezone shifts it. */
export function nextDay(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const shortDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''

/** Whether a guide assignment is in force on a day. */
function guideCovers(g: PlanGuide, day: PlanDay): boolean {
  if (String(g.status ?? '').toLowerCase() === 'cancelled') return false
  if (g.itinerary_day_id) return g.itinerary_day_id === day.id
  const date = day10(day.date)
  const start = day10(g.start_date)
  if (!date || !start) return false
  const end = day10(g.end_date) ?? start
  return date >= start && date <= end
}

/** Who delivers a line, and so whose document it goes on. */
type Party =
  | { kind: 'supplier'; supplier: PlanSupplier }
  | { kind: 'guide'; guide: PlanGuide }
  | { kind: 'none' }

interface Entry {
  party: Party
  docType: string
  mapping: ServiceMapping
  day: PlanDay
  place: string
  service: PlannedService
  /** Hotel / cruise: the property the night is at (null for a supplement line). */
  property: string | null
}

const partyKey = (p: Party) =>
  p.kind === 'supplier' ? `s:${p.supplier.id}` : p.kind === 'guide' ? `g:${p.guide.guide_id}` : 'none'

const NIGHT_TYPES = new Set(['accommodation', 'hotel', 'cruise'])
const NOT_THE_NIGHT = /^(hotel supplement|cruise supplement|single supplement|triple reduction|throughout guide)\b/i

/** A line that is the night itself — not a supplement, not a meal at the hotel. */
function isNightLine(s: PlanService): boolean {
  const grid = String(s.description ?? '').startsWith('[pricing-grid:cruise]')
  return (grid || NIGHT_TYPES.has(clean(s.service_type).toLowerCase())) && !NOT_THE_NIGHT.test(clean(s.service_name))
}

/** The ship a cruise line names; the grid tags its cruise lines in `description`. */
function cruiseName(s: PlanService): string | null {
  const property = propertyFromService({ ...s, service_type: 'cruise' })
  if (property) return property.name
  const supplier = clean(s.supplier_name)
  return supplier || null
}

export function planDocuments(input: {
  days: PlanDay[]
  suppliers: Record<string, PlanSupplier>
  guides?: PlanGuide[]
}): PlannedDocument[] {
  const places = new PlaceNames()
  const guides = input.guides ?? []
  const entries: Entry[] = []

  const days = [...input.days].sort((a, b) => a.day_number - b.day_number)
  for (const day of days) {
    for (const raw of day.services ?? []) {
      const mapping = docMappingFor(raw)
      if (!mapping?.docType) continue
      const place = places.name(serviceCity(mapping, { city: day.city || raw.city, overnight_city: day.overnight_city }))
      const name = mapping.category === 'entrance' ? entranceLineName(raw, day.attractions) : clean(raw.service_name)

      const supplier = raw.supplier_id ? input.suppliers[raw.supplier_id] : undefined
      let party: Party = { kind: 'none' }
      let docType = mapping.docType
      if (supplier) {
        party = { kind: 'supplier', supplier }
        docType = (supplier.type && SUPPLIER_TO_DOC_TYPE[supplier.type]) || mapping.docType
      } else if (mapping.docType === 'guide_assignment') {
        const guide = guides.find(g => guideCovers(g, day))
        if (guide) party = { kind: 'guide', guide }
      }

      // The property only a NIGHT line names; a supplement or a dinner at the
      // hotel joins the stay it falls in. A night line that does not parse
      // falls back to its supplier's name.
      let property: string | null = null
      const night = isNightLine(raw)
      if (night && docType === 'hotel_voucher') {
        property = propertyFromService(raw)?.name ?? (supplier ? supplier.name : null)
      } else if (night && docType === 'cruise_voucher') {
        property = cruiseName(raw) ?? (supplier ? supplier.name : null)
      }

      entries.push({
        party,
        docType,
        mapping,
        day,
        place,
        property,
        service: {
          service_id: raw.id ?? null,
          service_type: raw.service_type ?? null,
          service_name: name || clean(raw.service_type) || 'Service',
          quantity: raw.quantity ?? null,
          date: day10(day.date),
          day_number: day.day_number,
          city: place,
          notes: raw.notes ?? null,
          total_cost: raw.total_cost ?? null,
        },
      })
    }
  }

  const groups = new Map<string, Entry[]>()
  const add = (key: string, e: Entry) => {
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }

  // ── Nights: hotel stays and cruise sailings ─────────────────────────────
  // A run of consecutive nights at one property is one document. A line that
  // names no property (a supplement, a placeholder "Hotel (Cairo)") joins the
  // stay of the same party covering its night, else stands on its own.
  for (const docType of ['hotel_voucher', 'cruise_voucher'] as const) {
    const nights = entries.filter(e => e.docType === docType)
    const named = nights.filter(e => e.property)
    const runs: Array<{ key: string; party: string; property: string; first: number; last: number }> = []
    const byProperty = new Map<string, Entry[]>()
    for (const e of named) {
      const k = `${partyKey(e.party)}|${e.property!.toLowerCase()}`
      byProperty.set(k, [...(byProperty.get(k) ?? []), e])
    }
    for (const [k, list] of byProperty) {
      const dayNumbers = [...new Set(list.map(e => e.day.day_number))].sort((a, b) => a - b)
      let start = dayNumbers[0]
      let prev = dayNumbers[0]
      const flush = () => runs.push({ key: `${docType}|${k}|${start}`, party: k.split('|')[0], property: k, first: start, last: prev })
      for (const n of dayNumbers.slice(1)) {
        if (n !== prev + 1) { flush(); start = n }
        prev = n
      }
      flush()
    }
    for (const e of nights) {
      const n = e.day.day_number
      const own = e.property ? runs.find(r => r.property === `${partyKey(e.party)}|${e.property!.toLowerCase()}` && n >= r.first && n <= r.last) : undefined
      const host = own ?? runs.find(r => r.party === partyKey(e.party) && n >= r.first && n <= r.last)
      add(host ? host.key : `${docType}|${partyKey(e.party)}|${e.place.toLowerCase()}|unnamed|${clean(e.service.service_name).toLowerCase()}`, e)
    }
  }

  // ── Everything else ─────────────────────────────────────────────────────
  for (const e of entries) {
    if (e.docType === 'hotel_voucher' || e.docType === 'cruise_voucher') continue
    const who = partyKey(e.party)
    const assigned = e.party.kind !== 'none'
    let split = ''
    if (e.docType === 'transport_voucher') split = e.place.toLowerCase()           // per supplier per place
    else if (e.docType === 'activity_voucher') split = ''                          // one per booking
    else if (!assigned) split = `${e.place.toLowerCase()}|${e.mapping.category ?? ''}` // unassigned guide / meals / other: per place
    add(`${e.docType}|${who}|${split}`, e)
  }

  const docs: PlannedDocument[] = []
  for (const [key, list] of groups) {
    const first = list[0]
    const docType = first.docType
    const services = list.map(e => e.service).sort((a, b) => a.day_number - b.day_number)
    const dates = services.map(s => s.date).filter((d): d is string => !!d).sort()
    const placesInDoc = [...new Set(list.map(e => e.place))]
    const nightly = docType === 'hotel_voucher' || docType === 'cruise_voucher'

    let supplierName: string
    const party = first.party
    if (party.kind === 'supplier') supplierName = party.supplier.name
    else if (party.kind === 'guide') supplierName = party.guide.name
    else if (nightly && list.find(e => e.property)?.property) supplierName = list.find(e => e.property)!.property!
    else if (docType === 'activity_voucher') supplierName = DEFAULT_NAMES.activity_voucher
    else {
      const category = first.mapping.category
      const base = category === 'meals' || category === 'assistance' ? DEFAULT_NAMES[category] : DEFAULT_NAMES[docType] ?? 'Services'
      supplierName = `${first.place} ${base}`
    }

    const nightDates = nightly
      ? [...new Set(list.filter(e => e.property).map(e => e.service.date).filter((d): d is string => !!d))].sort()
      : []
    const checkIn = nightly ? (nightDates[0] ?? dates[0] ?? null) : null
    const lastNight = nightly ? (nightDates[nightDates.length - 1] ?? dates[dates.length - 1] ?? null) : null
    const checkOut = lastNight ? nextDay(lastNight) : null

    let details: string | null = null
    if (docType === 'cruise_voucher' && checkIn) {
      const sailingDays = [...new Map(list.map(e => [e.day.day_number, e.day])).values()].sort((a, b) => a.day_number - b.day_number)
      const ports = sailingDays.map(d => `${shortDate(day10(d.date))} ${clean(d.city) || clean(d.overnight_city)}`.trim())
      const cabin = list
        .map(e => `${e.service.service_name} ${e.service.notes ?? ''}`)
        .join(' ')
        .match(/\b([A-Za-z ]{0,20}(?:cabin|suite|stateroom)[A-Za-z ]{0,12})/i)?.[1]?.trim()
      const nights = nightDates.length || sailingDays.length
      details = [
        `Embarkation ${shortDate(checkIn)}, disembarkation ${shortDate(checkOut)} — ${nights} night${nights === 1 ? '' : 's'}.`,
        `Day by day: ${ports.join(' · ')}.`,
        cabin ? `Cabin: ${cabin}.` : null,
      ].filter(Boolean).join('\n')
    } else if (docType === 'guide_assignment') {
      const languages = party.kind === 'guide' ? (party.guide.languages ?? []).filter(Boolean) : []
      details = [
        `Days: ${services.map(s => `${shortDate(s.date)} ${s.city}`).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}.`,
        languages.length ? `Languages: ${languages.join(', ')}.` : null,
      ].filter(Boolean).join('\n')
    }

    docs.push({
      key,
      docType,
      supplierId: party.kind === 'supplier' ? party.supplier.id : null,
      guide: party.kind === 'guide' ? party.guide : null,
      supplierName,
      city: placesInDoc.join(', '),
      services,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      checkIn,
      checkOut,
      details,
    })
  }

  return docs.sort((a, b) => (a.firstDate ?? '').localeCompare(b.firstDate ?? '') || a.docType.localeCompare(b.docType))
}

/**
 * Whether a service is already on a document: by its id when both have one,
 * else by day, type and name (documents made before ids were stored).
 */
export function serviceDocKeys(s: { service_id?: string | null; day_number?: number | null; service_type?: string | null; service_name?: string | null }): string[] {
  const keys = [`n:${s.day_number ?? ''}|${clean(s.service_type).toLowerCase()}|${clean(s.service_name).toLowerCase()}`]
  if (s.service_id) keys.unshift(`id:${s.service_id}`)
  return keys
}

/** Every key a document's lines are recognised by. */
export function documentedKeys(docs: Array<{ services?: unknown }>): Set<string> {
  const keys = new Set<string>()
  for (const doc of docs) {
    for (const s of (Array.isArray(doc.services) ? doc.services : []) as Array<Parameters<typeof serviceDocKeys>[0]>) {
      for (const k of serviceDocKeys(s)) keys.add(k)
    }
  }
  return keys
}

/** The planned documents with the lines no document holds yet: what
 *  Generate would make. Plans whose lines are all on documents drop out. */
export function missingDocuments(plans: PlannedDocument[], documented: Set<string>): PlannedDocument[] {
  return plans.flatMap(plan => {
    const services = plan.services.filter(s => !serviceDocKeys(s).some(k => documented.has(k)))
    return services.length ? [{ ...plan, services }] : []
  })
}

/**
 * The trip's documents that no longer match it: lines on them the trip does
 * not have any more (removed, renamed, moved to another day). Documents are a
 * snapshot of the trip when Generate ran; an edit afterwards left them as
 * they were, and nothing said so. A line that names no day and service (a
 * document made by hand) is never counted.
 */
export function staleDocuments(
  plans: PlannedDocument[],
  docs: Array<{ id: string; document_number?: string | null; supplier_name?: string | null; services?: unknown }>,
): Array<{ id: string; document_number: string | null; supplier_name: string | null; gone: number }> {
  const current = new Set(plans.flatMap(p => p.services.flatMap(serviceDocKeys)))
  return docs.flatMap(doc => {
    const lines = (Array.isArray(doc.services) ? doc.services : []) as Array<Record<string, unknown>>
    const gone = lines
      .filter(l => l && l.day_number != null && clean(l.service_name))
      .filter(l => !serviceDocKeys(l as Parameters<typeof serviceDocKeys>[0]).some(k => current.has(k)))
      .length
    return gone ? [{ id: doc.id, document_number: doc.document_number ?? null, supplier_name: doc.supplier_name ?? null, gone }] : []
  })
}
