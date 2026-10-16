// In-memory Supabase mock for hermetic pricing-engine tests.
//
// Reproduces just enough of the supabase-js query builder for
// lib/auto-pricing-service.ts (canonical rate-resolution core):
// from/select/eq/ilike/contains/or/in/order/limit plus the terminal forms
// (.single(), .maybeSingle(), and awaiting the builder directly -> { data, error }).
//
// Ported from the sibling app (autoura-saas). Tests set the dataset with
// setMockTables({ table: rows }) before invoking the engine.
// See PRICING-HARNESS-PLAN.md (Layer 0).

import { seatsFree } from '@/lib/departures/seats'

type Row = Record<string, any>
export type MockTables = Record<string, Row[]>

let currentTables: MockTables = {}

// Every rate table carries org_id since 20261206 (tour templates, variations
// and legacy tours since 20261207), and every reader filters by the caller's
// company. A hermetic fixture is ONE company's catalogue: a row of these
// tables that names no company is MOCK_ORG's. A test about two companies sets
// org_id on its rows explicitly (and those are left alone).
export const MOCK_ORG = 'org-1'
const RATE_TABLES = new Set([
  'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
  'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
  'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
  'seasonal_rates', 'vehicle_rates', 'fixed_daily_costs', 'attraction_aliases', 'destinations',
  'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts',
  'tour_templates', 'tour_variations', 'tours',
])

/** Every rpc() call since the last setMockTables, in order. */
export const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = []

/** Install the dataset the next engine call will read from. */
export function setMockTables(tables: MockTables): void {
  rpcCalls.length = 0
  for (const [table, rows] of Object.entries(tables)) {
    if (!RATE_TABLES.has(table) || !Array.isArray(rows)) continue
    for (const row of rows) if (row && !('org_id' in row)) row.org_id = MOCK_ORG
  }
  currentTables = tables
}

// Parse a PostgREST `.or()` expression like "direction.eq.arrival,direction.eq.both"
// and keep rows matching ANY clause. eq (the pricing engine's only operator),
// plus what the email lists send: is.null / is.true / is.false, in.(…),
// ilike, gt/gte/lt/lte, and(…), and "quoted" values.
function splitTop(expr: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of expr) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  if (cur) parts.push(cur)
  return parts
}
const unquote = (v: string) => v.replace(/^"(.*)"$/, '$1')
function clauseMatches(row: Row, clause: string): boolean {
  if (clause.startsWith('and(')) return splitTop(clause.slice(4, -1)).every((c) => clauseMatches(row, c))
  if (clause.startsWith('or(')) return splitTop(clause.slice(3, -1)).some((c) => clauseMatches(row, c))
  const [col, op, ...rest] = clause.split('.')
  const val = rest.join('.')
  const v = row[col]
  switch (op) {
    case 'eq': return String(v) === unquote(val)
    case 'neq': return String(v) !== unquote(val)
    case 'is': return val === 'null' ? v == null : String(v) === val
    case 'in': return splitTop(val.replace(/^\((.*)\)$/, '$1')).map(unquote).includes(String(v))
    case 'ilike': return String(v ?? '').toLowerCase().includes(unquote(val).replace(/%/g, '').toLowerCase())
    case 'gt': return v != null && v > unquote(val)
    case 'gte': return v != null && v >= unquote(val)
    case 'lt': return v != null && v < unquote(val)
    case 'lte': return v != null && v <= unquote(val)
    default: return false
  }
}
function applyOr(rows: Row[], expr: string): Row[] {
  const clauses = splitTop(expr)
  return rows.filter((r) => clauses.some((cl) => clauseMatches(r, cl)))
}

let idCounter = 0

