// Production drops itineraries.client_id on INSERT (a rewrite that exists only
// there — see lib/itineraries/reassert-client.ts). These pin the safeguard:
// silent on a healthy database, an UPDATE when the link was lost, and never a
// throw — the trip was created, a lost link must not turn that into a 500.
import { describe, it, expect, vi } from 'vitest'
import { reassertClientId } from '@/lib/itineraries/reassert-client'

function fakeDb(updateResult: { data: { id: string; client_id: string | null } | null; error: { message: string } | null }) {
  const update = vi.fn()
  const db = {
    from: (_t: 'itineraries') => ({
      update: (values: { client_id: string }) => {
        update(values)
        return { eq: (_c: 'id', _v: string) => ({ select: (_s: 'id, client_id') => ({ single: async () => updateResult }) }) }
      },
    }),
  }
  return { db, update }
}

describe('reassertClientId', () => {
  it('does nothing when the insert kept the client (healthy database)', async () => {
    const { db, update } = fakeDb({ data: null, error: null })
    const r = await reassertClientId(db, { id: 'it-1', client_id: 'c-1' }, 'c-1')
    expect(r).toEqual({ outcome: 'kept' })
    expect(update).not.toHaveBeenCalled()
  })

  it('does nothing when no client was requested', async () => {
    const { db, update } = fakeDb({ data: null, error: null })
    expect(await reassertClientId(db, { id: 'it-1', client_id: null }, null)).toEqual({ outcome: 'not_requested' })
    expect(await reassertClientId(db, { id: 'it-1', client_id: null }, undefined)).toEqual({ outcome: 'not_requested' })
    expect(update).not.toHaveBeenCalled()
  })

  it('re-asserts the client by UPDATE when the insert dropped it — the production case', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, update } = fakeDb({ data: { id: 'it-1', client_id: 'c-1' }, error: null })
    const row = { id: 'it-1', client_id: null as string | null }
    const r = await reassertClientId(db, row, 'c-1')
    expect(r).toEqual({ outcome: 'reasserted', client_id: 'c-1' })
    expect(update).toHaveBeenCalledWith({ client_id: 'c-1' })
    expect(row.client_id).toBe('c-1') // the caller's object is made truthful
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/dropped on INSERT/))
    warn.mockRestore()
  })

  it('reports, never throws, when the update itself fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb({ data: null, error: { message: 'permission denied' } })
    const r = await reassertClientId(db, { id: 'it-1', client_id: null }, 'c-1')
    expect(r).toEqual({ outcome: 'failed', error: 'permission denied' })
    err.mockRestore()
  })

  it('reports when the update "succeeds" but the link still is not there', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb({ data: { id: 'it-1', client_id: null }, error: null })
    const r = await reassertClientId(db, { id: 'it-1', client_id: null }, 'c-1')
    expect(r.outcome).toBe('failed')
    err.mockRestore()
  })
})
