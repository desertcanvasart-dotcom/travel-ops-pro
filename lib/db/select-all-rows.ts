// ============================================
// Every row of a query, past PostgREST's row cap
// ============================================
// Supabase serves at most `max-rows` (1000 by default) rows per request and
// says nothing when it stops. A whole-table read — the supplier roster for an
// import's "already on file" check or name resolution, a rate table for the
// CSV export — silently became "the first thousand": an import re-created
// suppliers that existed, rejected rows naming a supplier past the cap, and
// an export dropped rows that a delete-and-re-import then lost for good.
//
// `build` returns a fresh, unordered query; `order` is applied here and must
// end with a unique column (id) so that pages neither overlap nor skip. A
// query object without `.range` (a test double) is read in one go.

const PAGE = 1000

export interface SelectAllOptions {
  order?: { column: string; ascending?: boolean }[]
  pageSize?: number
  maxPages?: number
}

export async function selectAllRows<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
  { order = [{ column: 'id' }], pageSize = PAGE, maxPages = 200 }: SelectAllOptions = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: T[] | null; error: any }> {
  const rows: T[] = []
  for (let page = 0; page < maxPages; page++) {
    let q = build()
    if (typeof q?.order === 'function') {
      for (const o of order) q = q.order(o.column, { ascending: o.ascending ?? true })
    }
    if (typeof q?.range !== 'function') {
      const { data, error } = await q
      return error ? { data: null, error } : { data: (data ?? []) as T[], error: null }
    }
    const from = page * pageSize
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) break
  }
  return { data: rows, error: null }
}
