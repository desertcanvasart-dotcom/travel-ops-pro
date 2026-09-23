// The survey invite cron must record a send only when one actually happened.
// sendWhatsAppMessage and sendEmailInternal report failure by RETURNING
// { success: false } — they never throw — so the old try/catch counted every
// failed WhatsApp send as sent and the invite was silently lost.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const updates: { table: string; vals: Record<string, unknown> }[] = []
let itineraries: Record<string, unknown>[] = []

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    gte: () => b,
    lte: () => b,
    eq: () => b,
    update: (vals: Record<string, unknown>) => {
      updates.push({ table, vals })
      return { eq: async () => ({ error: null }) }
    },
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: table === 'itineraries' ? itineraries : [], error: null }),
  }
  return b
}

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({ from: builder }) }))
vi.mock('@/lib/support/job-runs', () => ({
  withJobRun: (_name: string, _db: unknown, handler: unknown) => handler,
  jobRunHeaders: () => ({}),
}))
vi.mock('@/lib/org-identity', () => ({ businessIdentity: () => ({ name: 'ATS' }) }))
vi.mock('@/lib/today', () => ({ todayLocal: () => '2026-09-23' }))
vi.mock('@/lib/surveys/ensure-survey', () => ({
  ensureSurvey: vi.fn(async () => ({ id: 's1', token: 'tok', status: 'pending' })),
}))
const sendEmailInternal = vi.fn()
const sendWhatsAppMessage = vi.fn()
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: (...a: unknown[]) => sendEmailInternal(...a) }))
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: (...a: unknown[]) => sendWhatsAppMessage(...a) }))

import { GET } from '@/app/api/cron/survey-invites/route'
import { internalCronToken } from '@/lib/cron/auth'

const trip = (extra: Record<string, unknown>) => ({
  id: 'it1', org_id: 'o1', itinerary_code: 'ITN-1', client_name: '山田', trip_name: 'T',
  start_date: '2026-09-16', end_date: '2026-09-23', status: 'confirmed', ...extra,
})
// Cron routes fail closed now (lib/cron/auth): call it as the scheduler does.
const run = async () => (await (GET as (r: NextRequest) => Promise<Response>)(
  new NextRequest('http://x/api/cron/survey-invites', { headers: { authorization: `Bearer ${internalCronToken()}` } })
)).json()
const surveyUpdates = () => updates.filter(u => u.table === 'guest_surveys')

beforeEach(() => {
  updates.length = 0
  sendEmailInternal.mockReset()
  sendWhatsAppMessage.mockReset()
})

describe('survey-invites cron records a send only when it happened', () => {
  it('a failed WhatsApp send (returned, not thrown) leaves the survey pending for retry', async () => {
    itineraries = [trip({ client_email: null, client_phone: '+819012345678' })]
    sendWhatsAppMessage.mockResolvedValue({ success: false, error: '63016' })
    const body = await run()
    expect(surveyUpdates()).toEqual([])
    expect(body).toMatchObject({ sent: 0, whatsapp: 0, failed: 1 })
  })

  it('a trip with no contact at all is not marked sent', async () => {
    itineraries = [trip({ client_email: null, client_phone: null })]
    const body = await run()
    expect(surveyUpdates()).toEqual([])
    expect(body).toMatchObject({ sent: 0, failed: 1 })
  })

  it('a successful WhatsApp send marks it sent on that channel only', async () => {
    itineraries = [trip({ client_email: null, client_phone: '+819012345678' })]
    sendWhatsAppMessage.mockResolvedValue({ success: true })
    const body = await run()
    expect(surveyUpdates()).toHaveLength(1)
    expect(surveyUpdates()[0].vals).toMatchObject({ status: 'sent', sent_whatsapp: true, sent_email: false })
    expect(body).toMatchObject({ sent: 1, whatsapp: 1, failed: 0 })
  })

  it('email succeeds while WhatsApp fails: sent, with the true per-channel result', async () => {
    itineraries = [trip({ client_email: 'g@example.com', client_phone: '+819012345678' })]
    sendEmailInternal.mockResolvedValue({ success: true })
    sendWhatsAppMessage.mockResolvedValue({ success: false })
    await run()
    expect(surveyUpdates()[0].vals).toMatchObject({ status: 'sent', sent_email: true, sent_whatsapp: false })
  })
})
