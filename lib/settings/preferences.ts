// ============================================
// Settings › Preferences — what a save stores
// ============================================
// Pure, so it is tested without a database (__tests__/api/user-preferences-margin.test.ts).

import { normaliseMargin } from '@/lib/org-default-margin'

/**
 * The margin a Preferences save writes, or nothing.
 *
 * A person with no margin of their own FOLLOWS the company's
 * (organizations.default_margin_percent): GET shows them the company's figure
 * with margin_follows_company = true. Saving used to write that figure back as
 * their own — change only the currency, and today's company margin was frozen
 * onto them, deaf to every later Company Profile change. Now:
 *   margin_follows_company === true  → null (follow the company);
 *   default_margin_percent sent      → that margin (0–100; anything else null);
 *   neither                          → not written (an existing row keeps its
 *                                      value, a new row starts at null).
 */
export function marginToStore(body: Record<string, unknown>): { write: false } | { write: true; value: number | null } {
  if (body.margin_follows_company === true) return { write: true, value: null }
  if ('default_margin_percent' in body) return { write: true, value: normaliseMargin(body.default_margin_percent) }
  return { write: false }
}
