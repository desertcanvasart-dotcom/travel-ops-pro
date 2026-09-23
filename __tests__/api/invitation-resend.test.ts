// Resend deleted the old invitation, then POSTed a new one unchecked — a
// failed POST left the person with no invitation. Now the server creates the
// replacement first and retires the old one only after it exists.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ops: string[] = []
let pending: { id: string } | null = null
let insertFails = false
function builder(table: string) {
  let op = 'select'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b, eq: () => b, is: () => b, gt: () => b,
    insert: () => { op = 'insert'; return b },
    delete: () => { op = 'delete'; ops.push(`${table}:delete`); return b },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => {
      if (op === 'insert') {
        ops.push(`${table}:insert`)
        return insertFails ? { data: null, error: new Error('insert failed') } : { data: { id: 'new' }, error: null }
      }
      return { data: table === 'user_invitations' ? pending : null, error: null }
    },
    then: (r: (v: unknown) => void) => r({ error: null }),
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: builder }) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-a', noOrgResponse: () => new Response(null, { status: 403 }) }))
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: async () => ({ success: true }) }))

import { POST } from '@/app/api/invitations/route'
const post = (body: unknown) => POST(new NextRequest('http://x/api/invitations', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { ops.length = 0; pending = { id: 'old' }; insertFails = false })

describe('invitation resend', () => {
  it('replaces the pending invitation: insert first, then retire the old one', async () => {
    const res = await post({ email: 'a@b.c', role: 'agent', resend_of: 'old' })
    expect(res.status).toBe(200)
    expect(ops).toEqual(['user_invitations:insert', 'user_invitations:delete'])
  })
  it('a failed insert leaves the old invitation alone', async () => {
    insertFails = true
    await post({ email: 'a@b.c', role: 'agent', resend_of: 'old' })
    expect(ops).not.toContain('user_invitations:delete')
  })
  it('without resend_of a pending duplicate is still refused', async () => {
    expect((await post({ email: 'a@b.c', role: 'agent' })).status).toBe(400)
    expect(ops).toEqual([])
  })
})
