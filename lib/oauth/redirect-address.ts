/**
 * The connect cookie (lib/oauth/csrf-nonce) is set on the address this page
 * is on, and Google returns to GOOGLE_REDIRECT_URI. When those differ
 * (autoura.net vs www.autoura.net, or the Railway address) the cookie never
 * reaches the callback and every attempt ends in "invalid_state". Say which
 * address to use instead of letting the person go through Google for nothing.
 * Origin is the page's own address (the browser sends it on this POST); no
 * Origin, no check.
 */
export function wrongAddressFor(origin: string | null, redirectUri: string | undefined): string | null {
  if (!origin || !redirectUri) return null
  try {
    const page = new URL(origin)
    const back = new URL(redirectUri)
    return page.host.toLowerCase() === back.host.toLowerCase() ? null : `${back.protocol}//${back.host}`
  } catch {
    return null
  }
}
