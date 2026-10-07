// data-invariants answers 200 WITH violations, so its runs were recorded as
// "ok" with detail null. A route can now report its outcome and a summary.
import { describe, it, expect } from 'vitest'
import { withJobRun, jobRunHeaders } from '@/lib/support/job-runs'

function db() {
  const updates: Record<string, unknown>[] = []
  const client = {
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        insert: () => b, select: () => b,
        single: async () => ({ data: { id: 'run1' } }),
        update: (v: Record<string, unknown>) => { updates.push(v); return b },
        delete: () => b, eq: () => b, lt: () => b,
        then: (r: (v: unknown) => void) => r({ error: null }),
      }
      return b
    },
  }
  return { client, updates }
}

describe('withJobRun records what the route reports', () => {
  it('a 200 that reports failure is recorded as failed, with its summary', async () => {
    const d = db()
    const run = withJobRun('data-invariants', () => d.client, async () =>
      new Response('{}', { status: 200, headers: jobRunHeaders('failed', '3 violation(s): rate_duplicate_natural_key') }))
    await run()
    expect(d.updates[0]).toMatchObject({ outcome: 'failed', detail: '3 violation(s): rate_duplicate_natural_key' })
  })
  it('an ok run keeps its summary', async () => {
    const d = db()
    await withJobRun('send-reminders', () => d.client, async () =>
      new Response('{}', { headers: jobRunHeaders('ok', '2 sent, 0 failed') }))()
    expect(d.updates[0]).toMatchObject({ outcome: 'ok', detail: '2 sent, 0 failed' })
  })
  it('a route that says nothing is still ok with no detail', async () => {
    const d = db()
    await withJobRun('gmail-sync', () => d.client, async () => new Response('{}'))()
    expect(d.updates[0]).toMatchObject({ outcome: 'ok', detail: null })
  })
  it('a 500 records the error its body gives, not just the status', async () => {
    const d = db()
    const res = await withJobRun('send-reminders', () => d.client, async () =>
      Response.json({ success: false, error: 'column tenants_1.foo does not exist' }, { status: 500 }))()
    expect(d.updates[0]).toMatchObject({ outcome: 'failed', detail: 'HTTP 500: column tenants_1.foo does not exist' })
    // The caller still gets the body.
    expect((await res.json()).error).toBe('column tenants_1.foo does not exist')
  })
  it('the header, when set, wins over the body', async () => {
    const d = db()
    await withJobRun('send-reminders', () => d.client, async () =>
      Response.json({ error: 'raw' }, { status: 500, headers: jobRunHeaders('failed', '0 of 3 sent') }))()
    expect(d.updates[0]).toMatchObject({ detail: 'HTTP 500: 0 of 3 sent' })
  })
  it('a 500 with no usable body still records its status', async () => {
    const d = db()
    await withJobRun('send-reminders', () => d.client, async () => new Response('boom', { status: 500 }))()
    expect(d.updates[0]).toMatchObject({ outcome: 'failed', detail: 'HTTP 500' })
  })
  it('non-ASCII in a summary cannot break the header', () => {
    expect(jobRunHeaders('ok', '山田 2 sent')['x-job-detail']).toBe('?? 2 sent')
  })
})
