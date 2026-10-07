// ============================================
// A wa.me link, safe in the browser
// ============================================
// The same two helpers lib/communication-utils exports, without that file's
// server-only imports (org identity, server messages → next/headers): a
// Client Component that imports communication-utils fails the production
// build. Egyptian local numbers ('01…') become international ('201…').

export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '')
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('01')) cleaned = '+20' + cleaned.substring(1)
    else if (cleaned.startsWith('1') && cleaned.length === 11) cleaned = '+20' + cleaned
  }
  return cleaned.replace(/^\+/, '')
}

export function generateWhatsAppLink(phoneNumber: string, message: string): string {
  return `https://wa.me/${phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}
