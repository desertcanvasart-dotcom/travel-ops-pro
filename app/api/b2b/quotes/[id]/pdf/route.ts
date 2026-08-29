import { NextRequest, NextResponse } from 'next/server'
import { quoteInOrg, quoteNotFound } from '@/lib/b2b/quote-scope'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { getServerLocale, lookupServerMessage } from '@/lib/i18n/server-messages'
import { getJapaneseFontFace } from '@/lib/pdf-fonts-server'
import { currencySymbol } from '@/lib/currency-totals'
import { escapeHtml as esc } from '@/lib/html-escape'
import { businessIdentity, identityFromOrg, mergeIdentity, monogram, type OrgIdentity } from '@/lib/org-identity'

// ============================================
// B2B QUOTE PDF GENERATION
// File: app/api/b2b/quotes/[id]/pdf/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Locale-aware date helper. Caller passes locale; en-US for English,
// ja-JP for Japanese — matches the rest of the app's date display.
function formatDate(dateStr: string, locale: 'en' | 'ja', tbd: string, format: 'long' | 'short' = 'long'): string {
  if (!dateStr) return tbd
  const date = new Date(dateStr)
  const tag = locale === 'ja' ? 'ja-JP' : 'en-US'
  if (format === 'short') {
    return date.toLocaleDateString(tag, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return date.toLocaleDateString(tag, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

// Generate HTML template. labels is a pre-localized dict from getServerLocale +
// lookupServerMessage at the route handler. Font is base64-embedded via
// @font-face — no system-font dependency, no CDN.
/** Whose paper this is. Passed in rather than read here, because the route
 *  already knows which organization it is acting for. */
async function generateQuoteHTML(quote: any, locale: 'en' | 'ja', labels: Record<string, string>, operator: OrgIdentity): Promise<string> {
  // Every amount on the PDF is in the quote's own currency (the org's rate currency since #148).
  const sym = currencySymbol(quote.currency || 'EUR')
  const tag = locale === 'ja' ? 'ja-JP' : 'en-US'
  const today = new Date().toLocaleDateString(tag, { year: 'numeric', month: 'short', day: 'numeric' })
  const template = quote.tour_variations?.tour_templates
  const variation = quote.tour_variations
  const partner = quote.b2b_partners
  const services = quote.services_snapshot || []
  const tbd = labels.tbd
  const fontFace = await getJapaneseFontFace()

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(quote.quote_number)} - Quote</title>
  <style>
    ${fontFace}
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'NotoSansJP', 'Inter', sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1f2937;
      background: white;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 18mm;
      margin: 0 auto;
      background: white;
    }
    
    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .logo-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .logo-circle {
      width: 45px;
      height: 45px;
      background: linear-gradient(135deg, #647C47, #4a5c35);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 14pt;
    }
    
    .company-info h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #1f2937;
      letter-spacing: 0.5px;
    }
    
    .company-info p {
      font-size: 9pt;
      color: #6b7280;
      margin-top: 2px;
    }
    
    .quote-box {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 15px;
      text-align: right;
    }
    
    .quote-number {
      font-size: 12pt;
      font-weight: 700;
      color: #647C47;
    }
    
    .quote-dates {
      font-size: 8pt;
      color: #6b7280;
      margin-top: 4px;
    }
    
    /* Section Headers */
    .section-header {
      font-size: 11pt;
      font-weight: 700;
      color: #1f2937;
      margin: 20px 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Info Cards */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .info-card {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 15px;
    }
    
    .info-card h4 {
      font-size: 8pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    
    .info-card p {
      font-size: 10pt;
      font-weight: 600;
      color: #1f2937;
    }
    
    .info-card .secondary {
      font-size: 9pt;
      font-weight: 400;
      color: #6b7280;
      margin-top: 2px;
    }
    
    /* Tour Banner */
    .tour-banner {
      background: linear-gradient(135deg, #647C47, #4a5c35);
      color: white;
      border-radius: 8px;
      padding: 18px 20px;
      margin: 20px 0;
    }
    
    .tour-banner h2 {
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    
    .tour-banner p {
      font-size: 10pt;
      opacity: 0.9;
      margin-top: 5px;
    }
    
    .tour-meta {
      display: flex;
      gap: 20px;
      margin-top: 12px;
    }
    
    .tour-meta-item {
      background: rgba(255,255,255,0.15);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 9pt;
    }
    
    /* Pricing Table */
    .pricing-section {
      margin: 20px 0;
    }
    
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .pricing-table th {
      background: linear-gradient(135deg, #647C47, #4a5c35);
      color: white;
      padding: 10px 12px;
      text-align: left;
      font-size: 9pt;
      font-weight: 600;
    }
    
    .pricing-table th:nth-child(2),
    .pricing-table th:nth-child(3),
    .pricing-table th:nth-child(4) {
      text-align: right;
    }
    
    .pricing-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 9pt;
    }
    
    .pricing-table td:nth-child(2),
    .pricing-table td:nth-child(3),
    .pricing-table td:nth-child(4) {
      text-align: right;
    }
    
    .pricing-table tr:nth-child(even) {
      background: #f9fafb;
    }
    
    /* Total Section */
    .totals-section {
      margin-top: 20px;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 10pt;
    }
    
    .totals-row.highlight {
      background: linear-gradient(135deg, #647C47, #4a5c35);
      color: white;
      padding: 12px 15px;
      border-radius: 6px;
      margin-top: 10px;
      border: none;
    }
    
    .totals-row.highlight .label {
      font-weight: 600;
    }
    
    .totals-row.highlight .value {
      font-size: 14pt;
      font-weight: 700;
    }
    
    .per-person-note {
      text-align: right;
      font-size: 9pt;
      color: #6b7280;
      margin-top: 8px;
    }
    
    .single-supplement {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 10px 15px;
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .single-supplement .label {
      font-size: 9pt;
      color: #92400e;
    }
    
    .single-supplement .value {
      font-size: 11pt;
      font-weight: 700;
      color: #92400e;
    }
    
    /* Tour Leader Badge */
    .tour-leader-badge {
      background: #dbeafe;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      padding: 10px 15px;
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .tour-leader-badge .label {
      font-size: 9pt;
      color: #1e40af;
    }
    
    .tour-leader-badge .value {
      font-size: 10pt;
      font-weight: 600;
      color: #1e40af;
    }
    
    /* Terms Section */
    .terms-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 15px;
    }
    
    .terms-column h4 {
      font-size: 9pt;
      font-weight: 600;
      margin-bottom: 6px;
      color: #1f2937;
    }
    
    .terms-column ul {
      list-style: none;
      padding: 0;
    }
    
    .terms-column li {
      font-size: 8pt;
      color: #6b7280;
      padding: 2px 0;
      padding-left: 12px;
      position: relative;
    }
    
    .terms-column li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #647C47;
    }
    
    /* Notes */
    .notes-section {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 15px;
      margin-top: 20px;
    }
    
    .notes-section h4 {
      font-size: 9pt;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 5px;
    }
    
    .notes-section p {
      font-size: 9pt;
      color: #6b7280;
    }
    
    /* Footer */
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
    }
    
    .footer-card {
      background: #f8fafc;
      border-radius: 8px;
      padding: 15px;
    }
    
    .footer h3 {
      font-size: 11pt;
      font-weight: 700;
      color: #647C47;
    }
    
    .footer p {
      font-size: 8pt;
      color: #6b7280;
      margin: 4px 0;
    }
    
    .footer .tagline {
      font-style: italic;
      margin-top: 8px;
    }
    
    @media print {
      .page {
        width: 100%;
        padding: 10mm 15mm;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <header class="header">
      <div class="logo-section">
        ${operator.name ? `<div class="logo-circle">${esc(monogram(operator.name))}</div>` : ''}
        <div class="company-info">
          ${operator.name ? `<h1>${esc(operator.name)}</h1>` : ''}
          <p>${labels.subtitle}</p>
        </div>
      </div>
      <div class="quote-box">
        <div class="quote-number">${esc(quote.quote_number)}</div>
        <div class="quote-dates">
          ${labels.issued}: ${today}<br>
          ${labels.validUntil}: ${formatDate(quote.valid_until, locale, tbd, 'short')}
        </div>
      </div>
    </header>

    <!-- Partner & Client Info -->
    <div class="info-grid">
      ${partner ? `
      <div class="info-card">
        <h4>${labels.partner}</h4>
        <p>${esc(partner.company_name)}</p>
        <p class="secondary">${esc(partner.partner_code)}</p>
        ${partner.contact_name ? `<p class="secondary">${esc(partner.contact_name)}</p>` : ''}
      </div>
      ` : `
      <div class="info-card">
        <h4>${labels.quoteType}</h4>
        <p>${labels.directClient}</p>
      </div>
      `}

      <div class="info-card">
        <h4>${labels.client}</h4>
        <p>${esc(quote.client_name || labels.clientTBC)}</p>
        ${quote.client_email ? `<p class="secondary">${esc(quote.client_email)}</p>` : ''}
        ${quote.client_phone ? `<p class="secondary">${esc(quote.client_phone)}</p>` : ''}
        ${quote.client_nationality ? `<p class="secondary">${esc(quote.client_nationality)}</p>` : ''}
      </div>
    </div>
    
    <!-- Tour Banner -->
    <div class="tour-banner">
      <h2>${template?.template_name || quote.trip_name || labels.tourPackage}</h2>
      <p>${variation?.variation_name || (quote.source === 'whatsapp_b2b' ? labels.customTourWhatsApp : '')}</p>
      <div class="tour-meta">
        <div class="tour-meta-item">
          📅 ${labels.daysNights.replace('{days}', String(template?.duration_days || quote.itineraries?.total_days || '-')).replace('{nights}', String(template?.duration_nights || (quote.itineraries?.total_days ? quote.itineraries.total_days - 1 : '-')))}
        </div>
        <div class="tour-meta-item">
          👥 ${(quote.tour_leader_included ? labels.paxWithLeader : labels.paxLabel).replace('{pax}', String(quote.num_adults))}
        </div>
        <div class="tour-meta-item">
          🗓️ ${quote.travel_date ? formatDate(quote.travel_date, locale, tbd, 'short') : tbd}
        </div>
        <div class="tour-meta-item">
          🌡️ ${quote.season ? labels.seasonSuffix.replace('{name}', quote.season.charAt(0).toUpperCase() + quote.season.slice(1)) : '-'}
        </div>
      </div>
    </div>

    <!-- Services Breakdown -->
    ${services.length > 0 ? `
    <div class="section-header">${labels.servicesIncluded}</div>
    <div class="pricing-section">
      <table class="pricing-table">
        <thead>
          <tr>
            <th>${labels.tableService}</th>
            <th>${labels.tableQty}</th>
            <th>${labels.tableRate}</th>
            <th>${labels.tableTotal}</th>
          </tr>
        </thead>
        <tbody>
          ${services.slice(0, 20).map((service: any) => `
            <tr>
              <td>${esc(service.service_name || labels.fallbackService)}</td>
              <td>${service.quantity || 1}</td>
              <td>${sym}${(service.unit_cost || 0).toFixed(2)}</td>
              <td><strong>${sym}${(service.line_total || 0).toFixed(2)}</strong></td>
            </tr>
          `).join('')}
          ${services.length > 20 ? `
            <tr>
              <td colspan="4" style="text-align: center; color: #6b7280; font-style: italic;">
                ... ${services.length - 20}+
              </td>
            </tr>
          ` : ''}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Pricing Summary -->
    <div class="section-header">${labels.pricingSummary}</div>
    <div class="totals-section">
      <div class="totals-row">
        <span>${labels.subtotalCost}</span>
        <span>${sym}${(quote.total_cost || 0).toFixed(2)}</span>
      </div>
      <div class="totals-row">
        <span>${labels.marginPercent.replace('{percent}', String(quote.margin_percent || 0))}</span>
        <span>${sym}${(quote.margin_amount || 0).toFixed(2)}</span>
      </div>
      <div class="totals-row highlight">
        <span class="label">${labels.tableTotal.toUpperCase()}</span>
        <span class="value">${sym}${(quote.selling_price || 0).toFixed(2)}</span>
      </div>
    </div>

    <div class="per-person-note">
      ${labels.tableRate}: <strong>${sym}${(quote.price_per_person || 0).toFixed(2)}</strong>
    </div>

    ${quote.tour_leader_included && quote.tour_leader_cost ? `
    <div class="tour-leader-badge">
      <span class="label">${labels.tourLeaderIncluded}</span>
      <span class="value">${sym}${quote.tour_leader_cost.toFixed(2)}</span>
    </div>
    ` : ''}

    ${quote.single_supplement && quote.single_supplement > 0 ? `
    <div class="single-supplement">
      <span class="label">${labels.singleSupplement}</span>
      <span class="value">${sym}${quote.single_supplement.toFixed(2)}</span>
    </div>
    ` : ''}
    
    <!-- Notes -->
    ${quote.notes ? `
    <div class="notes-section">
      <h4>${labels.notes}</h4>
      <p>${esc(quote.notes)}</p>
    </div>
    ` : ''}

    <!-- Terms -->
    <div class="section-header">${labels.termsConditions}</div>
    <div class="terms-grid">
      <div class="terms-column">
        <h4>${labels.paymentTerms}</h4>
        <ul>
          <li>${labels.paymentDeposit}</li>
          <li>${labels.paymentBalance}</li>
          <li>${labels.paymentMethods}</li>
        </ul>
        <h4 style="margin-top: 12px;">${labels.cancellationPolicy}</h4>
        <ul>
          <li>${labels.cancelGenerous}</li>
          <li>${labels.cancelMedium}</li>
          <li>${labels.cancelShort}</li>
        </ul>
      </div>
      <div class="terms-column">
        <h4>${labels.priceIncludes}</h4>
        <ul>
          <li>${labels.includesItinerary}</li>
          <li>${labels.includesGuide}</li>
          <li>${labels.includesEntranceFees}</li>
          <li>${labels.includesWater}</li>
        </ul>
        <h4 style="margin-top: 12px;">${labels.notIncluded}</h4>
        <ul>
          <li>${labels.excludesFlights}</li>
          <li>${labels.excludesPersonal}</li>
          <li>${labels.excludesInsurance}</li>
        </ul>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-card">
        ${operator.name ? `<h3>${esc(operator.name)}</h3>` : ''}
        ${(() => {
          const contact = [operator.email, operator.phone, operator.website]
            .filter(Boolean)
            .join(' • ')
          return contact ? `<p>${esc(contact)}</p>` : ''
        })()}
        ${operator.tagline ? `<p class="tagline">${esc(operator.tagline)}</p>` : ''}
      </div>
    </footer>
  </div>
</body>
</html>
`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // TENANT BOUNDARY — see lib/b2b/quote-scope.ts. The quote is addressed by an
    // id from the URL on a service-role client; without this, one organisation
    // reaches another's quote.
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()

    // Fetch quote with related data
    const { data: quote, error } = await supabaseAdmin
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (
          variation_name, variation_code, tier, group_type,
          inclusions, exclusions,
          tour_templates (
            template_name, template_code, duration_days, duration_nights,
            short_description
          )
        ),
        b2b_partners (company_name, partner_code, contact_name, email),
        itineraries (trip_name, itinerary_code, total_days, tier)
      `)
      .eq('id', id)
      .single()

    let finalQuote = quote
    if (error || !quote) {
      // Fallback without itineraries join if schema cache is stale
      const fallback = await supabaseAdmin
        .from('tour_quotes')
        .select(`
          *,
          tour_variations (
            variation_name, variation_code, tier, group_type,
            inclusions, exclusions,
            tour_templates (
              template_name, template_code, duration_days, duration_nights,
              short_description
            )
          ),
          b2b_partners (company_name, partner_code, contact_name, email)
        `)
        .eq('id', id)
        .single()

      if (fallback.error || !fallback.data) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
      }
      finalQuote = { ...fallback.data, itineraries: null }
    }

    // Output gate (harness Layer 2): never render a customer PDF for a
    // non-deliverable price.
    const priceCheck = checkAmountDeliverable(finalQuote.selling_price, { currency: finalQuote.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { error: 'Quote price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // Resolve operator locale from cookie (next-intl source of truth).
    const locale = await getServerLocale()

    // Build the per-locale labels dictionary in one place — picks the right
    // JA or EN string for every section heading + bullet point in the
    // template.
    const labelKeys = [
      'brand', 'subtitle', 'issued', 'validUntil', 'partner', 'quoteType',
      'directClient', 'client', 'clientTBC', 'tourPackage', 'customTourWhatsApp',
      'daysNights', 'paxLabel', 'paxWithLeader', 'tbd', 'seasonSuffix',
      'servicesIncluded', 'tableService', 'tableQty', 'tableRate', 'tableTotal',
      'fallbackService', 'pricingSummary', 'subtotalCost', 'marginPercent',
      'tourLeaderIncluded', 'singleSupplement', 'notes', 'termsConditions',
      'paymentTerms', 'paymentDeposit', 'paymentBalance', 'paymentMethods',
      'cancellationPolicy', 'cancelGenerous', 'cancelMedium', 'cancelShort',
      'priceIncludes', 'includesItinerary', 'includesGuide', 'includesEntranceFees',
      'includesWater', 'notIncluded', 'excludesFlights', 'excludesPersonal',
      'excludesInsurance',
      // NOT here any more: brand, footerBrand, footerContact, footerTagline.
      // A company's name, phone number and tagline are not translations of
      // anything — they were the first operator's, printed on every agency's
      // quote in both languages, with a real phone number a customer would
      // ring. They come from the organization now.
    ]
    const labels: Record<string, string> = Object.fromEntries(
      labelKeys.map(k => [k, lookupServerMessage(locale, `pdf.b2b.${k}`)])
    )

    // The letterhead. One read: the row answers name, contact details AND
    // tagline, and mergeIdentity fills any field the operator left blank from
    // BUSINESS_* — exactly what orgIdentity() would do, without a second query.
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle()
    const operator = orgRow
      ? mergeIdentity(identityFromOrg(orgRow as Record<string, unknown>), businessIdentity())
      : businessIdentity()

    // Generate HTML
    const html = await generateQuoteHTML(finalQuote, locale, labels, operator)

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none'
      ]
    })
    
    try {
    const page = await browser.newPage()

    // SSRF GUARD. The template inlines its fonts and logo as data URIs, so a
    // genuine render fetches nothing over the network. Abort every request that
    // is not the in-memory document or a data: URI — otherwise markup smuggled
    // into a quote field (client name, notes, a service description) could make
    // THIS SERVER fetch an internal URL and render the response into the PDF.
    await page.setRequestInterception(true)
    page.on('request', req => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) return void req.continue()
      const scheme = req.url().split(':', 1)[0]
      if (scheme === 'data') return void req.continue()
      void req.abort()
    })

    // NOT networkidle0 — puppeteer 25 dropped it from setContent, and it was
    // the wrong signal anyway: this template inlines its fonts, so there is no
    // network to go idle. document.fonts.ready is the settled signal that
    // matters (the same conclusion lib/documents/render.ts reached in prod).
    await page.setContent(html, { waitUntil: 'domcontentloaded' })

    // Wait for fonts to fully load
    await page.evaluateHandle('document.fonts.ready')
    
    // Generate PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '15mm',
        left: '10mm'
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; font-size: 8pt; color: #9ca3af; text-align: center; padding: 5mm 0;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `
    })
    
    // Return PDF
    const safeName = String(finalQuote.quote_number ?? 'quote').replace(/[^A-Za-z0-9._-]/g, '_')
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      },
    })
    } finally {
      // ALWAYS. This close used to sit on the success path, so any throw in
      // setContent or page.pdf leaked a Chromium process for the life of the
      // container.
      await browser.close()
    }

  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}