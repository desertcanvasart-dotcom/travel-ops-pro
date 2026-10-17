// ============================================
// The B2B quote PDF's price block, with its VAT line
// ============================================
// The PDF printed one figure, TOTAL. With VAT recorded on the quote
// (lib/vat.ts) the block always says which it is: without VAT, the total and
// "VAT not applied"; with it, the net price, "VAT 14% included: …" and the
// total including VAT as the highlighted figure. Kept apart from the route
// (which needs Puppeteer) so both states can be rendered in a test.

import { formatMoney } from '@/lib/currency-totals'
import { escapeHtml as esc } from '@/lib/html-escape'
import { netPriceLabel, readVat, totalInclVatLabel, totalWithVat, vatMarker } from '@/lib/vat'

export function quotePdfTotalsHtml(
  quote: { selling_price?: unknown; currency?: string | null; vat_applied?: unknown; vat_rate?: unknown; vat_amount?: unknown; vat_base?: unknown },
  locale: 'en' | 'ja',
  totalLabel: string
): string {
  const currency = quote.currency || 'EUR'
  const money = (n: unknown) => formatMoney(Number(n) || 0, currency)
  const vat = readVat(quote)
  if (!vat.vat_applied) {
    return `
      <div class="totals-row highlight">
        <span class="label">${esc(totalLabel.toUpperCase())}</span>
        <span class="value">${money(quote.selling_price)}</span>
      </div>
      <div class="totals-row vat-row" data-vat="not-applied">
        <span class="label">${esc(vatMarker(vat, currency, locale))}</span>
      </div>`
  }
  return `
      <div class="totals-row">
        <span class="label">${esc(netPriceLabel(locale))}</span>
        <span class="value">${money(quote.selling_price)}</span>
      </div>
      <div class="totals-row vat-row" data-vat="applied">
        <span class="label">${esc(vatMarker(vat, currency, locale))}</span>
      </div>
      <div class="totals-row highlight">
        <span class="label">${esc(totalInclVatLabel(locale).toUpperCase())}</span>
        <span class="value">${money(totalWithVat(quote.selling_price, vat, currency))}</span>
      </div>`
}
