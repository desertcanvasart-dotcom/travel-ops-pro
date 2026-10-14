// Settings audit (2026-10-14):
//   12 /settings/whatsapp sent { phoneNumber } (the route reads `phone`), so
//      every test was a 400; it rendered `message`, which neither answer has;
//      its status list read `config`, which the status route never returns;
//      and it told users to edit .env.local for a number the Autoura team sets.
//   18 the partner-integration delivery log had no role check, and the
//      in-route write rule (admin+manager) contradicted middleware (admin).
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { whatsappStatusRows, whatsappTestBody, whatsappTestOutcome } from '@/lib/settings/whatsapp-status'

const h = vi.hoisted(() => ({ role: 'admin', sent: [] as Array<{ to: string; orgId: string }> }))

vi.mock('@/lib/twilio-whatsapp', () => ({
  sendWhatsAppMessage: async (p: { to: string; orgId: string }) => {
    h.sent.push(p)
    return { success: true, messageId: 'SM1' }
  },
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-a',
  noOrgResponse: () => new Response(null, { status: 403 }),
  requireRole: async (allowed: string[]) =>
    h.role === 'owner' || allowed.includes(h.role) ? null : new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
}))
vi.mock('@/lib/auth/org-auth', () => ({
  orgAuth: async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b, eq: () => b, order: () => b, limit: async () => ({ data: [], error: null }),
      insert: () => b, update: () => b, delete: () => b,
      single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }),
    }
    return { error: null, status: 200, org_id: 'org-a', user: { id: 'me' }, supabase: { from: () => b } }
  },
}))

import * as waTest from '@/app/api/whatsapp/test/route'
import * as events from '@/app/api/integrations/[id]/events/route'
import * as integrations from '@/app/api/integrations/route'
import * as integration from '@/app/api/integrations/[id]/route'

beforeEach(() => {
  h.role = 'admin'
  h.sent.length = 0
})

describe('/settings/whatsapp speaks the routes\' language', () => {
  it('the page\'s body is what the test route reads — 200 with Twilio answering', async () => {
    const res = await waTest.POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(whatsappTestBody(' +201234567890 ')) }))
    expect(res.status).toBe(200)
    expect(h.sent).toEqual([expect.objectContaining({ to: '+201234567890', orgId: 'org-a' })])
  })

  it('an error is shown in words, a success says so', () => {
    expect(whatsappTestOutcome({ success: false, error: 'Phone number is required' })).toEqual({ success: false, message: 'Phone number is required' })
    expect(whatsappTestOutcome({ success: true, messageId: 'SM1' }).success).toBe(true)
    expect(whatsappTestOutcome(null)).toEqual({ success: false, message: 'The test message could not be sent.' })
  })

  it('the status list is built from the fields the status route returns', () => {
    const rows = whatsappStatusRows({
      configured: false, has_credentials: true, has_number: false, whatsapp_number: '',
      features: { auto_send: false, status_updates: true },
    })
    expect(rows.map(r => [r.label, r.ok, r.value])).toEqual([
      ['Twilio account (this installation)', true, 'Connected'],
      ["This company's WhatsApp number", false, 'Not assigned yet'],
      ['Booking status messages', true, 'On'],
    ])
    const route = readFileSync('app/api/whatsapp/status/route.ts', 'utf8')
    for (const field of ['has_credentials', 'has_number', 'whatsapp_number', 'status_updates']) expect(route).toContain(field)
  })

  it('the page uses them, and no longer sends people to .env.local', () => {
    const page = readFileSync('app/settings/whatsapp/page.tsx', 'utf8')
    expect(page).toContain('JSON.stringify(whatsappTestBody(testPhone))')
    expect(page).toContain('whatsappStatusRows(status)')
    expect(page).not.toMatch(/\.env\.local|phoneNumber|config\.config|config\?\.config/)
    expect(page).toContain('connected by the Autoura team')
  })
})

describe('partner integrations: one rule for who does what', () => {
  const params = { params: Promise.resolve({ id: 'i1' }) }

  it('the delivery log is for admins and managers', async () => {
    h.role = 'agent'
    expect((await events.GET(new NextRequest('http://x'), params)).status).toBe(403)
    h.role = 'viewer'
    expect((await events.GET(new NextRequest('http://x'), params)).status).toBe(403)
    h.role = 'manager'
    expect((await events.GET(new NextRequest('http://x'), params)).status).toBe(200)
  })

  it('writes are admin in-route, as middleware has them', async () => {
    h.role = 'manager'
    expect((await integrations.POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ provider: 'generic', name: 'x' }) }))).status).toBe(403)
    expect((await integration.PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ is_active: false }) }), params)).status).toBe(403)
    expect((await integration.DELETE(new NextRequest('http://x', { method: 'DELETE' }), params)).status).toBe(403)
  })
})
