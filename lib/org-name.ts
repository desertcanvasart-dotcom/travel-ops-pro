// ============================================
// The operator's name, as a customer should see it
// ============================================
// A new organization is seeded with a placeholder name. It is a useful label in
// a members list and an embarrassing one on an invoice — "Default Organization"
// went out on customer paperwork because nothing between the seed and the PDF
// knew the difference between a name and a stand-in.
//
// Same rule the invoice generator already applies to a missing company: blank
// beats fake. A document with no name looks unfinished, which it is; a document
// naming a company that does not exist looks wrong in a way the reader cannot
// diagnose.

/** Seeded or generic names that are not anybody's company. Compared
 *  case-insensitively and after trimming. */
const PLACEHOLDER_NAMES = new Set([
  'default organization',
  'default org',
  'my organization',
  'my company',
  'organization',
  'new organization',
  'untitled organization',
  'test organization',
])

/**
 * The name to print on customer-facing paper, or '' when the operator has not
 * set one. Every document goes through this rather than reading
 * organizations.name directly.
 */
export function customerFacingOrgName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return ''
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase()) ? '' : trimmed
}

/** Whether the operator still needs to set a real name — for nudging them in
 *  settings, which is the only place the placeholder is worth mentioning. */
export function isPlaceholderOrgName(name: string | null | undefined): boolean {
  return customerFacingOrgName(name) === ''
}
