// ============================================
// The 日程表 both routes render
// ============================================
// The office's button and the customer's portal go through one builder, so the
// facts of a departure reaching the paper is worth pinning: a traveller opening
// their own link must not get the blank master, and 作成日 must be the day the
// document was written rather than the day it was reprinted.

import { describe, it, expect } from 'vitest'
import { buildProgramItineraryHtml, formatCreatedDate } from '@/lib/documents/program-itinerary-doc'

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

const build = (departure: Parameters<typeof buildProgramItineraryHtml>[0]['departure']) =>
  buildProgramItineraryHtml({
    supabase: fakeSupabase(PROGRAM, { name: 'Operator', logo_url: null }),
    orgId: 'org1',
    templateId: 'p1',
    createdDate: '2026-08-20',
    departure,
  })

describe('buildProgramItineraryHtml', () => {
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
