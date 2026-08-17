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
import { isValidPortalToken, portalLinkState, portalVerifyCookieName, isPortalVerified } from '@/lib/booking-portal'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
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

  const [kind, id] = decodeURIComponent(key).split(':')
  if (kind !== 'invoice' || !id) return notFound()

  const { data: booking } = await supabase
    .from('bookings')
    .select('itinerary_id, org_id, balance_due_date')
    .eq('id', link!.booking_id)
    .maybeSingle()

  if (!booking?.itinerary_id) return notFound()

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

  const { data: org } = await supabase
    .from('organizations')
    .select('name, contact_email, company_phone, company_website, company_address')
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
      org
        ? {
            name: org.name,
            address: (org as any).company_address ?? '',
            city: '',
            country: '',
            email: org.contact_email ?? '',
            phone: org.company_phone ?? '',
            website: org.company_website ?? '',
          }
        : undefined,
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
