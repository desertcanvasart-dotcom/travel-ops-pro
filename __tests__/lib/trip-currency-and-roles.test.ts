// Currency defaults and role-gated buttons on the Sell screens.
//
//   - getUserPreferences called auth.getUser() on the service-role client,
//     which has no session: every AI generation that named no currency came
//     out in EUR at the constant margin. It now reads the request's user and
//     the company's default currency.
//   - The WhatsApp parser forced EUR for an EU passport — the opposite of the
//     server's own rule (the passport picks the EU price tier, not the
//     currency): an ATS yen quote for a French traveller came out in EUR.
//   - Buttons an agent could press only to be refused: Generate commissions,
//     Reprice FX (admin/manager routes), Send confirmation (owner/admin/
//     manager).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'u-1' as string | null }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => ctx.orgId,
  getCurrentUserId: async () => ctx.userId,
}))

import { getUserPreferences } from '@/lib/ai/user-preferences'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

// The service-role client: no session, so auth.getUser() says "nobody".
const serviceClient = () => ({ ...createMockClient(), auth: { getUser: async () => ({ data: { user: null }, error: null }) } })

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'u-1'
  setMockTables({
    organizations: [
      { id: 'org-a', default_currency: 'JPY', rate_currency: 'USD', default_margin_percent: 18 },
      { id: 'org-b', default_currency: null, rate_currency: 'EUR' },
    ],
    user_preferences: [],
  })
})

describe('generation defaults follow the person and the company', () => {
  it("with the service-role client and no preference row: the company's currency and margin", async () => {
    expect(await getUserPreferences(serviceClient())).toMatchObject({ default_currency: 'JPY', default_margin_percent: 18 })
  })

  it("the person's own preference in this company wins", async () => {
    setMockTables({
      organizations: [{ id: 'org-a', default_currency: 'JPY', rate_currency: 'USD' }],
      user_preferences: [{ user_id: 'u-1', org_id: 'org-a', default_currency: 'GBP', default_margin_percent: 30 }],
    })
    expect(await getUserPreferences(serviceClient())).toMatchObject({ default_currency: 'GBP', default_margin_percent: 30 })
  })

  it('a company with no billing currency bills in its rate currency', async () => {
    expect(await getOrgDefaultCurrency(createMockClient(), 'org-b')).toBe('EUR')
    expect(await getOrgDefaultCurrency(createMockClient(), 'org-a')).toBe('JPY')
  })
})

describe('the passport never picks the currency', () => {
  it('the WhatsApp parser sends the company currency, whatever the passport', () => {
    const parser = src('app/whatsapp-parser/whatsapp-parser-content.tsx')
    expect(parser).not.toMatch(/is_euro_passport === true \? 'EUR'/)
    expect(parser).toContain('const effectiveCurrency = preferencesFromServer ? userPreferences.default_currency : undefined')
  })
  it('the New Itinerary form starts with no currency rather than USD', () => {
    expect(src('app/itineraries/new/new-itinerary-content.tsx')).not.toMatch(/currency: 'USD'/)
  })
})

describe('buttons an agent cannot use are not shown to agents', () => {
  it('Generate commissions (itinerary page)', () => {
    const page = src('app/itineraries/[id]/page.tsx')
    expect(page).toContain("const canGenerateCommissions = canAccess(['admin', 'manager'])")
    expect(page).toMatch(/\.\.\.\(canGenerateCommissions\s*\?\s*\[\{ label: generatingCommissions/)
  })
  it('Reprice FX (editor)', () => {
    const page = src('app/itineraries/[id]/edit/page.tsx')
    expect(page).toContain("const canRepriceFx = canAccess(['admin', 'manager'])")
    expect(page).toContain('itinerary.fx_frozen && canRepriceFx && (')
  })
  it('Send confirmation (booking page)', () => {
    const page = src('app/bookings/[id]/page.tsx')
    expect(page).toContain('{canSendConfirmation && <SendConfirmationButton')
  })
})

describe('the itineraries list', () => {
  const page = src('app/itineraries/page.tsx')
  it('cancels through the Cancel trip dialog, not a bare status change', () => {
    expect(page).toContain("if (newStatus === 'cancelled' && row) {")
    expect(page).toContain('<CancelTripDialog')
  })
  it('deletes only after a confirmation dialog (no second click on the bin)', () => {
    expect(page).toContain('await dialog.confirm({')
    expect(page).not.toContain('setDeleteConfirm')
  })
  it('its cards are the server’s counts, and it searches on the server', () => {
    expect(page).toContain("params.set('counts', 'true')")
    expect(page).toContain("params.set('search', search)")
    expect(page).not.toMatch(/total: itineraries\.length/)
  })
})
