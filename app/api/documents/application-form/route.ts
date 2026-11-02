// GET /api/documents/application-form?booking_id=…&format=pdf|html[&print=1]
//   [&passenger_id=…&staff=…]
// The ATS 参加申込書, one page per traveller on the booking (or the one named),
// from what they entered in the portal, with their passport photo page
// (lib/documents/application-form-doc). Manager and above: it prints the
// passport image, the same bar as opening the scan
// (/api/bookings/[id]/passenger-documents/[docId]).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { orgAuth } from '@/lib/auth/org-auth'
import { requireRole } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { renderHtmlToPdf } from '@/lib/documents/render'
import { buildApplicationFormHtml } from '@/lib/documents/application-form-doc'
import { BookingConfirmationError } from '@/lib/documents/booking-confirmation-doc'

export async function GET(request: NextRequest) {
  try {
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied

    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Not authenticated' },
        { status: auth.status }
      )
    }
    const params = request.nextUrl.searchParams
    const bookingId = params.get('booking_id')
    if (!bookingId) {
      return NextResponse.json({ success: false, error: 'booking_id is required' }, { status: 400 })
    }

    const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })

    let built
    try {
      built = await buildApplicationFormHtml({
        supabase: auth.supabase,
        storage,
        orgId: auth.org_id,
        bookingId,
        passengerId: params.get('passenger_id'),
        staff: params.get('staff'),
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
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }

    const pdf = await renderHtmlToPdf(html, built.page)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${built.fileCode}-application.pdf"`,
        // It carries passport images: never kept by a browser or proxy cache.
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('application-form render error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to render the application form') },
      { status: 500 }
    )
  }
}