function makeQuery(rows: Row[], table?: string) {
  let filtered = [...rows]
  // Set by .update(patch); applied to the filtered rows at terminal time
  // (PostgREST semantics: filters compose before the write executes).
  let pendingPatch: Row | null = null
  // Set by .delete(); the filtered rows leave the table at terminal time.
  let pendingDelete = false

  function applyPendingPatch() {
    if (pendingDelete && table) {
      const gone = new Set(filtered)
      currentTables[table] = (currentTables[table] ?? []).filter((r) => !gone.has(r))
      pendingDelete = false
    }
    if (pendingPatch) {
      // `filtered` holds references to the live table rows, so assigning
      // mutates the stored data — matching a real UPDATE.
      for (const row of filtered) Object.assign(row, pendingPatch)
      pendingPatch = null
    }
  }

  const builder: any = {
    select() {
      return builder
    },
    insert(payload: Row | Row[]) {
      if (!table) throw new Error('mock insert: table name not provided')
      const inserted = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
        id: r.id ?? `mock-${table}-${++idCounter}`,
        ...r,
      }))
      if (!currentTables[table]) currentTables[table] = []
      currentTables[table].push(...inserted)
      // After insert, the builder's result set IS the inserted rows, so the
      // real-client chains `.insert(x).select().single()` and plain
      // `await .insert(rows)` both behave correctly.
      filtered = inserted
      return builder
    },
    // INSERT … ON CONFLICT (onConflict columns) DO UPDATE: a row matching an
    // existing one on every conflict column updates it; any other is inserted.
    upsert(payload: Row | Row[], opts: { onConflict?: string } = {}) {
      if (!table) throw new Error('mock upsert: table name not provided')
      const cols = (opts.onConflict ?? 'id').split(',').map((c) => c.trim())
      if (!currentTables[table]) currentTables[table] = []
      const written: Row[] = []
      for (const r of Array.isArray(payload) ? payload : [payload]) {
        const hit = currentTables[table].find((x) => cols.every((c) => x[c] === r[c]))
        if (hit) { Object.assign(hit, r); written.push(hit) }
        else {
          const row = { id: r.id ?? `mock-${table}-${++idCounter}`, ...r }
          currentTables[table].push(row)
          written.push(row)
        }
      }
      filtered = written
      return builder
    },
    update(patch: Row) {
      pendingPatch = { ...patch }
      return builder
    },
    delete() {
      pendingDelete = true
      return builder
    },
    eq(col: string, val: any) {
      // A dotted column filters on an embedded row the fixture carries
      // (`destinations.org_id` → row.destinations.org_id), as PostgREST's
      // !inner embeds do.
      const at = (r: Row) => col.includes('.') ? col.split('.').reduce((o: any, k) => (o == null ? o : o[k]), r) : r[col]
      filtered = filtered.filter((r) => at(r) === val)
      return builder
    },
    neq(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] !== val)
      return builder
    },
    is(col: string, val: any) {
      // PostgREST .is(): used by the rate routes as .is('col', null) -> SQL IS NULL.
      filtered = filtered.filter((r) => (val === null ? r[col] == null : r[col] === val))
      return builder
    },
    gt(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] != null && r[col] > val)
      return builder
    },
    gte(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] != null && r[col] >= val)
      return builder
    },
    lt(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] != null && r[col] < val)
      return builder
    },
    not(col: string, op: string, val: any) {
      // .not('col', 'is', null) and .not('col', 'in', '(a,b)') — the forms routes use.
      if (op === 'is') filtered = filtered.filter((r) => (val === null ? r[col] != null : r[col] !== val))
      else if (op === 'in') {
        const list = String(val).replace(/^\(|\)$/g, '').split(',')
        filtered = filtered.filter((r) => !list.includes(String(r[col])))
      }
      return builder
    },
    lte(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] != null && r[col] <= val)
      return builder
    },
    ilike(col: string, pattern: string) {
      const needle = String(pattern).replace(/%/g, '').toLowerCase()
      filtered = filtered.filter((r) =>
        String(r[col] ?? '').toLowerCase().includes(needle)
      )
      return builder
    },
    contains(col: string, arr: any[]) {
      filtered = filtered.filter(
        (r) => Array.isArray(r[col]) && arr.every((a) => r[col].includes(a))
      )
      return builder
    },
    overlaps(col: string, arr: unknown[]) {
      filtered = filtered.filter(
        (r) => Array.isArray(r[col]) && arr.some((a) => r[col].includes(a))
      )
      return builder
    },
    in(col: string, arr: any[]) {
      filtered = filtered.filter((r) => arr.includes(r[col]))
      return builder
    },
    or(expr: string) {
      filtered = applyOr(filtered, expr)
      return builder
    },
    order(col: string, opts: { ascending?: boolean } = {}) {
      const asc = opts.ascending !== false
      filtered = [...filtered].sort((a, b) => {
        const av = a[col]
        const bv = b[col]
        if (av === bv) return 0
        const cmp = av > bv ? 1 : -1
        return asc ? cmp : -cmp
      })
      return builder
    },
    limit(n: number) {
      filtered = filtered.slice(0, n)
      return builder
    },
    // PostgREST's inclusive row window (.range(0, 999) = the first 1000).
    range(from: number, to: number) {
      filtered = filtered.slice(from, to + 1)
      return builder
    },
    single() {
      applyPendingPatch()
      return Promise.resolve(
        filtered.length
          ? { data: filtered[0], error: null }
          : { data: null, error: { message: 'No rows found' } }
      )
    },
    maybeSingle() {
      applyPendingPatch()
      return Promise.resolve({ data: filtered[0] ?? null, error: null })
    },
    // Make the builder awaitable: `await query` -> { data: rows[], error: null }
    then(onFulfilled: any, onRejected: any) {
      applyPendingPatch()
      return Promise.resolve({ data: filtered, error: null, count: filtered.length }).then(
        onFulfilled,
        onRejected
      )
    },
  }

  return builder
}

