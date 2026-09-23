// Sweep H8: the generate-documents counter was module-level, so overlapping
// requests skipped or repeated numbers. Each batch now owns its numberer.
import { describe, it, expect } from 'vitest'
import { createDocumentNumberer } from '@/lib/documents/numberer'

function db(highest: Record<string, string | null>) {
  let reads = 0
  const client = {
    from: () => {
      let pattern = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        like: (_c: string, p: string) => { pattern = p; return b },
        order: () => b,
        limit: async () => {
          reads++
          const prefix = pattern.split('-')[0]
          const n = highest[prefix]
          return { data: n ? [{ document_number: n }] : [] }
        },
      }
      return b
    },
  }
  return { client, reads: () => reads }
}
const prefix = (t: string) => ({ transport_voucher: 'TV', guide_assignment: 'GA' } as Record<string, string>)[t] ?? 'SD'

describe('createDocumentNumberer', () => {
  it('counts on from the highest number, per type, reading each type once', async () => {
    const d = db({ TV: 'TV-2026-0007', GA: null })
    const next = createDocumentNumberer(d.client, prefix, 2026)
    expect(await next('transport_voucher')).toBe('TV-2026-0008')
    expect(await next('guide_assignment')).toBe('GA-2026-0001')
    expect(await next('transport_voucher')).toBe('TV-2026-0009')
    expect(d.reads()).toBe(2)
  })
  it('two overlapping batches do not disturb each other', async () => {
    const d = db({ TV: 'TV-2026-0007' })
    const a = createDocumentNumberer(d.client, prefix, 2026)
    const b = createDocumentNumberer(d.client, prefix, 2026)
    expect(await a('transport_voucher')).toBe('TV-2026-0008')
    expect(await b('transport_voucher')).toBe('TV-2026-0008') // same start: the insert retry resolves the clash
    expect(await a('transport_voucher')).toBe('TV-2026-0009') // not bumped by b
  })
})
