import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchAllPages } from '@/lib/fetch-all-pages'

const originalFetch = global.fetch

function mockPages(pages: Record<number, unknown>, status = 200) {
  global.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const page = Number(new URL(String(url), 'http://x').searchParams.get('page'))
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => pages[page] ?? [],
    } as Response
  }) as typeof fetch
}

const rows = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `id-${start + i}` }))

describe('fetchAllPages', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns a single short page without a second request', async () => {
    mockPages({ 1: rows(0, 3) })
    const result = await fetchAllPages('/api/invoices', { pageSize: 5 })
    expect(result).toHaveLength(3)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('walks pages until a short page and concatenates', async () => {
    mockPages({ 1: rows(0, 5), 2: rows(5, 5), 3: rows(10, 2) })
    const result = await fetchAllPages('/api/invoices', { pageSize: 5 })
    expect(result).toHaveLength(12)
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(result[11]).toEqual({ id: 'id-11' })
  })

  it('appends page/limit with & when the url already has a query string', async () => {
    mockPages({ 1: [] })
    await fetchAllPages('/api/invoices?include=payments', { pageSize: 5 })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/invoices?include=payments&page=1&limit=5',
      undefined
    )
  })

  it('unwraps {data} and {clients} response shapes', async () => {
    mockPages({ 1: { success: true, data: rows(0, 2) } })
    expect(await fetchAllPages('/api/payments', { pageSize: 5 })).toHaveLength(2)

    mockPages({ 1: { clients: rows(0, 4) } })
    expect(await fetchAllPages('/api/clients', { pageSize: 5 })).toHaveLength(4)
  })

  it('dedupes rows re-served across page boundaries', async () => {
    // Row id-4 shifts down and reappears on page 2 (insert during the walk)
    mockPages({ 1: rows(0, 5), 2: [{ id: 'id-4' }, ...rows(5, 2)] })
    const result = await fetchAllPages('/api/invoices', { pageSize: 5 })
    expect(result).toHaveLength(7)
    expect(new Set(result.map(r => r.id)).size).toBe(7)
  })

  it('throws on a failed page instead of returning a partial set', async () => {
    mockPages({ 1: rows(0, 5) }, 500)
    await expect(fetchAllPages('/api/invoices', { pageSize: 5 })).rejects.toThrow(
      /page 1 failed \(500\)/
    )
  })

  it('stops at maxPages with a warning instead of looping forever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPages({ 1: rows(0, 5), 2: rows(5, 5), 3: rows(10, 5), 4: rows(15, 5) })
    const result = await fetchAllPages('/api/invoices', { pageSize: 5, maxPages: 2 })
    expect(result).toHaveLength(10)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledOnce()
  })
})
