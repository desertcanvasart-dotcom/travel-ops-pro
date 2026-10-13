// ============================================
// The margin a B2B calculator quote is priced at
// ============================================
// The calculator never told the engine which partner the quote was for: the
// partner was picked only in the Save dialog, after the price was on screen,
// and POST /api/b2b/quotes re-priced without it. So a partner's own margin
// (b2b_partners.default_margin_percent, or its per-variation
// b2b_partner_pricing.margin_percent_override) never reached a calculator
// quote — and had the server used it, the save would have been refused as a
// moved price.
//
// One rule, run by the engine (/api/b2b/calculate-price) for the screen and
// for the save's re-price alike, so both arrive at the same number:
//
//   the margin the operator typed or stepped     wins, always
//   the partner's margin for this variation      b2b_partner_pricing
//   the partner's default margin                 b2b_partners
//   the company's default margin, else 25        lib/org-default-margin
//
// A partner margin of 0 (or none) counts as "not set", as it always has in
// the engine and in quote-from-itinerary: the Partners form stores 0 for a
// blank field.

import { normaliseMargin, resolveMarginPercent } from '@/lib/org-default-margin'

/** A partner's stored margin, or null when it sets none. */
export function partnerMarginValue(v: unknown): number | null {
  const n = normaliseMargin(v)
  return n !== null && n > 0 ? n : null
}

export function quoteMarginPercent(input: {
  requested?: unknown
  partnerOverride?: unknown
  partnerDefault?: unknown
  orgDefault?: unknown
}): number {
  const requested = normaliseMargin(input.requested)
  if (requested !== null) return requested
  const partner = partnerMarginValue(input.partnerOverride) ?? partnerMarginValue(input.partnerDefault)
  if (partner !== null) return partner
  return resolveMarginPercent({ orgDefault: input.orgDefault })
}
