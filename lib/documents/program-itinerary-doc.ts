// ============================================
// The 日程表, assembled once for whoever asks
// ============================================
// Two routes render this document and they must produce the SAME paper: the
// authed one behind the office's own buttons, and the customer's portal, which
// has a token instead of a session. The office half and the customer half
// drifting apart is exactly the failure this file exists to prevent — the
// traveller's copy is not a lesser rendering of the programme, it is the same
// one.
//
// I/O here, layout in the template: the template stays pure (context in, HTML
// out) as lib/documents/types.ts requires. What this adds is the reading —
// programme, organisation, logo — that both callers would otherwise repeat.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTemplate } from './registry'
import { assembleProgramItinerary } from './assemble-program-itinerary'
import { inlineImage } from './inline-image'
import { getJapaneseFontFace } from '@/lib/pdf-fonts-server'
import type { DocumentPage } from './types'

const TEMPLATE_SLUG = 'ats-daily-itinerary'

/** Thrown for the cases a caller has to turn into a status code. Anything else
 *  is a real fault and belongs in the route's catch. */
export class ProgramItineraryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ProgramItineraryError'
  }
}

export interface ProgramItineraryDeparture {
  start_date: string | null
  cairo_guide: string | null
  south_guide: string | null
  author: string | null
  customer_name: string | null
}

/** 作成日 as the office writes it — "19 August 2026". An absent or unparseable
 *  date falls back to today, so the field stays optional like every other one
 *  in the dialog. An explicit date is read AND formatted as UTC: parsed as
 *  local, "2026-08-19" would render as the 18th for any office west of
 *  Greenwich. */
export function formatCreatedDate(raw: string | null): string {
  const explicit = raw ? new Date(`${raw.slice(0, 10)}T00:00:00Z`) : null
  const valid = explicit && !Number.isNaN(explicit.getTime())
  return (valid ? explicit : new Date()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(valid ? { timeZone: 'UTC' } : {}),
  })
}

/**
 * The 日程表 for one programme as standalone HTML, plus the page setup the PDF
 * renderer needs.
 *
 * `supabase` is whichever client the caller is entitled to use — the office's
 * session-scoped one, or the portal's service role. `orgId` is applied to the
 * organisation read either way, so a client with wider reach cannot widen what
 * this returns.
 */
export async function buildProgramItineraryHtml(input: {
  supabase: SupabaseClient
  orgId: string
  templateId: string
  departure: ProgramItineraryDeparture
  /** Raw YYYY-MM-DD; formatting and the today-fallback happen here. */
  createdDate?: string | null
}): Promise<{ html: string; page: DocumentPage; templateCode: string }> {
  const { supabase, orgId, templateId, departure } = input

  const template = getTemplate(TEMPLATE_SLUG)
  if (!template) throw new ProgramItineraryError('Template not found', 404)

  const { data: program, error: programError } = await supabase
    .from('tour_templates')
    .select('id, template_code, itinerary, hotels')
    .eq('id', templateId)
    .single()

  if (programError || !program) throw new ProgramItineraryError('Programme not found', 404)

  const { data: org } = await supabase
    .from('organizations')
    .select(
      'name, logo_url, company_phone, contact_email, company_website, company_address, document_contacts, offices'
    )
    .eq('id', orgId)
    .maybeSingle()

  // The renderer must never make a network request — see inline-image.ts. The
  // logo travels inside the document.
  const orgForDoc = org
    ? { ...(org as any), logo_url: await inlineImage((org as any).logo_url) }
    : null

  const context = assembleProgramItinerary({
    template_code: program.template_code,
    itinerary: program.itinerary,
    hotels: (program as any).hotels ?? null,
    created_date: formatCreatedDate(input.createdDate ?? null),
    font_face_css: await getJapaneseFontFace(),
    org: orgForDoc,
    departure,
  })

  return {
    html: template.render(context),
    page: template.page,
    templateCode: program.template_code as string,
  }
}
