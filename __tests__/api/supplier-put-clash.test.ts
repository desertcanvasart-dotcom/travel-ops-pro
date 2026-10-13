// Editing a supplier's code to one another supplier of the company holds was
// a bare "Failed to update supplier" 500; create already named the clash.
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/supabase-js', () => {
  // update().eq().eq().select().maybeSingle() → the database's 23505
  const chain: any = {
    update: () => chain, eq: () => chain, select: () => chain,
    maybeSingle: async () => ({ data: null, error: { code: '23505', details: 'Key (org_id, supplier_code)=(org-a, SUP-0007) already exists.' } }),
  }
  return { createClient: () => ({ from: () => chain }) }
})
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return { getCurrentOrgId: async () => 'org-a', noOrgResponse: () => NextResponse.json({}, { status: 403 }) }
})
vi.mock('@/lib/vocabulary-server', () => ({ supplierTypesForCurrentOrg: async () => [] }))

import { PUT } from '@/app/api/suppliers/[id]/route'

describe('PUT /api/suppliers/[id] on a code clash', () => {
  it('is a 409 that names the code', async () => {
    const res = await PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ supplier_code: 'SUP-0007' }) }), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('SUP-0007')
  })
})
