// ============================================================================
// A message longer than one WhatsApp message may be
// ============================================================================
// Twilio refuses a WhatsApp body over 1,600 characters, so a long reply or a
// pasted itinerary failed and the sender had to cut it up by hand. The app now
// does the cutting: at a paragraph break when one fits, else a line break,
// else the end of a sentence, else a space — never mid-word unless a single
// "word" is longer than the limit (a long link), and never inside an emoji.
//
// Pure, and safe to use in the browser. Ported from autoura-saas #813.

export const TWILIO_TEXT_LIMIT = 1600

/** The parts, in order, each at most `limit` characters; [] for an empty text. */
export function splitWhatsAppText(text: string, limit: number = TWILIO_TEXT_LIMIT): string[] {
  const body = String(text ?? '')
  if (!body.trim()) return []
  if (body.length <= limit) return [body]

  const parts: string[] = []
  let rest = body
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1)
    const cut = lastBreak(window, limit)
    const part = rest.slice(0, cut).trimEnd()
    if (part) parts.push(part)
    rest = rest.slice(cut).replace(/^\s+/, '')
  }
  if (rest.trim()) parts.push(rest)
  return parts
}

/** Where to cut `window` (its first `limit` characters may be kept). */
function lastBreak(window: string, limit: number): number {
  // Not so early that the first part is a sliver: at least a third of the limit.
  const floor = Math.floor(limit / 3)
  const candidates: RegExp[] = [/\n\s*\n/g, /\n/g, /[.!?。！？](?=\s)/g, /\s/g]
  for (const pattern of candidates) {
    let best = -1
    for (const m of window.matchAll(pattern)) {
      const end = (m.index ?? 0) + m[0].length
      if (end <= limit && end >= floor) best = end
    }
    if (best > 0) return best
  }
  // A hard cut: step back off the second half of a surrogate pair (an emoji).
  const code = window.charCodeAt(limit - 1)
  return code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit
}

type SendResult = { success: boolean; messageId?: string; error?: string; warning?: string }

/**
 * Send `parts` one after another, in order, stopping at the first failure.
 * The first part failing is that failure; a later one is a success with a
 * warning saying how many parts went, so the sender knows the rest did not.
 */
export async function sendInParts<R extends SendResult>(
  parts: string[],
  sendOne: (body: string, index: number) => Promise<R>,
): Promise<R> {
  let first: R | null = null
  for (let i = 0; i < parts.length; i++) {
    const sent = await sendOne(parts[i], i)
    if (!sent.success) {
      if (!first) return sent
      return { ...first, warning: `Only ${i} of ${parts.length} parts were sent: ${sent.error ?? 'unknown error'}` }
    }
    first ??= sent
  }
  if (!first) return { success: false, error: 'Nothing to send' } as R
  return parts.length > 1
    ? { ...first, warning: `Sent as ${parts.length} messages (WhatsApp allows ${TWILIO_TEXT_LIMIT.toLocaleString('en-US')} characters in one).` }
    : first
}
