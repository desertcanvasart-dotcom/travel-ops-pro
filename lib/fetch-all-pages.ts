/**
 * Fetch every row of a paginated list endpoint by walking `?page=` until a
 * short page comes back.
 *
 * The list APIs clamp `?limit=` server-side (invoices / payments /
 * itineraries: max 1000 per page, clients: max 200), so any single request
 * silently truncates once a table outgrows the cap. Call sites whose
 * correctness depends on the FULL set (stats cards, calendar, list pages)
 * must use this helper instead of a one-shot `fetch(url + '?limit=1000')`.
 *
 * Handles all three response shapes the list APIs use: bare array
 * (/api/invoices), `{ data: [...] }` (/api/payments, /api/itineraries),
 * `{ clients: [...] }` (/api/clients).
 *
 * Rows are deduped by `id` across pages: the lists are ordered newest-first,
 * so a row inserted while paging shifts existing rows down and the next page
 * can re-serve one. (The converse — a row deleted mid-walk letting another
 * slip between pages — is possible but rare and self-heals on next load.)
 */
export interface FetchAllPagesOptions {
  /** Rows per page. Must not exceed the endpoint's server-side cap. */
  pageSize?: number
  /** Safety valve against runaway loops; ~30k rows at the default size. */
  maxPages?: number
  init?: RequestInit
}

export async function fetchAllPages<T extends { id?: string | number }>(
  baseUrl: string,
  { pageSize = 1000, maxPages = 30, init }: FetchAllPagesOptions = {}
): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string | number>()

  for (let page = 1; page <= maxPages; page++) {
    const sep = baseUrl.includes('?') ? '&' : '?'
    const res = await fetch(`${baseUrl}${sep}page=${page}&limit=${pageSize}`, init)
    if (!res.ok) {
      // Throw rather than return a partial set — a partial set silently
      // presented as "everything" is exactly the bug this helper exists to fix.
      throw new Error(`fetchAllPages: GET ${baseUrl} page ${page} failed (${res.status})`)
    }
    const json = await res.json()
    const batch: T[] = Array.isArray(json)
      ? json
      : json?.data ?? json?.clients ?? []

    for (const row of batch) {
      const key = row?.id
      if (key != null) {
        if (seen.has(key)) continue
        seen.add(key)
      }
      rows.push(row)
    }

    if (batch.length < pageSize) return rows
  }

  console.warn(
    `fetchAllPages: hit maxPages=${maxPages} on ${baseUrl}; result may be incomplete`
  )
  return rows
}
