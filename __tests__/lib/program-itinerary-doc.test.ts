// ============================================
// The 日程表 both routes render
// ============================================
// The office's button and the customer's portal go through one builder, so the
// facts of a departure reaching the paper is worth pinning: a traveller opening
// their own link must not get the blank master, and 作成日 must be the day the
// document was written rather than the day it was reprinted.

import { describe, it, expect } from 'vitest'
import { buildProgramItineraryHtml, formatCreatedDate, ProgramItineraryError } from '@/lib/documents/program-itinerary-doc'

const PROGRAM = {
  id: 'p1',
  template_code: 'NEK901-CR',
  itinerary: [
    { day: 1, title: 'カイロ到着', description: '空港でお出迎え' },
    { day: 2, title: 'ギザ観光', description: 'ピラミッド' },
  ],
  hotels: null,
}

/** Enough of a client for the two reads the builder makes. */
function fakeSupabase(program: unknown, org: unknown) {
  return {
    from(table: string) {
      const row = table === 'tour_templates' ? program : org
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: row, error: null }),
        maybeSingle: async () => ({ data: row, error: null }),
      }
      return chain
    },
  } as never
}

const ATS_ORG = { name: 'Operator', logo_url: null, document_templates: ['ats-daily-itinerary'] }

const build = (departure: Parameters<typeof buildProgramItineraryHtml>[0]['departure'], org: unknown = ATS_ORG) =>
  buildProgramItineraryHtml({
    supabase: fakeSupabase(PROGRAM, org),
    orgId: 'org1',
    templateId: 'p1',
    createdDate: '2026-08-20',
    departure,
  })

const NO_DEPARTURE = { start_date: null, cairo_guide: null, south_guide: null, author: null, customer_name: null }

describe('buildProgramItineraryHtml', () => {
  // One operator's paper (lib/documents/org-templates.ts): the office button and
  // the portal both come through here, so both refuse an org without it.
  it('refuses an organization that does not have the 日程表', async () => {
    const err = await build(NO_DEPARTURE, { name: 'Other', logo_url: null, document_templates: [] }).catch(e => e)
    expect(err).toBeInstanceOf(ProgramItineraryError)
    expect(err.status).toBe(403)
  })

  it('fills the date column from the departure, one day per row', async () => {
    const { html, templateCode } = await build({
      start_date: '2026-11-03',
      cairo_guide: null,
      south_guide: null,
      author: null,
      customer_name: '山田 太郎',
    })
    expect(templateCode).toBe('NEK901-CR')
    expect(html).toContain('>11/3<')
    expect(html).toContain('>11/4<')
    expect(html).toContain('山田 太郎')
  })

  it('renders the blank master when there is no departure', async () => {
    const { html } = await build({
      start_date: null,
      cairo_guide: null,
      south_guide: null,
      author: null,
      customer_name: null,
    })
    expect(html).not.toContain('>11/3<')
  })

  it('stamps 作成日 with the supplied date, not today', async () => {
    const { html } = await build({
      start_date: '2026-11-03',
      cairo_guide: null,
      south_guide: null,
      author: null,
      customer_name: null,
    })
    expect(html).toContain('20 August 2026')
  })
})

describe('formatCreatedDate', () => {
  it('reads and formats an explicit date as UTC', () => {
    // Parsed as local, this renders as the 18th for any office west of Greenwich.
    expect(formatCreatedDate('2026-08-19')).toBe('19 August 2026')
  })

  it('falls back to today when absent or unparseable', () => {
    expect(formatCreatedDate(null)).toMatch(/\d{1,2} \w+ \d{4}/)
    expect(formatCreatedDate('not-a-date')).toMatch(/\d{1,2} \w+ \d{4}/)
  })
})
