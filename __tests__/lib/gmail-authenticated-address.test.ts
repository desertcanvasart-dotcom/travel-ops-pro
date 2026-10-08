// getAuthenticatedGmail read gmail_tokens.email_address, a column the table has
// never had (it is `email`), so emailAddress was always '': copilot replies
// went out with an empty From header and sent mail recorded no from_address.
import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({
  row: {
    user_id: 'u1',
    email: 'Ops@Nile.example',
    access_token: 'access',
    refresh_token: 'refresh',
    token_expiry: new Date(Date.now() + 3_600_000).toISOString(),
  } as Record<string, unknown>,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.single = async () => ({ data: h.row, error: null })
      return b
    },
  }),
}))
vi.mock('@/lib/crypto/token-cipher', () => ({
  decryptToken: (v: string) => v,
  encryptToken: (v: string) => v,
}))

import { getAuthenticatedGmail } from '@/lib/gmail'

describe('getAuthenticatedGmail', () => {
  it('returns the connected mailbox’s address from gmail_tokens.email', async () => {
    const auth = await getAuthenticatedGmail('u1')
    expect(auth.emailAddress).toBe('Ops@Nile.example')
    expect(auth.accessToken).toBe('access')
  })
})
