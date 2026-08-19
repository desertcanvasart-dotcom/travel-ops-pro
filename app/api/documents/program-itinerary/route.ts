// GET /api/documents/program-itinerary?template_id=…&format=pdf|html[&print=1]
//   [&departure_date=YYYY-MM-DD&cairo_guide=…&south_guide=…&author=…]
//   [&created_date=YYYY-MM-DD]
// Departure params fill the date column, the guide cells and 作成者 — the
// office-held facts of one departure. Absent params render the blank template.
// created_date overrides 作成日, which otherwise defaults to today.
//
// Renders the customer-facing 日程表 for one programme, in the office's own
// document layout. `format=html` is the same document the PDF is made from —
// instant to reload while iterating, and with &print=1 it opens the browser's
// print dialog, which is the print button's whole implementation.

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import { getTemplate } from '@/lib/documents/registry'
import { renderHtmlToPdf } from '@/lib/documents/render'
import { assembleProgramItinerary } from '@/lib/documents/assemble-program-itinerary'
import { getJapaneseFontFace } from '@/lib/pdf-fonts-server'
import { inlineImage } from '@/lib/documents/inline-image'

const TEMPLATE_SLUG = 'ats-daily-itinerary'

/** 作成日 as the office writes it — "19 August 2026". An absent or unparseable
 *  date falls back to today, so the field stays optional like every other one
 *  in the dialog. */
function formatCreatedDate(raw: string | null): string {
  const explicit = raw ? new Date(`${raw.slice(0, 10)}T00:00:00Z`) : null
  const valid = explicit && !Number.isNaN(explicit.getTime())
  return (valid ? explicit : new Date()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(valid ? { timeZone: 'UTC' } : {}),
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Not authenticated' },
        { status: auth.status }
      )
    }
    const { supabase, org_id } = auth

    const params = request.nextUrl.searchParams
    const templateId = params.get('template_id')
    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'template_id is required' },
        { status: 400 }
      )
    }

    const template = getTemplate(TEMPLATE_SLUG)
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    const { data: program, error: programError } = await supabase
      .from('tour_templates')
      .select('id, template_code, itinerary, hotels')
      .eq('id', templateId)
      .single()

    if (programError || !program) {
      return NextResponse.json({ success: false, error: 'Programme not found' }, { status: 404 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, company_phone, contact_email, company_website, company_address, document_contacts, offices')
      .eq('id', org_id)
      .maybeSingle()

    // 作成日 — the day the office wrote this document, which is today only the
    // first time it is generated. Re-issuing a departure's paperwork months
    // later must not restamp it with the day it was reprinted, so the operator
    // can supply the original. An explicit date is read as UTC and formatted
    // as UTC: parsed as local, "2026-08-19" would render as the 18th for any
    // office west of Greenwich.
    const createdDate = formatCreatedDate(params.get('created_date'))

    // The renderer must never make a network request — see lib/documents/
    // inline-image.ts. The logo travels inside the document.
    const orgForDoc = org
      ? { ...(org as any), logo_url: await inlineImage((org as any).logo_url) }
      : null

    const departure = {
      start_date: params.get('departure_date'),
      cairo_guide: params.get('cairo_guide'),
      south_guide: params.get('south_guide'),
      author: params.get('author'),
    }

    const context = assembleProgramItinerary({
      template_code: program.template_code,
      itinerary: program.itinerary,
      hotels: (program as any).hotels ?? null,
      created_date: createdDate,
      font_face_css: await getJapaneseFontFace(),
      org: orgForDoc,
      departure,
    })

    let html = template.render(context)

    const format = params.get('format') ?? 'pdf'
    if (format === 'html') {
      if (params.get('print') === '1') {
        html = html.replace('</body>', '<script>window.print()</script></body>')
      }
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const pdf = await renderHtmlToPdf(html, template.page)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${program.template_code}-nittei.pdf"`,
      },
    })
  } catch (error) {
    console.error('program-itinerary render error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to render the itinerary document') },
      { status: 500 }
    )
  }
}
