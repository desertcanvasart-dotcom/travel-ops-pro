// ============================================
// One phone format for WhatsApp threads: E.164
// ============================================
// The webhook keys a thread by Twilio's sender, "+819012345678". Starting a
// chat stored whatever was typed with only the punctuation stripped —
// "81 90 1234 5678" became "819012345678" — so the customer's reply found no
// thread and opened a second one. "090-1234-5678" was sent to "+09012345678",
// a number that does not exist. Without a country code there is no way to
// know which country a 0-prefixed number is in, so it is refused, not guessed.

/** "+<country><number>", or null when the input is not an international number. */
export function toWhatsAppE164(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let s = input.normalize('NFKC').replace(/^whatsapp:/i, '').trim()
  if (s.startsWith('00')) s = '+' + s.slice(2)
  const plus = s.startsWith('+')
  const digits = s.replace(/\D/g, '')
  if (!plus && digits.startsWith('0')) return null
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null
  return '+' + digits
}

export const PHONE_NEEDS_COUNTRY_CODE =
  'Enter the number with its country code, e.g. +81 90 1234 5678 or +20 100 123 4567.'
