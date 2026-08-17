// GET /api/documents/program-itinerary?template_id=…&format=pdf|html[&print=1]
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
      .select('name, logo_url, company_phone, contact_email, company_website, company_address, document_contacts')
      .eq('id', org_id)
      .maybeSingle()

    const createdDate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    // The renderer must never make a network request — see lib/documents/
    // inline-image.ts. The logo travels inside the document.
    const orgForDoc = org
      ? { ...(org as any), logo_url: await inlineImage((org as any).logo_url) }
      : null

    const context = assembleProgramItinerary({
      template_code: program.template_code,
      itinerary: program.itinerary,
      hotels: (program as any).hotels ?? null,
      created_date: createdDate,
      font_face_css: await getJapaneseFontFace(),
      org: orgForDoc,
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
