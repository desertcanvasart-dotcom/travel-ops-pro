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

type Row = Record<string, any>
export type MockTables = Record<string, Row[]>

let currentTables: MockTables = {}

/** Install the dataset the next engine call will read from. */
export function setMockTables(tables: MockTables): void {
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
    update(patch: Row) {
      pendingPatch = { ...patch }
      return builder
    },
    delete() {
      pendingDelete = true
      return builder
    },
    eq(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] === val)
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
    // exercise them need "no answer" rather than "no such method".
    rpc: async (_fn: string, _args?: Record<string, unknown>) => ({ data: null, error: null }),
  }
}
