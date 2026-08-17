// GET /api/documents/operations-sheet?itinerary_id=…&format=pdf|html
//
// Renders the ground-operations sheet for one trip. `format=html` returns the
// same document the PDF is made from, which is what you want while iterating on
// a layout — it reloads instantly and does not need Chromium.
//
// Office-held facts that are not on the itinerary (file number, guide mobiles,
// flight numbers) can be passed as query parameters; anything absent renders as
// a blank on the sheet rather than being guessed. See the note in
// lib/documents/assemble-operations-sheet.ts.

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import { getTemplate } from '@/lib/documents/registry'
import { renderHtmlToPdf } from '@/lib/documents/render'
import { assembleOperationsSheet } from '@/lib/documents/assemble-operations-sheet'
import type { OperationsSheetContext, StaffContact } from '@/lib/documents/types'

const TEMPLATE_SLUG = 'ats-operations-sheet'

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
    const itineraryId = params.get('itinerary_id')
    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'itinerary_id is required' },
        { status: 400 }
      )
    }

    const template = getTemplate(TEMPLATE_SLUG)
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, start_date, end_date, num_adults, num_children')
      .eq('id', itineraryId)
      .eq('org_id', org_id)
      .maybeSingle()

    if (itineraryError) {
      return NextResponse.json(
        { success: false, error: clientMessage(itineraryError, 'Failed to load the trip') },
        { status: 500 }
      )
    }
    if (!itinerary) {
      return NextResponse.json({ success: false, error: 'Trip not found' }, { status: 404 })
    }

    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      // ONE static literal. supabase-js parses the select string at the type
      // level, and a concatenated or interpolated one degrades to
      // GenericStringError[] — see the lesson in PR #38.
      .select('day_number, date, city, title, description, overnight_city, attractions, lunch_included, dinner_included, hotel_included, flight_from, hotel_check_in, hotel_check_out')
      .eq('itinerary_id', itineraryId)
      .order('day_number', { ascending: true })

    if (daysError) {
      return NextResponse.json(
        { success: false, error: clientMessage(daysError, 'Failed to load the trip days') },
        { status: 500 }
      )
    }

    const guides: StaffContact[] = [
      { role: 'CAI. GUIDE', name: params.get('cairo_guide'), mobile: params.get('cairo_mobile') },
      { role: 'UPP. GUIDE', name: params.get('upper_guide'), mobile: params.get('upper_mobile') },
    ]

    const context: OperationsSheetContext = assembleOperationsSheet({
      itinerary,
      days: days ?? [],
      overrides: {
        file_no: params.get('file_no'),
        group_ref: params.get('group_ref'),
        operator: params.get('operator'),
        confirmed_date: params.get('confirmed_date'),
        final_date: params.get('final_date') ?? new Date().toISOString().slice(0, 10),
        room_count: params.get('rooms') ? Number(params.get('rooms')) : null,
        remarks: params.get('remarks'),
        arrival_flight: params.get('arrival_flight'),
        departure_flight: params.get('departure_flight'),
        guides,
      },
    })

    const html = template.render(context)

    if (params.get('format') === 'html') {
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const pdf = await renderHtmlToPdf(html, template.page)
    const filename = `${context.tour_code || 'operations-sheet'}-ops.pdf`

    return new NextResponse(pdf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdf.length),
      },
    })
  } catch (error: any) {
    console.error('Error rendering operations sheet:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to render the document') },
      { status: 500 }
    )
  }
}