/** Drop-in replacement for supabase-js `createClient`. */
export function createMockClient() {
  return {
    from: (table: string) => makeQuery(currentTables[table] ?? [], table),
    // Routes call database functions (generate_booking_code, …); tests that
    // exercise them need "no answer" rather than "no such method". Each call
    // is recorded in rpcCalls. hold_departure_seats is answered as the SQL
    // function does (migration 20261213, pinned on Postgres by
    // __tests__/migrations/departure-seat-holds-atomic.test.ts), because the
    // order intake's seat holds go only through it.
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      if (fn === 'hold_departure_seats' && args) return { data: holdDepartureSeats(args), error: null }
      if (fn === 'set_departure_seats' && args) return { data: setDepartureSeats(args), error: null }
      return { data: null, error: null }
    },
  }
}

/** In-memory hold_departure_seats (migration 20261215): lock (single-threaded
 *  here), open dates only, count the seats free by lib/departures/seats,
 *  insert the pending hold only if it fits. */
function holdDepartureSeats(a: Record<string, unknown>) {
  const dep = (currentTables.tour_departures ?? []).find((d) =>
    d.id === a.p_departure_id && d.org_id === a.p_org_id && ['open', 'limited', 'guaranteed'].includes(d.status))
  if (!dep) return { held: false, free: 0, id: null }
  const free = seatsFree(dep as any, liveHolds(a.p_org_id, a.p_departure_id) as any)
  const pax = Number(a.p_pax)
  if (pax > free) return { held: false, free, id: null }
  const row = {
    id: `mock-departure_bookings-${++idCounter}`, org_id: a.p_org_id, departure_id: a.p_departure_id,
    client_id: a.p_client_id ?? null, client_name: a.p_client_name ?? null, pax, status: 'pending', notes: a.p_notes ?? null,
  }
  ;(currentTables.departure_bookings ??= []).push(row)
  return { held: true, free, id: row.id }
}

function liveHolds(orgId: unknown, departureId: unknown): Row[] {
  return (currentTables.departure_bookings ?? []).filter((h) =>
    h.org_id === orgId && h.departure_id === departureId && (h.status === 'pending' || h.status === 'confirmed'))
}

/** In-memory set_departure_seats (migration 20261215): max_pax / booked_pax
 *  changed only when booked_pax + the live holds still fit. */
function setDepartureSeats(a: Record<string, unknown>) {
  const dep = (currentTables.tour_departures ?? []).find((d) => d.id === a.p_departure_id && d.org_id === a.p_org_id)
  if (!dep) return { ok: false, reason: 'not_found' }
  const max = a.p_max_pax != null ? Number(a.p_max_pax) : Number(dep.max_pax) || 0
  const booked = a.p_booked_pax != null ? Number(a.p_booked_pax) : Number(dep.booked_pax) || 0
  const held = liveHolds(a.p_org_id, a.p_departure_id).reduce((n, h) => n + (Number(h.pax) || 0), 0)
  const answer = { max_pax: max, booked_pax: booked, held, taken: booked + held }
  if (booked + held > max) return { ok: false, reason: 'below_taken', ...answer }
  dep.max_pax = max
  dep.booked_pax = booked
  return { ok: true, reason: null, ...answer }
}
