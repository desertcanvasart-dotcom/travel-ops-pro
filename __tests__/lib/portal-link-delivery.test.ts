// Sweep H7: markSentAndDeliver stamped last_sent_at BEFORE sending and treated
// sendEmailInternal as throwing — it returns { success: false } instead — so a
// failed email showed "Sent" in the coordinator and nobody re-sent it.
import { vi, describe, it, expect, beforeEach } from 'vitest'

const sendEmailInternal = vi.fn()
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: (...a: unknown[]) => sendEmailInternal(...a) }))

import { markSentAndDeliver } from '@/lib/portal-links'

let pax: Record<string, unknown> | null
const stamps: unknown[] = []
function admin() {
  return {
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: () => b,
        update: (v: unknown) => { stamps.push({ table, v }); return b },
        maybeSingle: async () => ({ data: pax, error: null }),
        then: (r: (v: unknown) => void) => r({ error: null }),
      }
      return b
    },
  }
}
const opts = { token: 't', passengerId: 'p', orgId: 'o', url: 'https://x/portal/t' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = () => markSentAndDeliver(admin() as any, opts)

beforeEach(() => { stamps.length = 0; sendEmailInternal.mockReset(); pax = { email: 'g@example.com', first_name: '太郎' } })

describe('markSentAndDeliver', () => {
  it('a failed send (returned, not thrown) is NOT stamped as sent', async () => {
    sendEmailInternal.mockResolvedValue({ success: false, error: 'Gmail not connected' })
    expect(await run()).toEqual({ sent: false, error: 'Gmail not connected' })
    expect(stamps).toEqual([])
  })
  it('a thrown send is not stamped either', async () => {
    sendEmailInternal.mockRejectedValue(new Error('boom'))
    expect((await run()).sent).toBe(false)
    expect(stamps).toEqual([])
  })
  it('no email address: nothing sent, nothing stamped', async () => {
    pax = { email: null }
    expect((await run()).sent).toBe(false)
    expect(sendEmailInternal).not.toHaveBeenCalled()
    expect(stamps).toEqual([])
  })
  it('a successful send is stamped', async () => {
    sendEmailInternal.mockResolvedValue({ success: true })
    expect(await run()).toEqual({ sent: true })
    expect(stamps).toHaveLength(1)
  })
})
