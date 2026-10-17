// ============================================
// "Create client" from a conversation — what the new-client form is given
// ============================================
// The contact of a WhatsApp conversation is the phone number and of an email
// conversation the address. A portal thread's or trip chat's contact_info is
// the BOOKING CODE, so it went into the form's Email box; for those the
// client's email is the booking's / trip's client_email (when there is one).
// Pure, so tested.

import type { UnifiedConversation } from '@/types/unified'

export function createClientHref(
  conversation: Pick<UnifiedConversation, 'channel' | 'contact_info' | 'client_email' | 'subject'>,
  name: string,
): string {
  const params = new URLSearchParams()
  if (conversation.channel === 'whatsapp') {
    params.set('phone', conversation.contact_info || '')
  } else if (conversation.channel === 'email') {
    params.set('email', conversation.contact_info || '')
  } else if (conversation.client_email) {
    params.set('email', conversation.client_email)
  }
  if (name) params.set('name', name)
  params.set('source', conversation.channel)
  if (conversation.subject) params.set('subject', conversation.subject)
  return `/clients/new?${params.toString()}`
}
