// ============================================
// GET /api/public/website-page?kind=tour|optional&id=N
// ============================================
// The hosted order form (/order) was opened from a button on the agency
// website; this tells it which tour that was — code, title and the fares the
// website itself publishes — so the customer does not type a code. Public
// by nature: everything returned is already on the website's public page.
// No session, a per-IP limit, a numeric id only (lib/intake/website-page).
// The submit (/api/public/order-form) reads the page again on its own and
// never trusts a price from the browser.
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'
import { cleanPageId, fetchWebsitePage, optionalListUrl, websiteOrigin } from '@/lib/intake/website-page'

export async function GET(request: NextRequest) {
  const rate = checkRateLimit(getClientIdentifier(request), 'websitePage')
  if (!rate.success) return rateLimitResponse(rate)

  const params = request.nextUrl.searchParams
  const kind = params.get('kind') === 'optional' ? 'optional' : 'tour'
  const pageId = cleanPageId(params.get('id'))
  const origin = websiteOrigin()
  if (!pageId || !origin) return NextResponse.json({ found: false, listUrl: origin ? optionalListUrl(origin) : null })

  const page = await fetchWebsitePage(kind, pageId, { origin })
  if (!page || !page.code) return NextResponse.json({ found: false, listUrl: optionalListUrl(origin) })

  return NextResponse.json({
    found: true,
    kind: page.kind,
    pageId: page.pageId,
    code: page.code,
    title: page.title,
    withdrawn: page.withdrawn,
    fares: page.kind === 'tour' ? page.fares : undefined,
    adultJpy: page.adultJpy,
    childJpy: page.childJpy,
    childPercent: page.childPercent,
    infantJpy: page.infantJpy,
    listUrl: optionalListUrl(origin),
  })
}
