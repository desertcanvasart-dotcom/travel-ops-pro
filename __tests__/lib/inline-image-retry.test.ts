// One failed logo fetch was cached as null forever: every 日程表 and portal
// invoice went out without the org's logo until the server restarted.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { inlineImage } from '@/lib/documents/inline-image'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('inlineImage', () => {
  it('tries again a few minutes after a failure', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-09T10:00:00Z') })
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    const url = 'https://cdn.example/logo-retry.png'
    expect(await inlineImage(url)).toBeNull()
    expect(await inlineImage(url)).toBeNull() // still within the back-off
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-10-09T10:06:00Z'))
    expect(await inlineImage(url)).toMatch(/^data:image\/png;base64,/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
