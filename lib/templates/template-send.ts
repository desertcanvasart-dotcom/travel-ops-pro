// ============================================
// Filling a message template for one recipient
// ============================================
// The Templates page's Send dialog: who a template goes to (by its category),
// which {{placeholders}} it needs filled, and what the chosen recipient and
// linked itinerary fill in. Pure, so the rules are tested without the page.

export type RecipientKind = 'partner' | 'supplier' | 'client'

/**
 * Who a template is addressed to. 'partner' and 'b2b' templates both go to a
 * B2B partner (a travel agency, /api/b2b/partners) — 'b2b' used to fall
 * through to the client list, so a quote meant for an agency was offered to
 * the operator's own travellers.
 */
export function recipientKind(category: string | null | undefined): RecipientKind {
  if (category === 'partner' || category === 'b2b') return 'partner'
  if (category === 'supplier') return 'supplier'
  return 'client'
}

/** Every distinct {{Placeholder}} in the body and the subject, body first. */
export function templatePlaceholders(body: string | null | undefined, subject?: string | null): string[] {
  const found = [...(body ?? '').matchAll(/\{\{[^}]+\}\}/g), ...(subject ?? '').matchAll(/\{\{[^}]+\}\}/g)]
  return [...new Set(found.map(m => m[0]))]
}

export interface TemplateRecipient {
  name: string
  email?: string | null
  phone?: string | null
  /** The person at a partner agency (b2b_partners.contact_name). */
  contactName?: string | null
}

/** The placeholder values the chosen recipient fills, keyed '{{Key}}'. */
export function recipientPlaceholderValues(category: string | null | undefined, r: TemplateRecipient): Record<string, string> {
  const values: Record<string, string> = {}
  const kind = recipientKind(category)
  if (kind === 'partner') {
    const contact = r.contactName || r.name || ''
    values['{{PartnerName}}'] = r.name || ''
    values['{{PartnerCompany}}'] = r.name || ''
    values['{{PartnerEmail}}'] = r.email || ''
    values['{{PartnerPhone}}'] = r.phone || ''
    values['{{ContactName}}'] = contact
    values['{{PartnerContactName}}'] = contact
    // The seeded B2B templates open "Dear {{AgentName}}" — the partner
    // agency's travel agent, not our staff member. Everywhere else AgentName
    // is the sender (itinerary template-data); for a 'b2b' template it is the
    // addressee.
    if (category === 'b2b') values['{{AgentName}}'] = contact
  } else if (kind === 'supplier') {
    values['{{ProviderName}}'] = r.name || ''
    values['{{HotelName}}'] = r.name || ''
    values['{{CruiseName}}'] = r.name || ''
    values['{{SupplierName}}'] = r.name || ''
    values['{{GuideName}}'] = r.name || ''
    values['{{SupplierEmail}}'] = r.email || ''
    values['{{SupplierPhone}}'] = r.phone || ''
    values['{{SupplierWhatsApp}}'] = r.phone || ''
    values['{{ContactName}}'] = r.name || ''
  } else {
    values['{{GuestName}}'] = r.name || ''
    values['{{ClientName}}'] = r.name || ''
    values['{{ClientPhone}}'] = r.phone || ''
    values['{{ClientEmail}}'] = r.email || ''
  }
  return values
}

/**
 * The itinerary's template-data as '{{Key}}' values. Its AgentName is the
 * signed-in staff member; a 'b2b' template's AgentName is the partner's agent
 * (above), so the itinerary must not fill it with ours.
 */
export function itineraryPlaceholderValues(category: string | null | undefined, data: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (category === 'b2b' && key === 'AgentName') continue
    values[`{{${key}}}`] = value == null ? '' : String(value)
  }
  return values
}
