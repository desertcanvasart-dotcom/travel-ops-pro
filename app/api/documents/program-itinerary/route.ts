// GET /api/documents/program-itinerary?format=pdf|html[&print=1]
//   &template_id=…   the programme itself, blank or filled from the params
//   &itinerary_id=…  one customer's copy — traveller and departure date read
//                    from their trip, via itineraries.template_id
//   [&departure_date=YYYY-MM-DD&cairo_guide=…&south_guide=…&author=…]
//   [&customer_name=…&created_date=YYYY-MM-DD]
// Departure params fill the date column, the guide cells and 作成者 — the
// office-held facts of one departure. Absent params render the blank template.
// created_date overrides 作成日, which otherwise defaults to today. Explicit
// params override whatever the trip says, so a correction needs no record edit.
//
// Renders the customer-facing 日程表 for one programme, in the office's own
// document layout. `format=html` is the same document the PDF is made from —
// instant to reload while iterating, and with &print=1 it opens the browser's
// print dialog, which is the print button's whole implementation.

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import { renderHtmlToPdf } from '@/lib/documents/render'
import {
  buildProgramItineraryHtml,
  ProgramItineraryError,
} from '@/lib/documents/program-itinerary-doc'

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

    // Two ways in. `template_id` renders the programme itself — the blank
    // master, or a departure whose facts are typed into the dialog.
    // `itinerary_id` renders one customer's copy: the same programme text,
    // with the traveller and the departure date read from their trip instead
    // of retyped. Explicit params still win over what the trip says, so a
    // one-off correction never needs the record edited first.
    const itineraryId = params.get('itinerary_id')
    let templateId = params.get('template_id')
    let trip: { client_name: string | null; start_date: string | null } | null = null

    if (itineraryId) {
      const { data: itinerary, error: itineraryError } = await supabase
        .from('itineraries')
        .select('template_id, client_name, start_date')
        .eq('id', itineraryId)
        .eq('org_id', org_id)
        .maybeSingle()

      if (itineraryError || !itinerary) {
        return NextResponse.json({ success: false, error: 'Trip not found' }, { status: 404 })
      }
      if (!itinerary.template_id) {
        return NextResponse.json(
          { success: false, error: 'This trip is not linked to a programme yet' },
          { status: 400 }
        )
      }
      templateId = itinerary.template_id as string
      trip = {
        client_name: itinerary.client_name as string | null,
        start_date: itinerary.start_date as string | null,
      }
    }

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'template_id or itinerary_id is required' },
        { status: 400 }
      )
    }

    // 作成日 — the day the office wrote this document, which is today only the
    // first time it is generated. Re-issuing a departure's paperwork months
    // later must not restamp it with the day it was reprinted, so the operator
    // can supply the original.
    let built
    try {
      built = await buildProgramItineraryHtml({
        supabase,
        orgId: org_id,
        templateId,
        createdDate: params.get('created_date'),
        departure: {
          start_date: params.get('departure_date') ?? trip?.start_date ?? null,
          cairo_guide: params.get('cairo_guide'),
          south_guide: params.get('south_guide'),
          author: params.get('author'),
          customer_name: params.get('customer_name') ?? trip?.client_name ?? null,
        },
      })
    } catch (err) {
      if (err instanceof ProgramItineraryError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status })
      }
      throw err
    }

    let html = built.html

    const format = params.get('format') ?? 'pdf'
    if (format === 'html') {
      if (params.get('print') === '1') {
        html = html.replace('</body>', '<script>window.print()</script></body>')
      }
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const pdf = await renderHtmlToPdf(html, built.page)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${built.templateCode}-nittei.pdf"`,
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
