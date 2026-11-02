// GET /api/documents/booking-confirmation?itinerary_id=…&format=pdf|html[&print=1]
//   [&invoice_id=…&staff=…&created_date=YYYY-MM-DD&representative=…]
//   [&rooms=…&room_type=…]
// The ATS 予約確認書兼請求書 for one trip (lib/documents/booking-confirmation-doc).
// The trip, its programme, its booking's travellers, its flights and one of
// its invoices fill it; the params are what the office typed in the dialog
// and win over the record. format=html is the same document the PDF is made
// from; &print=1 opens the browser's print dialog.

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import { renderHtmlToPdf } from '@/lib/documents/render'
import { buildBookingConfirmationHtml, BookingConfirmationError } from '@/lib/documents/booking-confirmation-doc'

export async function GET(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Not authenticated' },
        { status: auth.status }
      )
    }
    const params = request.nextUrl.searchParams
    const itineraryId = params.get('itinerary_id')
    if (!itineraryId) {
      return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    }

    let built
    try {
      built = await buildBookingConfirmationHtml({
        supabase: auth.supabase,
        orgId: auth.org_id,
        itineraryId,
        overrides: {
          invoice_id: params.get('invoice_id'),
          staff: params.get('staff'),
          created_date: params.get('created_date'),
          representative: params.get('representative'),
          rooms: params.get('rooms'),
          room_type: params.get('room_type'),
        },
      })
    } catch (err) {
      if (err instanceof BookingConfirmationError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status })
      }
      throw err
    }

    let html = built.html
    if ((params.get('format') ?? 'pdf') === 'html') {
      if (params.get('print') === '1') html = html.replace('</body>', '<script>window.print()</script></body>')
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    const pdf = await renderHtmlToPdf(html, built.page)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${built.fileCode}-confirmation.pdf"`,
      },
    })
  } catch (error) {
    console.error('booking-confirmation render error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to render the booking confirmation') },
      { status: 500 }
    )
  }
}
