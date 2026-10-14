// A small in-memory stand-in for the supabase-js query builder, enough for the
// finance routes (supplier-invoices, accounts-payable, accounts-receivable):
// select / insert / update / delete / upsert, eq / neq / in / gt / ilike /
// order / range / limit, single / maybeSingle, and awaiting the builder.
// `supplier_invoices(...)` in a select joins the bill onto a junction row.

type Row = Record<string, any>
export const tables: Record<string, Row[]> = {}
export let seq = 0
export const calls: Array<{ table: string; op: string; payload?: unknown }> = []

export function resetDb(data: Record<string, Row[]> = {}) {
  for (const k of Object.keys(tables)) delete tables[k]
  for (const [k, v] of Object.entries(data)) tables[k] = v.map(r => ({ ...r }))
  seq = 0
  calls.length = 0
}

let ids = 0
const newId = () => `gen-${++ids}`

function ilike(value: unknown, pattern: string) {
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let src = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) src += esc(pattern[++i])
    else if (c === '%') src += '.*'
    else if (c === '_') src += '.'
    else src += esc(c)
  }
  return new RegExp(`^${src}$`, 'i').test(String(value ?? ''))
}

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  let payload: any = null
  let orderBy: { col: string; asc: boolean } | null = null
  let rangeFrom = 0
  let rangeTo = Infinity
  let selectCols = '*'
  let wantRows = false

  const rows = () => (tables[table] ||= [])
  const matching = () => rows().filter(r => filters.every(f => f(r)))

  const withJoin = (r: Row) => {
    const out: Row = { ...r }
    if (/supplier_invoices\(/.test(selectCols) && r.supplier_invoice_id) {
      out.supplier_invoices = (tables.supplier_invoices || []).find(b => b.id === r.supplier_invoice_id) ?? null
    }
    return out
  }

  const run = (): { data: any; error: any } => {
    calls.push({ table, op, payload })
    if (op === 'insert') {
      const list = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: newId(), ...p }))
      // the unique index on supplier bills (org, supplier name, number) minus cancelled
      if (table === 'supplier_invoices') {
        for (const n of list) {
          const dup = rows().find(r => r.status !== 'cancelled' && r.org_id === n.org_id &&
            String(r.supplier_name).trim().toLowerCase() === String(n.supplier_name).trim().toLowerCase() &&
            String(r.supplier_invoice_number).trim().toLowerCase() === String(n.supplier_invoice_number).trim().toLowerCase())
          if (dup) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "supplier_invoices_org_supplier_number_key"' } }
        }
      }
      rows().push(...list.map(r => ({ status: 'received', match_status: 'unmatched', matched_amount: 0, ...r })))
      return { data: list, error: null }
    }
    if (op === 'update') {
      const hit = matching()
      hit.forEach(r => Object.assign(r, payload))
      return { data: hit.map(withJoin), error: null }
    }
    if (op === 'delete') {
      const hit = matching()
      tables[table] = rows().filter(r => !hit.includes(r))
      return { data: hit, error: null }
    }
    if (op === 'upsert') {
      for (const p of payload) {
        const ex = rows().find(r => r.supplier_invoice_id === p.supplier_invoice_id && r.expense_id === p.expense_id)
        if (ex) Object.assign(ex, p)
        else rows().push({ id: newId(), ...p })
      }
      return { data: payload, error: null }
    }
    let out = matching().map(withJoin)
    if (orderBy) out = [...out].sort((a, b) => (a[orderBy!.col] > b[orderBy!.col] ? 1 : -1) * (orderBy!.asc ? 1 : -1))
    out = out.slice(rangeFrom, rangeTo === Infinity ? undefined : rangeTo + 1)
    return { data: out, error: null }
  }

  const b: any = {
    select: (cols = '*') => { selectCols = cols; wantRows = true; return b },
    insert: (p: any) => { op = 'insert'; payload = p; return b },
    update: (p: any) => { op = 'update'; payload = p; return b },
    delete: () => { op = 'delete'; return b },
    upsert: (p: any) => { op = 'upsert'; payload = p; return b },
    eq: (c: string, v: any) => { filters.push(r => r[c] === v); return b },
    neq: (c: string, v: any) => { filters.push(r => r[c] !== v); return b },
    in: (c: string, v: any[]) => { filters.push(r => v.includes(r[c])); return b },
    gt: (c: string, v: any) => { filters.push(r => Number(r[c]) > Number(v)); return b },
    gte: (c: string, v: any) => { filters.push(r => r[c] >= v); return b },
    lte: (c: string, v: any) => { filters.push(r => r[c] <= v); return b },
    not: () => b,
    ilike: (c: string, pat: string) => { filters.push(r => ilike(r[c], pat)); return b },
    order: (col: string, o?: { ascending?: boolean }) => { orderBy ||= { col, asc: o?.ascending !== false }; return b },
    range: (f: number, t: number) => { rangeFrom = f; rangeTo = t; return b },
    limit: (n: number) => { rangeTo = n - 1; return b },
    single: async () => { const r = run(); const d = Array.isArray(r.data) ? r.data[0] : r.data; return d ? { data: d, error: r.error } : { data: null, error: r.error || { code: 'PGRST116', message: 'no rows' } } },
    maybeSingle: async () => { const r = run(); return { data: (Array.isArray(r.data) ? r.data[0] : r.data) ?? null, error: r.error } },
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  }
  void wantRows
  return b
}

export const fakeClient = {
  from: (t: string) => builder(t),
  rpc: async () => ({ data: ++seq, error: null }),
}
