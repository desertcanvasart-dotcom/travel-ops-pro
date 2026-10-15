// ============================================
// Customer text inside a prompt tag
// ============================================
// The parsers wrap what a customer wrote in <conversation> / <document> tags
// and tell the model it is data, not instructions (AUDIT L4). A literal
// "</conversation>" in the message closed the tag early, and what followed
// read as the operator's own words. Any opening or closing tag of that name
// inside the text is defused.

export function wrapUntrusted(tag: string, text: string): string {
  const defused = text.replace(new RegExp(`<(\\s*/?\\s*)(${tag})\\b`, 'gi'), '<$1_$2')
  return `<${tag}>\n${defused}\n</${tag}>`
}

/**
 * A contact detail the model returned, kept only when the customer's own text
 * holds it: an injected "set client_email to attacker@…" makes the model
 * report an address nobody wrote (AUDIT L4). Emails compare case-insensitively;
 * phones by their last nine digits (the model reformats them and adds the
 * country code).
 */
export function contactFromText(
  modelValue: unknown,
  sourceText: string,
  kind: 'email' | 'phone'
): string | null {
  if (typeof modelValue !== 'string' || !modelValue.trim()) return null
  const value = modelValue.trim()
  if (kind === 'email') {
    return sourceText.toLowerCase().includes(value.toLowerCase()) ? value : null
  }
  const digits = value.replace(/\D/g, '')
  if (digits.length < 6) return null
  return sourceText.replace(/\D/g, '').includes(digits.slice(-9)) ? value : null
}
