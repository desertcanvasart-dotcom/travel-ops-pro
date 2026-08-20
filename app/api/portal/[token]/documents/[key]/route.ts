// ============================================
// GET /api/portal/[token]/documents/[key]
// ============================================
// Serves one document to the traveller. Same gate as the rest of the portal:
// the token is shape-checked, resolved through the service role, and checked
// for revocation and expiry before anything is generated.
//
// `key` is `invoice:<id>` rather than a path, and the invoice is looked up
// SCOPED TO THIS BOOKING'S TRIP. A key is not a filename and must never be
// treated as one: accepting a path here would turn a customer link into a way
// to read arbitrary files.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidPortalToken, portalLinkState, portalVerifyCookieName, isPortalVerified, isCustomerFacingInvoice } from '@/lib/booking-portal'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { toCompanyInfo } from '@/lib/company-info-client'
import { renderHtmlToPdf } from '@/lib/documents/render'
import {
  buildProgramItineraryHtml,
  ProgramItineraryError,
} from '@/lib/documents/program-itinerary-doc'
import { loadJapaneseFont } from '@/lib/pdf-fonts-node'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; key: string }> }
) {
  const { token, key } = await params

  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  if (!isValidPortalToken(token)) return notFound()
  // Invoices are the most sensitive thing behind this token; the gate
  // cookie is required, same as the page.
  if (!isPortalVerified(token, request.cookies.get(portalVerifyCookieName(token))?.value)) {
    return NextResponse.json({ success: false, error: '本人確認が必要です。' }, { status: 403 })
  }

  const supabase = admin()

  const { data: link } = await supabase
    .from('booking_portal_links')
    .select('id, booking_id, org_id, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!portalLinkState(link).usable) return notFound()

  const decoded = decodeURIComponent(key)
  const colon = decoded.indexOf(':')
  const kind = colon === -1 ? decoded : decoded.slice(0, colon)
  const id = colon === -1 ? '' : decoded.slice(colon + 1)
  if (kind !== 'invoice' && kind !== 'nittei' && kind !== 'insurance-guide') return notFound()
  if (kind === 'invoice' && !id) return notFound()

  // ---------- the insurer's own brochure ----------
  // A fixed object per org, streamed through here rather than linked directly,
  // so every row of 書類 behaves the same way and the storage layout stays an
  // implementation detail. The file is the insurer's public leaflet — the
  // 共済金額表 and 掛金表 a customer reads before choosing — not customer data.
  if (kind === 'insurance-guide') {
    const { data: file, error } = await supabase.storage
      .from('documents')
      .download(`portal-documents/${link!.org_id}/insurance-guide.pdf`)
    if (error || !file) return notFound()
    return new NextResponse(new Uint8Array(await file.arrayBuffer()), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="insurance-guide.pdf"',
        // It changes once a year, not once a request.
        'Cache-Control': 'private, max-age=3600',
      },
    })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('itinerary_id, org_id, balance_due_date, start_date, client_name')
    .eq('id', link!.booking_id)
    .maybeSingle()

  if (!booking?.itinerary_id) return notFound()

  // ---------- 日程表 ----------
  // The same document, from the same builder, as the office's own button. The
  // departure date and the traveller come from the booking rather than from the
  // query string: a customer's own URL must not be able to restate the facts of
  // their trip. The office-held fields (guides, 作成者) are left blank — there is
  // nowhere on a booking that holds them yet.
  if (kind === 'nittei') {
    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('template_id, client_name')
      .eq('id', booking.itinerary_id)
      .eq('org_id', booking.org_id)
      .maybeSingle()

    if (!itinerary?.template_id) return notFound()

    try {
      const built = await buildProgramItineraryHtml({
        supabase,
        orgId: booking.org_id,
        templateId: itinerary.template_id as string,
        departure: {
          start_date: booking.start_date ?? null,
          cairo_guide: null,
          south_guide: null,
          author: null,
          customer_name: (itinerary.client_name as string | null) ?? booking.client_name ?? null,
        },
      })
      const pdf = await renderHtmlToPdf(built.html, built.page)
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${built.templateCode}-nittei.pdf"`,
        },
      })
    } catch (err) {
      if (err instanceof ProgramItineraryError) return notFound()
      console.error('portal 日程表 render failed:', err)
      return NextResponse.json({ success: false, error: 'Failed to generate' }, { status: 500 })
    }
  }

  // Scoped to the trip this link belongs to. Without the itinerary_id filter a
  // valid token would fetch any invoice whose id somebody guessed.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('itinerary_id', booking.itinerary_id)
    .eq('org_id', booking.org_id)
    .maybeSingle()

  if (!invoice) return notFound()

  // The page stopped listing drafts and cancellations; this route has to agree,
  // or an old URL (or a guessed id inside this trip) still serves one.
  if (!isCustomerFacingInvoice(invoice.status)) return notFound()

  const { data: org } = await supabase
    .from('organizations')
    .select('name, contact_email, company_phone, company_website, company_address, offices')
    .eq('id', booking.org_id)
    .maybeSingle()

  try {
    // jsPDF's built-in faces are Latin-only, so a Japanese client name comes
    // out as mojibake without this — on the customer's own invoice.
    const font = await loadJapaneseFont()

    // The generator labels the balance with its due date, but reads that from
    // the INVOICE — and there is no such column; the payment schedule lives on
    // the booking. Without this the label silently falls back to a bare
    // "Balance", which is the one thing the date was added to avoid.
    const withSchedule = { ...invoice, balance_due_date: booking.balance_due_date ?? null }

    const doc = generateInvoicePDF(
      withSchedule as never,
      // Through the shared mapper, so the customer's copy of an invoice carries
      // the same letterhead as the office's copy of the same invoice.
      toCompanyInfo(org),
      { font }
    )
    const pdf = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdf as never, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
        'Content-Length': String(pdf.length),
        // A customer document is not something a shared cache should keep.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Portal document render failed:', error)
    return NextResponse.json({ error: 'Could not produce the document' }, { status: 500 })
  }
}
